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
    // Debug: log headers in development (can be removed later)
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        // console.log('[getClientIp] Headers:', {
        //     'x-forwarded-for': req.headers['x-forwarded-for'],
        //     'x-real-ip': req.headers['x-real-ip'],
        //     'req.ip': req.ip,
        //     'socket.remoteAddress': req.socket.remoteAddress
        // });
    }
    
    // Check X-Forwarded-For header (most common in Docker/reverse proxy/Vite proxy)
    // Format: "client-ip, proxy1-ip, proxy2-ip"
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = Array.isArray(forwardedFor) 
            ? forwardedFor[0] 
            : forwardedFor;
        // Get first IP (client IP) from the chain
        const clientIp = ips.split(',')[0].trim();
        // Accept any IP, even 127.0.0.1 if it's the only one (better than nothing)
        if (clientIp) {
            // If it's 127.0.0.1 but we have multiple IPs, use the first non-localhost
            if (clientIp === '127.0.0.1' || clientIp === '::1') {
                const allIps = ips.split(',').map(ip => ip.trim());
                const realIp = allIps.find(ip => ip && ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1');
                if (realIp) {
                    return realIp;
                }
            }
            // Return the IP even if it's 127.0.0.1 (it's the best we have)
            return clientIp;
        }
    }

    // Check X-Real-IP header (alternative header)
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        const ip = Array.isArray(realIp) ? realIp[0] : realIp;
        if (ip && ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
            return ip;
        }
        // Even if it's 127.0.0.1, return it if no other IP found
        if (ip && !forwardedFor) {
            return ip;
        }
    }

    // Use req.ip if available (requires trust proxy to be enabled)
    // In development with Vite proxy, req.ip might be 127.0.0.1, so we check socket first
    const remoteAddress = req.socket.remoteAddress;
    if (remoteAddress && remoteAddress !== '127.0.0.1' && remoteAddress !== '::1' && remoteAddress !== '::ffff:127.0.0.1') {
        // Check if it's IPv6-mapped IPv4 address
        if (remoteAddress.startsWith('::ffff:')) {
            return remoteAddress.substring(7); // Extract IPv4 from ::ffff:xxx.xxx.xxx.xxx
        }
        return remoteAddress;
    }

    // Try req.ip (Express sets this when trust proxy is enabled)
    if (req.ip && req.ip !== '127.0.0.1' && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') {
        // Check if it's IPv6-mapped IPv4 address
        if (req.ip.startsWith('::ffff:')) {
            return req.ip.substring(7);
        }
        return req.ip;
    }

    // Last resort: return req.ip or remoteAddress even if it's 127.0.0.1
    // This is better than undefined, and indicates local access
    return req.ip || remoteAddress || undefined;
}

