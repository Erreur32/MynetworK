/**
 * Configuration export/import routes
 * 
 * Handles export and import of application configuration to/from .conf file
 */

import { Router } from 'express';
import { 
    exportConfigToFile, 
    importConfigFromFile, 
    writeConfigToFile,
    configFileExists,
    getConfigFilePath,
    synchronizeConfig
} from '../services/configService.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';
import { loggingService } from '../services/loggingService.js';

const router = Router();

// GET /api/config/export - Export configuration to .conf file format
router.get('/export', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        const configContent = exportConfigToFile();
        
        // Optionally write to file
        const writeToFile = req.query.write === 'true';
        if (writeToFile) {
            writeConfigToFile(configContent);
        }
        
        // Log action
        await loggingService.logUserAction(
            req.user!.userId,
            req.user!.username,
            'config.export',
            'config',
            { details: { writeToFile } }
        );
        
        res.json({
            success: true,
            result: {
                content: configContent,
                filePath: getConfigFilePath(),
                written: writeToFile
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to export configuration';
        throw createError(message, 500, 'CONFIG_EXPORT_ERROR');
    }
}), autoLog('config.export', 'config'));

// POST /api/config/import - Import configuration from .conf file
router.post('/import', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        // Check if file content is provided in request body
        let filePath: string | undefined;
        let fileContent: string | undefined;
        
        if (req.body.content) {
            // Content provided directly in request
            fileContent = req.body.content;
            // Write to temp file
            const tempPath = getConfigFilePath() + '.tmp';
            const fs = await import('fs');
            fs.writeFileSync(tempPath, fileContent, 'utf-8');
            filePath = tempPath;
        } else if (req.body.filePath) {
            // File path provided
            filePath = req.body.filePath;
        } else {
            // Use default config file
            filePath = getConfigFilePath();
        }
        
        const result = await importConfigFromFile(filePath);
        
        // Clean up temp file if created
        if (filePath?.endsWith('.tmp')) {
            const fsModule = await import('fs');
            fsModule.unlinkSync(filePath);
        }
        
        // Log action
        await loggingService.logUserAction(
            req.user!.userId,
            req.user!.username,
            'config.import',
            'config',
            { 
                details: { 
                    imported: result.imported,
                    errors: result.errors 
                } 
            }
        );
        
        res.json({
            success: true,
            result: {
                imported: result.imported,
                errors: result.errors,
                message: `Imported ${result.imported} plugin configuration(s)`
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import configuration';
        throw createError(message, 500, 'CONFIG_IMPORT_ERROR');
    }
}), autoLog('config.import', 'config'));

// GET /api/config/file - Get config file status and path
router.get('/file', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const exists = configFileExists();
    const filePath = getConfigFilePath();
    
    let content: string | null = null;
    if (exists) {
        try {
            const fsModule = await import('fs');
            content = fsModule.readFileSync(filePath, 'utf-8');
        } catch (error) {
            // File exists but can't read it
        }
    }
    
    res.json({
        success: true,
        result: {
            exists,
            filePath,
            content: content || null,
            size: content ? content.length : 0
        }
    });
}), autoLog('config.getFile', 'config'));

// POST /api/config/sync - Synchronize configuration (import if file exists, export otherwise)
router.post('/sync', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
        await synchronizeConfig();
        
        // Log action
        await loggingService.logUserAction(
            req.user!.userId,
            req.user!.username,
            'config.sync',
            'config',
            {}
        );
        
        res.json({
            success: true,
            result: {
                message: 'Configuration synchronized successfully'
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to synchronize configuration';
        throw createError(message, 500, 'CONFIG_SYNC_ERROR');
    }
}), autoLog('config.sync', 'config'));

export default router;

