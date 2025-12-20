import { useEffect, useRef, useCallback, useState } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useSystemStore } from '../stores/systemStore';
import type { ConnectionStatus } from '../types/api';

interface SystemStatusData {
  temp_cpu0?: number;
  temp_cpu1?: number;
  temp_cpu2?: number;
  temp_cpu3?: number;
  temp_cpum?: number;
  temp_cpub?: number;
  temp_sw?: number;
  fan_rpm?: number;
  uptime_val?: number;
}

// Freebox native event data types
interface LanHostEventData {
  id: string;
  name: string;
  host_type?: string;
  vendor_name?: string;
  active: boolean;
  timestamp: number;
}

interface VmEventData {
  id: number;
  status?: string;
  done?: boolean;
  error?: boolean;
  timestamp: number;
}

interface FreeboxEventMessage {
  type: 'freebox_event';
  eventType: string;
  data: LanHostEventData | VmEventData;
}

interface WebSocketMessage {
  type: 'connection_status' | 'system_status' | 'freebox_event';
  eventType?: string;
  data: ConnectionStatus | SystemStatusData | LanHostEventData | VmEventData;
}

interface UseConnectionWebSocketOptions {
  enabled?: boolean;
  onFreeboxEvent?: (eventType: string, data: LanHostEventData | VmEventData) => void;
}

/**
 * Hook to manage WebSocket connection for real-time connection status updates
 * Replaces polling for /api/connection
 * Also receives native Freebox WebSocket events (lan_host, vm_state, etc.)
 */
