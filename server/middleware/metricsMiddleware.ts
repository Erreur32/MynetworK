/**
 * Metrics Middleware
 * 
 * Tracks all API requests for metrics collection (aggregated, no high cardinality)
 * Applied to all routes to collect API performance metrics
 */

import { Request, Response, NextFunction } from 'express';
import { metricsCollector } from '../services/metricsCollector.js';

/**
 * Middleware to track all API requests for metrics
 * Records request duration and status code (aggregated, no route/method details)
 */
export const metricsMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const startTime = Date.now();
    
    // Store original end method to capture final status code
    const originalEnd = res.end.bind(res);
    
    res.end = function (chunk?: any, encoding?: any) {
        const duration = Date.now() - startTime;
        
        // Only track API routes (skip static files, health checks, etc.)
        if (req.path.startsWith('/api/')) {
            // Record API metrics (aggregated, no route/method details)
            metricsCollector.recordApiRequest(res.statusCode, duration);
        }
        
        return originalEnd(chunk, encoding);
    };
    
    next();
};

