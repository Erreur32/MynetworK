import WebSocket from 'ws';
import { freeboxApi } from './freeboxApi.js';
import { connectionWebSocket } from './connectionWebSocket.js';
import { pluginManager } from './pluginManager.js';
import { logger } from '../utils/logger.js';

// Freebox native WebSocket events (API v8+)
type FreeboxEvent =
  | 'vm_state_changed'
  | 'vm_disk_task_done'
  | 'lan_host_l3addr_reachable'
  | 'lan_host_l3addr_unreachable';

interface RegisterAction {
  action: 'register';
  events: FreeboxEvent[];
}

interface FreeboxNotification {
  action: 'notification' | 'register';
  success: boolean;
  source?: string;
  event?: string;
  result?: unknown;
}

// LAN host event data structure
interface LanHostEventData {
  id: string;
  primary_name?: string;
  host_type?: string;
  l3connectivities?: Array<{
    addr: string;
    af: 'ipv4' | 'ipv6';
    active: boolean;
    reachable: boolean;
  }>;
  vendor_name?: string;
  active?: boolean;
  reachable?: boolean;
  last_activity?: number;
  [key: string]: unknown;
}

// VM state change event data
interface VmStateChangeData {
  id: number;
  status: string;
  [key: string]: unknown;
}

// VM disk task event data
interface VmDiskTaskData {
  id: number;
  done: boolean;
  error: boolean;
  [key: string]: unknown;
}

class FreeboxNativeWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = false;
  private apiVersion: number = 8; // Default, will be updated

  /**
   * Start the native Freebox WebSocket connection
   * Only works with API v8+ (Delta, Pop, Ultra)
   * Only starts if Freebox plugin is enabled
   */
  async start() {
    const freeboxPlugin = pluginManager.getPlugin('freebox');
    if (!freeboxPlugin || !freeboxPlugin.isEnabled()) {
      logger.debug('FBX-WS', 'Freebox plugin is not enabled, skipping WebSocket connection');
      return;
    }

    let versionInfo = freeboxApi.getVersionInfo();

    if (!versionInfo) {
      const apiResponse = await freeboxApi.getApiVersion();
      if (apiResponse.success && apiResponse.result) {
        versionInfo = apiResponse.result as { api_version?: string };
      }
    }

    if (versionInfo?.api_version) {
      this.apiVersion = parseInt(versionInfo.api_version.split('.')[0] || '8', 10);
    }

    if (this.apiVersion < 8) {
      logger.debug('FBX-WS', 'Freebox API v8+ required for native WebSocket events. Current:', this.apiVersion);
      logger.debug('FBX-WS', 'Native WebSocket disabled for this Freebox model (Revolution/Mini 4K)');
      return;
    }

    this.shouldReconnect = true;
    await this.connect();
  }

  /**
   * Connect to Freebox native WebSocket
   */
  private async connect() {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const freeboxPlugin = pluginManager.getPlugin('freebox');
    if (!freeboxPlugin || !freeboxPlugin.isEnabled()) {
      logger.debug('FBX-WS', 'Freebox plugin is not enabled, skipping WebSocket connection');
      this.shouldReconnect = false;
      return;
    }

    if (!freeboxApi.isLoggedIn()) {
      logger.debug('FBX-WS', 'Not logged in, skipping native WebSocket connection');
      return;
    }

    this.isConnecting = true;

    try {
      const sessionToken = freeboxApi.getSessionToken();
      const freeboxHost = process.env.FREEBOX_HOST || 'mafreebox.freebox.fr';
      const wsUrl = `wss://${freeboxHost}/api/v${this.apiVersion}/ws/event`;

      logger.debug('FBX-WS', `Connecting to Freebox native WebSocket: ${wsUrl}`);

      this.ws = new WebSocket(wsUrl, {
        headers: { 'X-Fbx-App-Auth': sessionToken || '' },
        rejectUnauthorized: false
      });

      this.ws.on('open', () => {
        logger.debug('FBX-WS', 'Connected to Freebox native WebSocket');
        this.isConnecting = false;
        this.registerEvents();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code, reason) => {
        logger.debug('FBX-WS', `Disconnected: ${code} ${reason.toString()}`);
        this.isConnecting = false;
        this.ws = null;
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        logger.error('FBX-WS', `WebSocket error: ${error.message}`);
        this.isConnecting = false;
      });

    } catch (error) {
      logger.error('FBX-WS', 'Failed to connect:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Register for Freebox events
   */
  private registerEvents() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const registerAction: RegisterAction = {
      action: 'register',
      events: [
        'lan_host_l3addr_reachable',
        'lan_host_l3addr_unreachable',
        'vm_state_changed',
        'vm_disk_task_done'
      ]
    };

    logger.debug('FBX-WS', 'Registering for events:', registerAction.events);
    this.ws.send(JSON.stringify(registerAction));
  }

  /**
   * Handle incoming message from Freebox
   */
  private handleMessage(data: WebSocket.Data) {
    try {
      const message: FreeboxNotification = JSON.parse(data.toString());

      if (message.action === 'register') {
        if (message.success) {
          logger.debug('FBX-WS', 'Successfully registered for events');
        } else {
          logger.error('FBX-WS', 'Failed to register for events');
        }
        return;
      }

      if (message.action === 'notification' && message.success) {
        this.handleNotification(message);
      }
    } catch (error) {
      logger.error('FBX-WS', 'Failed to parse message:', error);
    }
  }

  /**
   * Handle Freebox notification event
   */
  private handleNotification(notification: FreeboxNotification) {
    const { source, event, result } = notification;
    const fullEvent = `${source}_${event}`;

    logger.debug('FBX-WS', `Received event: ${fullEvent}`);

    switch (fullEvent) {
      case 'lan_host_l3addr_reachable':
        this.handleLanHostReachable(result as LanHostEventData);
        break;
      case 'lan_host_l3addr_unreachable':
        this.handleLanHostUnreachable(result as LanHostEventData);
        break;
      case 'vm_state_changed':
        this.handleVmStateChanged(result as VmStateChangeData);
        break;
      case 'vm_disk_task_done':
        this.handleVmDiskTaskDone(result as VmDiskTaskData);
        break;
      default:
        logger.debug('FBX-WS', `Unknown event: ${fullEvent}`);
    }
  }

  private handleLanHostReachable(host: LanHostEventData) {
    logger.debug('FBX-WS', `Device connected: ${host.primary_name || host.id}`);
    connectionWebSocket.broadcastFreeboxEvent('lan_host_reachable', {
      id: host.id,
      name: host.primary_name || 'Unknown',
      host_type: host.host_type,
      vendor_name: host.vendor_name,
      active: true,
      timestamp: Date.now()
    });
  }

  private handleLanHostUnreachable(host: LanHostEventData) {
    logger.debug('FBX-WS', `Device disconnected: ${host.primary_name || host.id}`);
    connectionWebSocket.broadcastFreeboxEvent('lan_host_unreachable', {
      id: host.id,
      name: host.primary_name || 'Unknown',
      host_type: host.host_type,
      vendor_name: host.vendor_name,
      active: false,
      timestamp: Date.now()
    });
  }

  private handleVmStateChanged(vm: VmStateChangeData) {
    logger.debug('FBX-WS', `VM state changed: ${vm.id} -> ${vm.status}`);
    connectionWebSocket.broadcastFreeboxEvent('vm_state_changed', {
      id: vm.id,
      status: vm.status,
      timestamp: Date.now()
    });
  }

  private handleVmDiskTaskDone(task: VmDiskTaskData) {
    logger.debug('FBX-WS', `VM disk task done: ${task.id} error: ${task.error}`);
    connectionWebSocket.broadcastFreeboxEvent('vm_disk_task_done', {
      id: task.id,
      done: task.done,
      error: task.error,
      timestamp: Date.now()
    });
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return;

    const freeboxPlugin = pluginManager.getPlugin('freebox');
    if (!freeboxPlugin || !freeboxPlugin.isEnabled()) {
      logger.debug('FBX-WS', 'Freebox plugin disabled, stopping reconnection attempts');
      this.shouldReconnect = false;
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    logger.debug('FBX-WS', 'Reconnecting in 5 seconds...');
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  stop() {
    logger.debug('FBX-WS', 'Stopping native WebSocket service');
    this.shouldReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  onLogin() {
    const freeboxPlugin = pluginManager.getPlugin('freebox');
    if (!freeboxPlugin || !freeboxPlugin.isEnabled()) {
      logger.debug('FBX-WS', 'Freebox plugin is not enabled, skipping WebSocket start on login');
      return;
    }
    this.start();
  }

  onLogout() {
    this.stop();
  }
}

export const freeboxNativeWebSocket = new FreeboxNativeWebSocketService();
