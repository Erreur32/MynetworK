import type { ApiResponse } from '../types/api';
import { useAuthStore } from '../stores/authStore';
import { PERMISSION_LABELS } from '../utils/permissions';
import { getBasePath } from '../utils/ingress';

// Extended response type for Freebox API errors
interface FreeboxErrorResponse {
  success: false;
  error_code?: string;
  missing_right?: string;
  msg?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const basePath = getBasePath();
    const url = basePath
      ? `${basePath}${this.baseUrl}${endpoint.startsWith('/') ? endpoint.slice(1) : endpoint}`
      : `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    
    // Get token from localStorage (JWT) or Freebox auth store
    // Use localStorage directly to avoid circular dependency
    let token: string | null = null;
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('dashboard_user_token');
    }
    // Note: Freebox token is handled separately via FreeboxApiService
    // JWT token is used for user authentication (new system)
    // Freebox routes use their own authentication mechanism
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    };

    try {
      // Log request for debugging (only in development)
      if (import.meta.env.DEV) {
        // console.log(`[API] ${method} ${url}`, { body: body ? JSON.stringify(body).substring(0, 100) : 'none', hasToken: !!token }); // Debug only
      }
      
      const response = await fetch(url, options);
      
      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      let data: any;
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // If not JSON, read as text for error details
        const text = await response.text();
        // Only log non-JSON responses in development
        if (import.meta.env.DEV) {
          console.error(`[API] Non-JSON response from ${method} ${url}:`, text);
        }
        return {
          success: false,
          error: {
            code: 'INVALID_RESPONSE',
            message: `Réponse invalide du serveur: ${response.status} ${response.statusText}`
          }
        };
      }

      // Check for Freebox auth_required error (session expired or permissions changed)
      if (data && !data.success && data.error_code === 'auth_required') {
        console.warn(`[API] Auth required for ${method} ${endpoint}: session expired or permissions changed`);

        // Mark user as logged out and trigger re-authentication
        useAuthStore.getState().handleSessionExpired();

        return {
          success: false,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Votre session a expiré. Reconnexion en cours...'
          }
        };
      }

      // Check for Freebox insufficient_rights error
      if (data && !data.success && data.error_code === 'insufficient_rights' && data.missing_right) {
        const freeboxError = data as FreeboxErrorResponse;
        const missingRight = freeboxError.missing_right;
        const permissionLabel = PERMISSION_LABELS[missingRight] || missingRight;

        // Only log in development mode to avoid console spam
        // Note: This is normal if the Freebox app doesn't have the required permissions
        // The user will be notified via the UI, so we don't need to spam the console
        if (import.meta.env.DEV) {
          // Only log once per session to avoid spam
          const logKey = `permission_warning_${missingRight}`;
          if (!(window as any)[logKey]) {
            console.warn(`[API] Insufficient rights for ${method} ${endpoint}: missing "${missingRight}" (this is normal if Freebox app lacks permissions)`);
            (window as any)[logKey] = true;
          }
        }

        // Update the permission in the auth store
        useAuthStore.getState().updatePermissionFromError(missingRight);

        return {
          success: false,
          error: {
            code: 'INSUFFICIENT_RIGHTS',
            message: `Cette application n'est pas autorisée à accéder à cette fonction. Permission manquante : "${permissionLabel}"`
          }
        };
      }

      // Check for Freebox deprecated API error
      if (data && !data.success && data.error_code === 'deprecated') {
        console.warn(`[API] Deprecated API for ${method} ${endpoint}: ${data.msg}`);

        return {
          success: false,
          error: {
            code: 'DEPRECATED',
            message: data.msg || 'Cette fonctionnalité n\'est plus disponible'
          }
        };
      }

      // Handle network errors (no response, timeout, etc.)
      if (!response.ok) {
        // Log error details in development
        if (import.meta.env.DEV) {
          console.error(`[API] ${method} ${url} failed:`, {
            status: response.status,
            statusText: response.statusText,
            data: data
          });
        }
        
        // Network error (no connection, timeout, etc.)
        if (response.status === 0 || response.status >= 500) {
          return {
            success: false,
            error: {
              code: 'NETWORK_ERROR',
              message: 'Impossible de contacter le serveur. Vérifiez votre connexion réseau.'
            }
          };
        }
        
        // Client error (400, 401, 403, 404, etc.)
        if (response.status >= 400 && response.status < 500) {
          // Special handling for 401 (Unauthorized) - authentication errors
          if (response.status === 401) {
            const errorMessage = data?.error?.message || data?.msg || 'Invalid credentials';
            return {
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: errorMessage
              }
            };
          }
          
          return {
            success: false,
            error: {
              code: 'CLIENT_ERROR',
              message: data?.error?.message || data?.msg || `Erreur ${response.status}: ${response.statusText}`
            }
          };
        }
        
        // Fallback for other errors
        return {
          success: false,
          error: {
            code: data?.error?.code || data?.error_code || 'HTTP_ERROR',
            message: data?.error?.message || data?.msg || `Erreur HTTP ${response.status}: ${response.statusText}`
          }
        };
      }

      return data as ApiResponse<T>;
    } catch (error: any) {
      // In development, suppress connection refused errors - they are normal when backend is not started
      const errorMessage = error?.message || String(error || '');
      const isConnectionRefused = 
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('ERR_CONNECTION_REFUSED') ||
        errorMessage.includes('NetworkError') ||
        (error instanceof TypeError && (errorMessage.includes('fetch') || errorMessage.includes('network')));
      
      // Only log errors that are not connection refused, or log connection refused only once
      if (!isConnectionRefused) {
        console.error(`[API] ${method} ${endpoint} failed:`, error);
      } else if (import.meta.env.DEV) {
        // In dev mode, silently handle connection refused - backend might not be started yet
        // Only log once per session to avoid spam
        const logKey = 'connection_refused_logged';
        if (!(window as any)[logKey]) {
          console.warn(`[API] Backend not available - is the server running? (${method} ${endpoint})`);
          (window as any)[logKey] = true;
        }
      }
      
      // Provide more detailed error messages
      let userErrorMessage = 'Erreur réseau';
      let errorCode = 'NETWORK_ERROR';
      let isTemporary = false;
      
      if (isConnectionRefused) {
        // Backend is not available (restarting, not started, etc.)
        errorCode = 'CONNECTION_REFUSED';
        userErrorMessage = 'Le serveur n\'est pas disponible. Reconnexion en cours...';
        isTemporary = true;
      } else if (error instanceof TypeError && errorMessage.includes('fetch')) {
        userErrorMessage = 'Impossible de contacter le serveur. Vérifiez que le serveur est démarré et accessible.';
        isTemporary = true;
      } else if (error instanceof Error) {
        userErrorMessage = errorMessage;
        
        // Handle socket errors specifically
        if (errorMessage.includes('socket') || errorMessage.includes('ended') || errorMessage.includes('ECONNRESET')) {
          errorCode = 'SOCKET_ERROR';
          userErrorMessage = 'Connexion interrompue. Veuillez réessayer.';
          isTemporary = true;
        } else if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
          errorCode = 'TIMEOUT_ERROR';
          userErrorMessage = 'La requête a expiré. Veuillez réessayer.';
          isTemporary = true;
        } else if (errorMessage.includes('aborted') || errorMessage.includes('ABORTED')) {
          errorCode = 'ABORTED_ERROR';
          userErrorMessage = 'Requête annulée.';
        }
      }
      
      return {
        success: false,
        error: {
          code: errorCode,
          message: userErrorMessage,
          temporary: isTemporary
        }
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, body);
  }

  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', endpoint, body);
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint);
  }
}

export const api = new ApiClient();