export function useConnectionWebSocket(options: UseConnectionWebSocketOptions = {}) {
  const { enabled = true, onFreeboxEvent } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 3; // Maximum 3 tentatives avant de s'arrêter (réduit pour éviter le flood)
  const isPermanentlyDisabledRef = useRef<boolean>(false); // Flag pour désactiver définitivement si échecs répétés
  const isConnectingRef = useRef<boolean>(false); // Flag pour éviter les connexions multiples simultanées
  const [isConnected, setIsConnected] = useState(false);

  const { fetchConnectionStatus } = useConnectionStore();

  const connect = useCallback(() => {
    // Ne pas essayer de se connecter si désactivé de manière permanente
    if (isPermanentlyDisabledRef.current) {
      return;
    }
    
    // Ne pas essayer si on a dépassé le nombre max de tentatives
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      isPermanentlyDisabledRef.current = true;
      return;
    }
    
    // Éviter les connexions multiples simultanées
    if (isConnectingRef.current) {
      return;
    }
    
    // Ne pas créer de nouvelle connexion si une existe déjà
    if (wsRef.current) {
      // Si la connexion est ouverte ou en cours, ne rien faire
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        return;
      }
      // Si la connexion est en cours de fermeture, attendre qu'elle se ferme
      if (wsRef.current.readyState === WebSocket.CLOSING) {
        return;
      }
      // Sinon, fermer proprement avant de créer une nouvelle connexion
      try {
        wsRef.current.close();
      } catch (e) {
        // Ignorer les erreurs de fermeture
      }
      wsRef.current = null;
    }
    
    // Marquer qu'on est en train de se connecter
    isConnectingRef.current = true;

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl: string;
    
    // In dev mode, check if we're accessing via IP (Docker dev) or localhost (npm dev)
    // If accessing via IP and port 3666, connect directly to backend port 3668 to avoid proxy issues
    if (import.meta.env.DEV) {
      const host = window.location.hostname;
      const port = window.location.port;
      const isDockerDevAccess = host !== 'localhost' && host !== '127.0.0.1' && port === '3666';
      
      if (isDockerDevAccess) {
        // Docker dev: connect directly to backend port (3668) to bypass Vite proxy
        wsUrl = `${protocol}//${host}:3668/ws/connection`;
      } else {
        // NPM dev or localhost: use proxy via current host
        wsUrl = `${protocol}//${window.location.host}/ws/connection`;
      }
    } else {
      // Production: use current host
      wsUrl = `${protocol}//${window.location.host}/ws/connection`;
    }

    if (import.meta.env.DEV) {
      console.log('[WS Client] Connecting to:', wsUrl);
    }
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      isConnectingRef.current = false; // Connexion établie
      if (import.meta.env.DEV) {
        console.log('[WS Client] Connected successfully');
      }
      setIsConnected(true);
      reconnectAttemptsRef.current = 0; // Reset counter on successful connection
      isPermanentlyDisabledRef.current = false; // Réactiver en cas de succès
      // Don't fetch immediately - wait for WebSocket to send data
      // The server will send connection_status and system_status via WebSocket
      // Only fetch if WebSocket doesn't send data within a reasonable time
      setTimeout(() => {
        // If still connected but no data received, do a fallback fetch
        if (wsRef.current?.readyState === WebSocket.OPEN && !isConnected) {
      fetchConnectionStatus();
        }
      }, 2000); // Wait 2 seconds for WebSocket data
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        if (message.type === 'connection_status' && message.data) {
          const status = message.data as ConnectionStatus;

          // Update the store directly
          useConnectionStore.setState((state) => {
            const newPoint = {
              time: new Date().toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              }),
              download: Math.round(status.rate_down / 1024),
              upload: Math.round(status.rate_up / 1024)
            };

            return {
              status,
              error: null,
              history: [...state.history.slice(-299), newPoint] // Keep last 300 points (5 minutes)
            };
          });
        } else if (message.type === 'system_status' && message.data) {
          const systemData = message.data as SystemStatusData;

          // Update system store with real-time data
          useSystemStore.setState((state) => {
            // Calculate CPU temp: average of Ultra cores or use legacy cpum
            let cpuM: number | undefined;
            if (systemData.temp_cpu0 != null) {
              // Ultra: average of 4 CPU cores
              const temps = [
                systemData.temp_cpu0,
                systemData.temp_cpu1,
                systemData.temp_cpu2,
                systemData.temp_cpu3
              ].filter((t): t is number => t != null);
              cpuM = temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : undefined;
            } else {
              cpuM = systemData.temp_cpum;
            }

            const newPoint = {
              time: new Date().toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              }),
              cpuM,
              cpuB: systemData.temp_cpub,
              sw: systemData.temp_sw
            };

            // Update info with latest values
            const updatedInfo = state.info ? {
              ...state.info,
              temp_cpu0: systemData.temp_cpu0,
              temp_cpu1: systemData.temp_cpu1,
              temp_cpu2: systemData.temp_cpu2,
              temp_cpu3: systemData.temp_cpu3,
              temp_cpum: systemData.temp_cpum ?? cpuM,
              temp_cpub: systemData.temp_cpub,
              temp_sw: systemData.temp_sw,
              fan_rpm: systemData.fan_rpm,
              uptime_val: systemData.uptime_val ?? state.info.uptime_val
            } : null;

            return {
              info: updatedInfo,
              temperatureHistory: [...state.temperatureHistory.slice(-299), newPoint] // Keep last 300 points (5 minutes)
            };
          });
        } else if (message.type === 'freebox_event' && message.eventType && message.data) {
          // Native Freebox WebSocket event (lan_host, vm_state, etc.)
          // console.log('[WS Client] Freebox event:', message.eventType, message.data); // Debug only
          if (onFreeboxEvent) {
            onFreeboxEvent(message.eventType, message.data as LanHostEventData | VmEventData);
          }
        }
      } catch (error) {
        console.error('[WS Client] Failed to parse message:', error);
      }
    };

    ws.onclose = (event) => {
      isConnectingRef.current = false; // Connexion fermée
      setIsConnected(false);
      wsRef.current = null;

      // Only log disconnections with error codes (not normal closures)
      // Code 1006 (abnormal closure) is normal during development when backend restarts
      // In production, code 1006 is also common when nginx is not configured for WebSocket
      // Suppress these logs to avoid flooding the console
      if (event.code !== 1000 && event.code !== 1001) {
        // Code 1006 is expected in both dev and prod (backend restart, proxy issues, nginx misconfiguration)
        if (event.code === 1006) {
          // Increment reconnect attempts counter
          reconnectAttemptsRef.current += 1;
          
          // Stop trying after max attempts to avoid infinite flood
          if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            // Silently stop - nginx is probably not configured correctly
            // User will need to fix nginx configuration
          return;
        }
        } else {
          // Only log unexpected error codes (not 1006)
          if (import.meta.env.DEV) {
        console.warn('[WS Client] Disconnected:', event.code, event.reason);
      }
        }
      } else {
        // Normal closure - reset counter
        reconnectAttemptsRef.current = 0;
      }

      // Reconnect after delay if still enabled and under max attempts
      // Increase delay to avoid rapid reconnection loops
      if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(3000 * (reconnectAttemptsRef.current + 1), 10000); // Exponential backoff, max 10s
        reconnectTimeoutRef.current = setTimeout(() => {
          // console.log('[WS Client] Attempting reconnect...'); // Debug only
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      isConnectingRef.current = false; // Erreur, on peut réessayer
      // Intercepter l'erreur pour éviter qu'elle soit loggée par le navigateur
      // On ne peut pas complètement supprimer les erreurs natives du navigateur,
      // mais on peut éviter de créer de nouvelles connexions si elles échouent
      
      // Incrémenter le compteur d'échecs
      reconnectAttemptsRef.current += 1;
      
      // Si on a dépassé le max, désactiver définitivement
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        isPermanentlyDisabledRef.current = true;
        // Fermer la connexion pour éviter d'autres erreurs
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
      }
      }
      
      // Ne rien logger - le navigateur affichera ses propres erreurs qu'on ne peut pas supprimer
      // Mais on évite au moins de créer de nouvelles connexions qui échoueront
    };
  }, [enabled, fetchConnectionStatus, onFreeboxEvent]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    reconnectAttemptsRef.current = 0; // Reset counter on manual disconnect
    isPermanentlyDisabledRef.current = false; // Réactiver si déconnecté manuellement
  }, []);

  useEffect(() => {
    if (enabled) {
      // Add a small delay to ensure backend is ready (especially after npm run dev restart)
      const connectTimeout = setTimeout(() => {
      connect();
      }, 500);
      
      return () => {
        clearTimeout(connectTimeout);
        disconnect();
      };
    } else {
      disconnect();
    return () => {
      disconnect();
    };
    }
  }, [enabled, connect, disconnect]);

  return { isConnected };
}

// Export types for use in components
export type { LanHostEventData, VmEventData };
