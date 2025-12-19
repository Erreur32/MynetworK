/**
 * Get client IP address from request
 * 
 * Handles proxy headers (X-Forwarded-For, X-Real-IP) for Docker/reverse proxy environments
 */

import { Request } from 'express';

/**
 * Get the real client IP address from request
 * 
 * Priority order:
 * 1. X-Forwarded-For header (first IP in the chain)
 * 2. X-Real-IP header
 * 3. req.ip (if trust proxy is enabled)
 * 4. req.socket.remoteAddress (fallback)
 * 
 * @param req Express request object
 * @returns Client IP address or undefined
 */
export function getClientIp(req: Request): string | undefined {
    // Check X-Forwarded-For header (most common in Docker/reverse proxy)
    // Format: "client-ip, proxy1-ip, proxy2-ip"
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = Array.isArray(forwardedFor) 
            ? forwardedFor[0] 
            : forwardedFor;
        // Get first IP (client IP) from the chain
        const clientIp = ips.split(',')[0].trim();
        if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
            return clientIp;
        }
    }

    // Check X-Real-IP header (alternative header)
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        const ip = Array.isArray(realIp) ? realIp[0] : realIp;
        if (ip && ip !== '127.0.0.1' && ip !== '::1') {
            return ip;
        }
    }

    // Use req.ip if available (requires trust proxy to be enabled)
    if (req.ip && req.ip !== '127.0.0.1' && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') {
        return req.ip;
    }

    // Fallback to socket remote address
    const remoteAddress = req.socket.remoteAddress;
    if (remoteAddress && remoteAddress !== '127.0.0.1' && remoteAddress !== '::1' && remoteAddress !== '::ffff:127.0.0.1') {
        return remoteAddress;
    }

    // Last resort: return req.ip even if it's 127.0.0.1 (better than undefined)
    return req.ip || remoteAddress || undefined;
}

