/**
 * Logs WebSocket Service
 * 
 * Provides real-time application logs via WebSocket
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocket as WsType } from 'ws';
import { logger } from '../utils/logger.js';
import { logBuffer } from '../utils/logBuffer.js';

type ClientWebSocket = WsType & { isAlive?: boolean };

class LogsWebSocketService {
  private wss: WebSocketServer | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private unsubscribeLogs: (() => void) | null = null;

  /**
   * Initialize the WebSocket server for logs
   */
  init(server: import('http').Server) {
    logger.debug('LogsWS', 'Initializing Logs WebSocket server...');

    this.wss = new WebSocketServer({ server, path: '/ws/logs' });

    logger.debug('LogsWS', 'Logs WebSocket server created on path /ws/logs');

    this.wss.on('error', (error) => {
      logger.error('LogsWS', 'Server error:', error);
      logger.error('LogsWS', 'Error details:', error instanceof Error ? error.message : String(error));
    });

    this.wss.on('connection', (ws: ClientWebSocket, req) => {
      logger.info('LogsWS', `Client connected from: ${req.socket.remoteAddress}`);
      logger.debug('LogsWS', `Connection URL: ${req.url}, Headers:`, req.headers);
      ws.isAlive = true;

      // Send recent logs immediately (limited to 50 to prevent memory issues)
      const recentLogs = logBuffer.getRecent(50);
      logger.debug('LogsWS', `Sending ${recentLogs.length} recent logs to client`);
      
      try {
        const message = JSON.stringify({
          type: 'logs',
          data: recentLogs
        });
        
        // Check message size (max 1MB to prevent memory issues)
        const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
        if (message.length > MAX_MESSAGE_SIZE) {
          logger.warn('LogsWS', `Message too large (${message.length} bytes), truncating logs`);
          // Send only the most recent logs that fit
          const truncatedLogs = recentLogs.slice(-20);
          ws.send(JSON.stringify({
            type: 'logs',
            data: truncatedLogs
          }));
        } else {
          ws.send(message);
        }
        logger.debug('LogsWS', 'Initial logs sent successfully');
      } catch (error) {
        logger.error('LogsWS', 'Error sending initial logs:', error);
      }

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('close', (code, reason) => {
        logger.info('LogsWS', `Client disconnected (code: ${code}, reason: ${reason.toString()})`);
        // Stop listening if no more clients
        if (this.wss && this.wss.clients.size === 0) {
          this.stopListening();
        }
      });

      ws.on('error', (error) => {
        // Only log non-socket errors to avoid spam
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage && !errorMessage.includes('socket') && !errorMessage.includes('ECONNRESET')) {
          logger.error('LogsWS', `Client error: ${errorMessage}`);
        }
      });

      // Start listening for new logs if there are clients and not already listening
      if (this.wss && this.wss.clients.size > 0) {
        this.startListening();
      }
    });

    // Ping clients to detect stale connections
    this.pingInterval = setInterval(() => {
      this.wss?.clients.forEach((ws) => {
        const client = ws as ClientWebSocket;
        if (client.isAlive === false) {
          return client.terminate();
        }
        client.isAlive = false;
        client.ping();
      });
    }, 30000);

    logger.debug('LogsWS', 'Logs WebSocket server initialized on /ws/logs');
  }

  /**
   * Start listening to new log entries
   */
  private startListening() {
    if (this.unsubscribeLogs) {
      logger.debug('LogsWS', 'Already listening for new logs');
      return;
    }

    logger.debug('LogsWS', 'Starting to listen for new logs');

    this.unsubscribeLogs = logBuffer.subscribe((logEntry) => {
      // Broadcast new log to all connected clients
      if (this.wss && this.wss.clients.size > 0) {
        try {
        const message = JSON.stringify({
          type: 'log',
          data: logEntry
        });

          // Check message size (max 100KB per log entry to prevent memory issues)
          const MAX_LOG_MESSAGE_SIZE = 100 * 1024; // 100KB
          if (message.length > MAX_LOG_MESSAGE_SIZE) {
            logger.warn('LogsWS', `Log entry too large (${message.length} bytes), skipping broadcast`);
            return;
          }

        let sentCount = 0;
        this.wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            try {
              client.send(message);
              sentCount++;
            } catch (error) {
              logger.error('LogsWS', 'Error sending log to client:', error);
            }
          }
        });
        logger.debug('LogsWS', `Broadcasted log to ${sentCount} client(s)`, logEntry.prefix, logEntry.message?.substring(0, 50));
        } catch (error) {
          logger.error('LogsWS', 'Error serializing log entry:', error);
        }
      }
    });
  }

  /**
   * Stop listening to new log entries
   */
  private stopListening() {
    if (this.unsubscribeLogs) {
      this.unsubscribeLogs();
      this.unsubscribeLogs = null;
      logger.debug('LogsWS', 'Stopped listening for new logs');
    }
  }

  /**
   * Close the WebSocket server
   */
  close() {
    this.stopListening();

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.debug('LogsWS', 'Logs WebSocket service closed');
  }
}

export const logsWebSocket = new LogsWebSocketService();
