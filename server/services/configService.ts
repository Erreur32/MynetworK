/**
 * Configuration Service
 * 
 * Handles export/import of application configuration to/from .conf file
 * Synchronizes between database and external .conf file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PluginConfigRepository } from '../database/models/PluginConfig.js';
import { pluginManager } from './pluginManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration file path
const configFilePath = process.env.CONFIG_FILE_PATH || 
    path.join(__dirname, '..', '..', 'config', 'mynetwork.conf');

/**
 * Export configuration from database to .conf file format (INI)
 */
export function exportConfigToFile(): string {
    const configs = PluginConfigRepository.findAll();
    const plugins = pluginManager.getAllPlugins();
    
    let content = '# MynetworK Configuration File\n';
    content += '# Generated automatically - Do not edit manually if auto-sync is enabled\n';
    content += `# Generated at: ${new Date().toISOString()}\n\n`;
    
    // App settings section
    content += '[app]\n';
    content += `# Application settings\n`;
    content += `timezone=${process.env.TZ || 'Europe/Paris'}\n`;
    content += `language=${process.env.LANGUAGE || 'fr'}\n`;
    content += `theme=${process.env.THEME || 'dark'}\n\n`;
    
    // Plugin configurations
    for (const plugin of plugins) {
        const pluginId = plugin.getId();
        const dbConfig = configs.find(c => c.pluginId === pluginId);
        
        if (!dbConfig) {
            // Plugin not configured yet
            content += `[plugin.${pluginId}]\n`;
            content += `enabled=false\n\n`;
            continue;
        }
        
        content += `[plugin.${pluginId}]\n`;
        content += `enabled=${dbConfig.enabled ? 'true' : 'false'}\n`;
        
        // Export settings
        if (dbConfig.settings && Object.keys(dbConfig.settings).length > 0) {
            for (const [key, value] of Object.entries(dbConfig.settings)) {
                if (value !== null && value !== undefined) {
                    // Escape special characters in INI format
                    const escapedValue = String(value).replace(/[#;\\]/g, '\\$&');
                    content += `${key}=${escapedValue}\n`;
                }
            }
        }
        
        content += '\n';
    }
    
    return content;
}

/**
 * Parse .conf file (INI format) and return configuration object
 */
export function parseConfigFile(fileContent: string): {
    app?: Record<string, string>;
    plugins: Record<string, { enabled: boolean; settings: Record<string, string> }>;
} {
    const result: {
        app?: Record<string, string>;
        plugins: Record<string, { enabled: boolean; settings: Record<string, string> }>;
    } = {
        plugins: {}
    };
    
    let currentSection: string | null = null;
    const lines = fileContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        // Skip empty lines and comments
        if (!line || line.startsWith('#') || line.startsWith(';')) {
            continue;
        }
        
        // Section header [section]
        if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1);
            continue;
        }
        
        // Key=value pair
        const equalIndex = line.indexOf('=');
        if (equalIndex === -1) continue;
        
        const key = line.slice(0, equalIndex).trim();
        let value = line.slice(equalIndex + 1).trim();
        
        // Unescape special characters
        value = value.replace(/\\([#;\\])/g, '$1');
        
        if (!currentSection) continue;
        
        if (currentSection === 'app') {
            if (!result.app) result.app = {};
            result.app[key] = value;
        } else if (currentSection.startsWith('plugin.')) {
            const pluginId = currentSection.replace('plugin.', '');
            if (!result.plugins[pluginId]) {
                result.plugins[pluginId] = { enabled: false, settings: {} };
            }
            
            if (key === 'enabled') {
                result.plugins[pluginId].enabled = value.toLowerCase() === 'true';
            } else {
                result.plugins[pluginId].settings[key] = value;
            }
        }
    }
    
    return result;
}

/**
 * Import configuration from .conf file to database
 */
export async function importConfigFromFile(filePath?: string): Promise<{
    imported: number;
    errors: string[];
}> {
    const targetPath = filePath || configFilePath;
    const errors: string[] = [];
    let imported = 0;
    
    // Check if file exists
    if (!fs.existsSync(targetPath)) {
        throw new Error(`Configuration file not found: ${targetPath}`);
    }
    
    // Read file
    const fileContent = fs.readFileSync(targetPath, 'utf-8');
    const config = parseConfigFile(fileContent);
    
    // Import plugin configurations
    for (const [pluginId, pluginConfig] of Object.entries(config.plugins)) {
        try {
            // Check if plugin exists
            const plugin = pluginManager.getAllPlugins().find(p => p.getId() === pluginId);
            if (!plugin) {
                errors.push(`Plugin ${pluginId} not found, skipping`);
                continue;
            }
            
            // Get current config to preserve sensitive fields (password, apiKey) if not in import
            const currentConfig = PluginConfigRepository.findByPluginId(pluginId);
            const mergedSettings = { ...(currentConfig?.settings || {}) };
            
            // Merge imported settings, but preserve password/apiKey if they're hidden in import
            for (const [key, value] of Object.entries(pluginConfig.settings)) {
                // Skip if value is a comment (starts with #) or is <hidden>
                if (typeof value === 'string' && (value.startsWith('#') || value === '<hidden>')) {
                    // Keep existing value for sensitive fields
                    continue;
                }
                mergedSettings[key] = value;
            }
            
            // Update or create configuration
            PluginConfigRepository.upsert({
                pluginId,
                enabled: pluginConfig.enabled,
                settings: mergedSettings
            });
            
            imported++;
            
            // Reinitialize plugin if enabled
            if (pluginConfig.enabled) {
                try {
                    await pluginManager.initializePlugin(pluginId);
                } catch (error) {
                    errors.push(`Failed to initialize plugin ${pluginId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        } catch (error) {
            errors.push(`Failed to import plugin ${pluginId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    return { imported, errors };
}

/**
 * Write configuration to .conf file
 */
export function writeConfigToFile(content: string, filePath?: string): void {
    const targetPath = filePath || configFilePath;
    
    // Ensure directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write file
    fs.writeFileSync(targetPath, content, 'utf-8');
}

/**
 * Check if config file exists
 */
export function configFileExists(filePath?: string): boolean {
    const targetPath = filePath || configFilePath;
    return fs.existsSync(targetPath);
}

/**
 * Get config file path
 */
export function getConfigFilePath(): string {
    return configFilePath;
}

/**
 * Synchronize configuration: if .conf file exists, import it; otherwise export to file
 * 
 * Import mode: 'auto' (default) - import if file exists, 'import' - force import, 'export' - force export only
 */
export async function synchronizeConfig(mode: 'auto' | 'import' | 'export' = 'auto'): Promise<void> {
    const fileExists = configFileExists();
    
    if (mode === 'export' || (!fileExists && mode === 'auto')) {
        // Export mode: always export DB to file
        console.log('[ConfigService] Exporting current configuration to file...');
        try {
            const content = exportConfigToFile();
            writeConfigToFile(content);
            console.log(`[ConfigService] Configuration exported to: ${configFilePath}`);
        } catch (error) {
            console.error('[ConfigService] Failed to export configuration:', error);
        }
        return;
    }
    
    if (mode === 'import' || (fileExists && mode === 'auto')) {
        // Import mode: import file to DB
        // Only import if DB is empty (first startup) or if explicitly requested
        const existingConfigs = PluginConfigRepository.findAll();
        const hasExistingConfigs = existingConfigs.length > 0 && existingConfigs.some(c => c.settings && Object.keys(c.settings).length > 0);
        
        if (hasExistingConfigs && mode === 'auto') {
            // DB has configs, don't overwrite - export DB to file instead
            console.log('[ConfigService] Database has existing configurations, exporting to file instead of importing...');
            try {
                const content = exportConfigToFile();
                writeConfigToFile(content);
                console.log(`[ConfigService] Configuration exported to: ${configFilePath}`);
            } catch (error) {
                console.error('[ConfigService] Failed to export configuration:', error);
            }
        } else {
            // DB is empty or import explicitly requested - import from file
            console.log('[ConfigService] Configuration file found, importing...');
            try {
                const result = await importConfigFromFile();
                console.log(`[ConfigService] Imported ${result.imported} plugin configurations`);
                if (result.errors.length > 0) {
                    console.warn('[ConfigService] Import errors:', result.errors);
                }
            } catch (error) {
                console.error('[ConfigService] Failed to import configuration:', error);
            }
        }
    }
}

