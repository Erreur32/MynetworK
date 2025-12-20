/**
 * User authentication store
 * 
 * Handles user login/logout and JWT token management
 * This is separate from the Freebox auth store
 */

import { create } from 'zustand';
import { api } from '../api/client';
import type { ApiResponse } from '../types/api';

export interface User {
    id: number;
    username: string;
    email: string;
    role: 'admin' | 'user' | 'viewer';
    enabled: boolean;
    createdAt: string;
    lastLogin?: string;
    lastLoginIp?: string;
    avatar?: string;
}

interface LoginResponse {
    token: string;
    user: User;
    message: string;
}

interface UserAuthState {
    // State
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;

    // Actions
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    checkAuth: () => Promise<void>;
    getToken: () => string | null;
    clearError: () => void;
}

// Store token in localStorage
const TOKEN_KEY = 'dashboard_user_token';

const getStoredToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
};

const setStoredToken = (token: string | null): void => {
    if (typeof window === 'undefined') return;
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
};

export const useUserAuthStore = create<UserAuthState>((set, get) => ({
    user: null,
    token: getStoredToken(),
    isAuthenticated: false,
    isLoading: false,
    error: null,

    login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
            const response = await api.post<LoginResponse>('/api/users/login', {
                username,
                password
            });

            if (response.success && response.result) {
                const { token, user } = response.result;
                setStoredToken(token);
                set({
                    token,
                    user,
                    isAuthenticated: true,
                    isLoading: false,
                    error: null
                });
                return true;
            } else {
                // Check if it's an authentication error (401 or invalid credentials)
                const errorCode = response.error?.code || '';
                const errorMessage = response.error?.message || '';
                const isAuthError = 
                    errorCode === 'UNAUTHORIZED' ||
                    errorCode === 'INVALID_CREDENTIALS' ||
                    errorMessage.toLowerCase().includes('invalid credentials') ||
                    errorMessage.toLowerCase().includes('incorrect') ||
                    errorMessage.toLowerCase().includes('mauvais') ||
                    errorMessage.toLowerCase().includes('incorrect') ||
                    errorMessage.toLowerCase().includes('credentials');
                
                set({
                    isLoading: false,
                    error: isAuthError 
                        ? 'Nom d\'utilisateur ou mot de passe incorrect'
                        : (response.error?.message || 'Erreur de connexion')
                });
                return false;
            }
        } catch (error: any) {
            // Check if the error is actually an API response with error code
            // Sometimes the API client returns errors in the error object
            const errorCode = error?.error?.code || error?.code || '';
            const errorMessage = error?.error?.message || error?.message || String(error || '');
            
            // Check if it's an authentication error from the API response
            // The API client returns UNAUTHORIZED code for 401 errors
            const isAuthError = 
                errorCode === 'UNAUTHORIZED' ||
                errorCode === 'INVALID_CREDENTIALS' ||
                errorMessage.toLowerCase().includes('invalid credentials') ||
                errorMessage.toLowerCase().includes('incorrect') ||
                errorMessage.toLowerCase().includes('credentials');
            
            // Check if it's a network error (only if not an auth error)
            const isNetworkError = !isAuthError && (
                errorMessage.includes('Impossible de contacter') ||
                errorMessage.includes('serveur') ||
                errorMessage.includes('network') ||
                errorMessage.includes('ECONNREFUSED') ||
                errorMessage.includes('Failed to fetch') ||
                errorMessage.includes('CONNECTION_REFUSED') ||
                errorMessage.includes('NETWORK_ERROR')
            );
            
            set({
                isLoading: false,
                error: isAuthError 
                    ? 'Nom d\'utilisateur ou mot de passe incorrect'
                    : (isNetworkError 
                        ? 'Impossible de contacter le serveur. Vérifiez votre connexion réseau.'
                        : (error instanceof Error ? error.message : 'Erreur de connexion'))
            });
            return false;
        }
    },

    logout: () => {
        setStoredToken(null);
        set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: null
        });
    },

    checkAuth: async () => {
        const token = get().token || getStoredToken();
        if (!token) {
            set({ isAuthenticated: false, user: null });
            return;
        }

        set({ isLoading: true });

        try {
            const response = await api.get<User>('/api/users/me');
            if (response.success && response.result) {
                set({
                    user: response.result,
                    isAuthenticated: true,
                    isLoading: false,
                    error: null
                });
            } else {
                // Token invalid, clear it
                setStoredToken(null);
                set({
                    token: null,
                    user: null,
                    isAuthenticated: false,
                    isLoading: false
                });
            }
        } catch (error) {
            setStoredToken(null);
            set({
                token: null,
                user: null,
                isAuthenticated: false,
                isLoading: false
            });
        }
    },

    getToken: () => {
        return get().token || getStoredToken();
    },

    clearError: () => {
        set({ error: null });
    }
}));

