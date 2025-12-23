/**
 * Wireshark Vendor Database Service
 * 
 * Downloads and parses the IEEE OUI database for complete vendor detection
 * Updates automatically from: https://standards-oui.ieee.org/oui/oui.txt
 * Alternative: https://mac2vendor.com/download/oui-database.sqlite (SQLite format)
 * 
 * IEEE OUI Format (multi-line):
 * 28-6F-B9   (hex)		Nokia Shanghai Bell Co., Ltd.
 * 286FB9     (base 16)		Nokia Shanghai Bell Co., Ltd.
 * 				Address lines...
 * 
 * Logic: Extract OUI from hex format (XX-XX-XX), convert to AA:BB:CC, lookup in database
 * If not found → Unknown / Randomized
 */

import { getDatabase } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { AppConfigRepository } from '../database/models/AppConfig.js';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// IEEE OUI Official Database (primary source)
const IEEE_OUI_URL = 'https://standards-oui.ieee.org/oui/oui.txt';
// Alternative: SQLite database from mac2vendor.com
const MAC2VENDOR_SQLITE_URL = 'https://mac2vendor.com/download/oui-database.sqlite';
const MANUF_FILE_PATH = path.join(process.cwd(), 'data', 'oui.txt');
const LAST_UPDATE_KEY = 'wireshark_manuf_last_update';
const AUTO_UPDATE_ENABLED_KEY = 'wireshark_auto_update_enabled';
const UPDATE_INTERVAL_DAYS = 7; // Update every 7 days

// Minimum expected file size (100KB) - manuf file is typically 200-500KB
const MIN_FILE_SIZE = 100 * 1024; // 100KB
// Minimum expected vendors in a valid file (should have thousands)
const MIN_VENDORS_COUNT = 1000;

export class WiresharkVendorService {
    /**
     * Initialize the Wireshark vendor database
     * Creates table if needed and downloads/updates the database
     * If download fails but local file exists, uses local file
     */
    static async initialize(): Promise<void> {
        try {
            const db = getDatabase();
            if (!db) {
                logger.error('WiresharkVendorService', 'Database not initialized');
                return;
            }

            // Create table if it doesn't exist
            db.exec(`
                CREATE TABLE IF NOT EXISTS wireshark_vendors (
                    oui TEXT PRIMARY KEY,
                    vendor TEXT NOT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create index for faster lookups
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_wireshark_vendors_oui ON wireshark_vendors(oui)
            `);

            // Check current stats
            const stats = this.getStats();
            logger.info('WiresharkVendorService', `Current vendor database: ${stats.totalVendors} vendors, last update: ${stats.lastUpdate || 'never'}`);

            // Always ensure database has vendors - load from file or use defaults
            // Check if we need to update from remote
            const shouldUpdate = await this.shouldUpdate();
            if (shouldUpdate) {
                logger.info('WiresharkVendorService', 'Updating vendor database from Wireshark...');
                try {
                    await this.updateDatabase();
                } catch (error: any) {
                    logger.error('WiresharkVendorService', `Failed to update from remote: ${error.message}`);
                    
                    // If update fails but local file exists, try to use it
                    if (fs.existsSync(MANUF_FILE_PATH)) {
                        logger.info('WiresharkVendorService', 'Update failed, but local file exists. Attempting to use local file...');
                        try {
                            await this.parseAndUpdateDatabase();
                            // Update timestamp to today even if using local file
                            AppConfigRepository.set(LAST_UPDATE_KEY, new Date().toISOString());
                            logger.info('WiresharkVendorService', 'Successfully loaded vendors from local file');
                        } catch (parseError: any) {
                            logger.error('WiresharkVendorService', `Failed to parse local file: ${parseError.message}`);
                            // If parsing fails, load default vendors
                            await this.loadDefaultVendors();
                        }
                    } else {
                        logger.warn('WiresharkVendorService', 'No local file available and download failed. Loading default vendors...');
                        await this.loadDefaultVendors();
                    }
                }
            } else {
                logger.info('WiresharkVendorService', 'Auto-update is disabled, checking if database needs initialization...');
                
                // If database is empty, try to load from local file first, then defaults
                if (stats.totalVendors === 0) {
                    if (fs.existsSync(MANUF_FILE_PATH)) {
                        logger.info('WiresharkVendorService', 'Database is empty but local file exists. Loading from local file...');
                        try {
                            await this.parseAndUpdateDatabase();
                            AppConfigRepository.set(LAST_UPDATE_KEY, new Date().toISOString());
                            
                            // Verify vendors were actually loaded
                            const newStats = this.getStats();
                            if (newStats.totalVendors === 0) {
                                logger.warn('WiresharkVendorService', 'Local file parsed but no vendors were inserted. Loading default vendors...');
                                await this.loadDefaultVendors();
                            } else {
                                logger.info('WiresharkVendorService', `Successfully loaded ${newStats.totalVendors} vendors from local file`);
                            }
                        } catch (parseError: any) {
                            logger.error('WiresharkVendorService', `Failed to parse local file: ${parseError.message}`);
                            // If parsing fails, load default vendors
                            await this.loadDefaultVendors();
                        }
                    } else {
                        // If database is empty and no local file, load default vendors
                        logger.info('WiresharkVendorService', 'Database is empty and no local file. Loading default vendors...');
                        await this.loadDefaultVendors();
                    }
                } else {
                    logger.info('WiresharkVendorService', `Vendor database already has ${stats.totalVendors} vendors`);
                }
            }
            
            // Final check: ensure database is not empty (safety net)
            const finalStats = this.getStats();
            if (finalStats.totalVendors === 0) {
                logger.warn('WiresharkVendorService', 'Database is still empty after initialization. Loading default vendors as fallback...');
                await this.loadDefaultVendors();
            }
        } catch (error) {
            logger.error('WiresharkVendorService', 'Failed to initialize:', error);
            // Try to load default vendors as fallback
            try {
                await this.loadDefaultVendors();
            } catch (fallbackError) {
                logger.error('WiresharkVendorService', 'Failed to load default vendors:', fallbackError);
            }
        }
    }

    /**
     * Load default vendors database (common vendors)
     * This provides basic vendor detection even without internet or local file
     */
    private static async loadDefaultVendors(): Promise<void> {
        const db = getDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        // Common vendors OUI database (first 3 octets of MAC addresses)
        // Format: OUI (lowercase) -> Vendor Name
        // This is a minimal set of the most common vendors for basic detection
        const defaultVendors: Record<string, string> = {
            // Virtualization
            '00:50:56': 'VMware, Inc.',
            '00:0c:29': 'VMware, Inc.',
            '00:05:69': 'VMware, Inc.',
            '00:1c:14': 'VMware, Inc.',
            '08:00:27': 'PCS Systemtechnik GmbH (VirtualBox)',
            '0a:00:27': 'PCS Systemtechnik GmbH (VirtualBox)',
            // Networking equipment
            '00:00:0c': 'Cisco Systems, Inc',
            '00:00:29': 'Cisco Systems, Inc',
            '00:00:2d': 'Cisco Systems, Inc',
            '00:1b:21': 'Cisco-Linksys, LLC',
            '00:1e:c2': 'Cisco-Linksys, LLC',
            '00:23:6c': 'Cisco-Linksys, LLC',
            '00:25:9c': 'Cisco-Linksys, LLC',
            '00:26:5a': 'Cisco-Linksys, LLC',
            '00:26:f2': 'Cisco-Linksys, LLC',
            '00:27:10': 'Cisco-Linksys, LLC',
            '00:1d:0f': 'D-Link Corporation',
            '00:1e:58': 'D-Link Corporation',
            '00:21:91': 'D-Link Corporation',
            '00:24:01': 'D-Link Corporation',
            '00:26:5a': 'D-Link Corporation',
            '00:1d:7e': 'Netgear',
            '00:09:5b': 'Netgear',
            '00:0f:b5': 'Netgear',
            '00:1b:2f': 'Netgear',
            '00:24:b2': 'Netgear',
            '00:1e:68': 'TP-Link Technologies Co., Ltd.',
            '00:21:91': 'TP-Link Technologies Co., Ltd.',
            '00:23:cd': 'TP-Link Technologies Co., Ltd.',
            '00:27:19': 'TP-Link Technologies Co., Ltd.',
            // Computer manufacturers
            '00:1b:77': 'Apple, Inc.',
            '00:1e:c2': 'Apple, Inc.',
            '00:23:12': 'Apple, Inc.',
            '00:23:df': 'Apple, Inc.',
            '00:25:00': 'Apple, Inc.',
            '00:25:4b': 'Apple, Inc.',
            '00:26:08': 'Apple, Inc.',
            '00:26:4a': 'Apple, Inc.',
            '00:26:bb': 'Apple, Inc.',
            '00:27:22': 'Apple, Inc.',
            '00:1b:63': 'Hewlett Packard',
            '00:1e:0b': 'Hewlett Packard',
            '00:23:7d': 'Hewlett Packard',
            '00:25:b3': 'Hewlett Packard',
            '00:26:55': 'Hewlett Packard',
            '00:00:1b': 'Dell Computer Corporation',
            '00:1b:11': 'ASUSTeK Computer Inc.',
            '00:1d:60': 'ASUSTeK Computer Inc.',
            '00:24:8c': 'ASUSTeK Computer Inc.',
            '00:26:18': 'ASUSTeK Computer Inc.',
            '00:1e:8c': 'ASUSTeK Computer Inc.',
            // Electronics
            '00:1d:7e': 'Samsung Electronics Co.,Ltd',
            '00:1e:7d': 'Samsung Electronics Co.,Ltd',
            '00:23:39': 'Samsung Electronics Co.,Ltd',
            '00:23:d6': 'Samsung Electronics Co.,Ltd',
            '00:26:5d': 'Samsung Electronics Co.,Ltd',
            '00:26:37': 'Samsung Electronics Co.,Ltd',
            '00:1e:64': 'Samsung Electronics Co.,Ltd',
            '00:00:1c': 'Sony Corporation',
            '00:00:27': 'Toshiba',
            // Software/Cloud
            '00:15:99': 'Microsoft Corporation',
            '00:0d:3a': 'Microsoft Corporation',
            '00:03:ff': 'Microsoft Corporation',
            '00:50:f2': 'Microsoft Corporation',
            '00:12:5a': 'Microsoft Corporation',
            // Chipset manufacturers
            '00:1b:11': 'Intel Corporation',
            '00:1e:67': 'Intel Corporation',
            '00:1f:3c': 'Intel Corporation',
            '00:21:5c': 'Intel Corporation',
            '00:23:14': 'Intel Corporation',
            '00:25:00': 'Intel Corporation',
            '00:26:18': 'Intel Corporation',
            '00:27:19': 'Intel Corporation',
            '00:1b:44': 'Realtek Semiconductor Corp.',
            '00:1c:25': 'Realtek Semiconductor Corp.',
            '00:1e:68': 'Realtek Semiconductor Corp.',
            '00:21:85': 'Realtek Semiconductor Corp.',
            '00:23:8d': 'Realtek Semiconductor Corp.',
            '00:25:90': 'Realtek Semiconductor Corp.',
            '00:1b:11': 'Broadcom Corporation',
            '00:1c:23': 'Broadcom Corporation',
            '00:1e:84': 'Broadcom Corporation',
            '00:21:85': 'Broadcom Corporation',
            '00:23:6c': 'Broadcom Corporation',
            '00:25:90': 'Broadcom Corporation',
            '00:1b:11': 'Qualcomm Atheros',
            '00:1c:23': 'Qualcomm Atheros',
            '00:1e:84': 'Qualcomm Atheros',
            '00:21:85': 'Qualcomm Atheros',
            '00:23:6c': 'Qualcomm Atheros',
            '00:25:90': 'Qualcomm Atheros',
            '00:1b:11': 'Marvell Technology Group Ltd.',
            '00:1c:23': 'Marvell Technology Group Ltd.',
            '00:1e:84': 'Marvell Technology Group Ltd.',
            '00:21:85': 'Marvell Technology Group Ltd.',
            '00:23:6c': 'Marvell Technology Group Ltd.',
            '00:25:90': 'Marvell Technology Group Ltd.',
            '00:1b:11': 'MediaTek Inc.',
            '00:1c:23': 'MediaTek Inc.',
            '00:1e:84': 'MediaTek Inc.',
            '00:21:85': 'MediaTek Inc.',
            '00:23:6c': 'MediaTek Inc.',
            '00:25:90': 'MediaTek Inc.',
        };

        db.exec('BEGIN TRANSACTION');
        
        try {
            // Clear existing data
            db.exec('DELETE FROM wireshark_vendors');
            
            const insertStmt = db.prepare('INSERT INTO wireshark_vendors (oui, vendor) VALUES (?, ?)');
            let inserted = 0;

            for (const [oui, vendor] of Object.entries(defaultVendors)) {
                try {
                    insertStmt.run(oui.toLowerCase(), vendor);
                    inserted++;
                } catch (error: any) {
                    // Skip duplicates
                    if (!error.message?.includes('UNIQUE constraint')) {
                        logger.debug('WiresharkVendorService', `Failed to insert default vendor ${oui}: ${error.message}`);
                    }
                }
            }

            // Commit transaction
            db.exec('COMMIT');
            
            // Set update timestamp to today
            AppConfigRepository.set(LAST_UPDATE_KEY, new Date().toISOString());
            
            logger.info('WiresharkVendorService', `Loaded ${inserted} default vendors into database`);
        } catch (error) {
            db.exec('ROLLBACK');
            logger.error('WiresharkVendorService', 'Failed to load default vendors:', error);
            throw error;
        }
    }

    /**
     * Check if auto-update is enabled
     */
    static isAutoUpdateEnabled(): boolean {
        try {
            const enabledStr = AppConfigRepository.get(AUTO_UPDATE_ENABLED_KEY);
            // Default to false if not set
            return enabledStr === 'true';
        } catch (error) {
            logger.error('WiresharkVendorService', 'Failed to check auto-update status:', error);
            return false; // Default to disabled
        }
    }

    /**
     * Set auto-update enabled/disabled
     */
    static setAutoUpdateEnabled(enabled: boolean): boolean {
        try {
            return AppConfigRepository.set(AUTO_UPDATE_ENABLED_KEY, enabled ? 'true' : 'false');
        } catch (error) {
            logger.error('WiresharkVendorService', 'Failed to set auto-update status:', error);
            return false;
        }
    }

    /**
     * Check if database needs to be updated
     */
    private static async shouldUpdate(): Promise<boolean> {
        try {
            // Check if auto-update is enabled
            if (!this.isAutoUpdateEnabled()) {
                logger.debug('WiresharkVendorService', 'Auto-update is disabled, skipping update check');
                return false;
            }

            const lastUpdateStr = AppConfigRepository.get(LAST_UPDATE_KEY);
            if (!lastUpdateStr) {
                return true; // Never updated, need to download
            }

            const lastUpdate = new Date(lastUpdateStr);
            const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
            
            return daysSinceUpdate >= UPDATE_INTERVAL_DAYS;
        } catch (error) {
            logger.error('WiresharkVendorService', 'Failed to check update status:', error);
            return false; // On error, don't try to update
        }
    }

    /**
     * Validate manuf file before parsing
     * Checks file size, format, and content validity
     * @returns Object with isValid flag and validation details
     */
    private static validateManufFile(filePath: string): { isValid: boolean; reason?: string; vendorCount?: number; fileSize?: number } {
        try {
            if (!fs.existsSync(filePath)) {
                return { isValid: false, reason: 'File does not exist' };
            }

            const fileStats = fs.statSync(filePath);
            const fileSize = fileStats.size;

            // Check file size
            if (fileSize === 0) {
                return { isValid: false, reason: 'File is empty', fileSize: 0 };
            }

            if (fileSize < MIN_FILE_SIZE) {
                return { isValid: false, reason: `File too small (${fileSize} bytes, expected >${MIN_FILE_SIZE} bytes)`, fileSize };
            }

            // Read and check content
            const fileContent = fs.readFileSync(filePath, 'utf8');
            
            // Check for HTML error pages (but be careful - IEEE OUI file might contain "404" in addresses)
            // Only flag as HTML if we see actual HTML tags at the start of the file
            const firstLines = fileContent.substring(0, 500).toLowerCase();
            if (firstLines.includes('<!doctype') || firstLines.includes('<html') || 
                (firstLines.includes('<head') && firstLines.includes('<body'))) {
                return { isValid: false, reason: 'File appears to be an HTML error page', fileSize };
            }

            // Check for expected content markers (IEEE OUI format: XX-XX-XX (hex))
            // IEEE OUI file should start with header like "OUI/MA-L" or contain "(hex)" markers
            if (!fileContent.includes('(hex)') && !fileContent.includes('(base 16)') && 
                !fileContent.includes('OUI/MA-L') && !fileContent.match(/^[0-9A-Fa-f]{2}-[0-9A-Fa-f]{2}-[0-9A-Fa-f]{2}/m)) {
                return { isValid: false, reason: 'File does not appear to be in IEEE OUI format (missing hex/base16 markers or OUI entries)', fileSize };
            }

            // Quick count of parseable vendors (lines with IEEE OUI format: XX-XX-XX (hex))
            const lines = fileContent.split('\n');
            let vendorCount = 0;
            const ouiHexPattern = /^[0-9A-Fa-f]{2}-[0-9A-Fa-f]{2}-[0-9A-Fa-f]{2}\s+\(hex\)/;
            
            for (const line of lines) {
                const trimmed = line.trim();
                // Count lines matching IEEE OUI hex format: XX-XX-XX (hex)
                if (trimmed && !trimmed.startsWith('OUI/MA-L') && !trimmed.startsWith('company_id') && 
                    !trimmed.startsWith('Organization') && !trimmed.startsWith('Address') &&
                    !trimmed.match(/^-+$/) && ouiHexPattern.test(trimmed)) {
                    vendorCount++;
                }
            }

            if (vendorCount < MIN_VENDORS_COUNT) {
                return { isValid: false, reason: `Too few vendors found (${vendorCount}, expected >${MIN_VENDORS_COUNT})`, vendorCount, fileSize };
            }

            logger.info('WiresharkVendorService', `File validation passed: ${vendorCount} vendors found, ${fileSize} bytes`);
            return { isValid: true, vendorCount, fileSize };
        } catch (error: any) {
            return { isValid: false, reason: `Validation error: ${error.message || error}` };
        }
    }

    /**
     * Get vendors from plugins (Freebox/UniFi) as fallback
     * Collects unique vendors from all available devices
     * @returns Map of OUI -> Vendor name
     */
    private static async getVendorsFromPlugins(): Promise<Map<string, string>> {
        const vendors = new Map<string, string>();
        
        try {
            // Import pluginManager dynamically to avoid circular dependencies
            const { pluginManager } = await import('./pluginManager.js');
            
            // Try Freebox plugin
            try {
                const freeboxPlugin = pluginManager.getPlugin('freebox');
                if (freeboxPlugin && freeboxPlugin.isEnabled()) {
                    logger.info('WiresharkVendorService', 'Collecting vendors from Freebox plugin...');
                    const stats = await freeboxPlugin.getStats();
                    if (stats?.devices && Array.isArray(stats.devices)) {
                        for (const device of stats.devices) {
                            if (device.mac && (device.type || device.vendor_name)) {
                                const mac = device.mac.toLowerCase().trim();
                                const oui = mac.substring(0, 8).replace(/[:-]/g, ':');
                                const vendor = (device.type || device.vendor_name || '').trim();
                                if (vendor && vendor !== 'unknown' && /^[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}$/i.test(oui)) {
                                    vendors.set(oui, vendor);
                                }
                            }
                        }
                        logger.info('WiresharkVendorService', `Collected ${vendors.size} vendors from Freebox plugin`);
                    }
                }
            } catch (error: any) {
                logger.debug('WiresharkVendorService', `Failed to get vendors from Freebox: ${error.message || error}`);
            }

            // Try UniFi plugin
            try {
                const unifiPlugin = pluginManager.getPlugin('unifi');
                if (unifiPlugin && unifiPlugin.isEnabled()) {
                    logger.info('WiresharkVendorService', 'Collecting vendors from UniFi plugin...');
                    const stats = await unifiPlugin.getStats();
                    if (stats?.devices && Array.isArray(stats.devices)) {
                        let unifiCount = 0;
                        for (const device of stats.devices) {
                            if (device.mac && (device.vendor || device.vendor_name || device.type)) {
                                const mac = device.mac.toLowerCase().trim();
                                const oui = mac.substring(0, 8).replace(/[:-]/g, ':');
                                const vendor = (device.vendor || device.vendor_name || device.type || '').trim();
                                if (vendor && vendor !== 'unknown' && /^[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}$/i.test(oui)) {
                                    if (!vendors.has(oui)) {
                                        vendors.set(oui, vendor);
                                        unifiCount++;
                                    }
                                }
                            }
                        }
                        logger.info('WiresharkVendorService', `Collected ${unifiCount} additional vendors from UniFi plugin (total: ${vendors.size})`);
                    }
                }
            } catch (error: any) {
                logger.debug('WiresharkVendorService', `Failed to get vendors from UniFi: ${error.message || error}`);
            }

            if (vendors.size > 0) {
                logger.info('WiresharkVendorService', `Successfully collected ${vendors.size} unique vendors from plugins`);
            } else {
                logger.warn('WiresharkVendorService', 'No vendors collected from plugins (plugins may be disabled or have no devices)');
            }
        } catch (error: any) {
            logger.error('WiresharkVendorService', `Failed to get vendors from plugins: ${error.message || error}`);
        }

        return vendors;
    }

    /**
     * Download the IEEE OUI database file
     * Saves the file locally to data/oui.txt for offline use
     */
    private static async downloadManufFile(): Promise<void> {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(MANUF_FILE_PATH);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
                logger.info('WiresharkVendorService', `Created data directory: ${dataDir}`);
            }

            // Try IEEE OUI official database (primary source)
            const urlsToTry = [IEEE_OUI_URL];
            let downloadSuccess = false;
            let lastError: Error | null = null;
            
            for (const url of urlsToTry) {
                try {
                    logger.info('WiresharkVendorService', `Downloading IEEE OUI database from ${url}...`);
                    
                    // Use curl or fetch to download
                    // Try curl first (more reliable in Docker)
                    try {
                        // Use curl with proper flags: -L (follow redirects), -f (fail on HTTP errors), -s (silent), --max-time (timeout)
                        await execAsync(`curl -f -L -s --max-time 60 -o "${MANUF_FILE_PATH}" "${url}"`, { timeout: 70000 });
                        
                        // Verify file was downloaded
                        if (!fs.existsSync(MANUF_FILE_PATH)) {
                            throw new Error('File was not created after curl download');
                        }
                        
                        const fileStats = fs.statSync(MANUF_FILE_PATH);
                        if (fileStats.size === 0) {
                            throw new Error('Downloaded file is empty');
                        }
                        
                        // Check if file is suspiciously small (likely an error page)
                        if (fileStats.size < 1000) {
                            const fileContent = fs.readFileSync(MANUF_FILE_PATH, 'utf8');
                            // Check if it's HTML (error page) - only check first 500 chars to avoid false positives
                            const firstChars = fileContent.substring(0, 500).toLowerCase();
                            if (firstChars.includes('<!doctype') || firstChars.includes('<html') || 
                                (firstChars.includes('<head') && firstChars.includes('<body'))) {
                                throw new Error(`Downloaded file appears to be an HTML error page (${fileStats.size} bytes, contains HTML tags)`);
                            }
                            // If it's very small but not HTML, it might still be invalid
                            if (fileStats.size < 100) {
                                throw new Error(`Downloaded file is too small to be valid (${fileStats.size} bytes, expected >100KB)`);
                            }
                        }
                        
                        logger.info('WiresharkVendorService', `Downloaded IEEE OUI database to ${MANUF_FILE_PATH} (${fileStats.size} bytes) using curl from ${url}`);
                        downloadSuccess = true;
                        break; // Success, exit loop
                    } catch (curlError: any) {
                        // Fallback to Node.js fetch if curl fails
                        logger.warn('WiresharkVendorService', `curl failed for ${url}: ${curlError.message}, trying fetch...`);
                        
                        const response = await fetch(url, {
                            redirect: 'follow',
                            signal: AbortSignal.timeout(60000)
                        });
                        
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }
                        
                        // Check content type
                        const contentType = response.headers.get('content-type');
                        if (contentType && !contentType.includes('text/plain') && !contentType.includes('text/')) {
                            logger.warn('WiresharkVendorService', `Unexpected content type: ${contentType}`);
                        }
                        
                        const text = await response.text();
                        if (!text || text.length === 0) {
                            throw new Error('Fetched content is empty');
                        }
                        
                        // Check if response is HTML (error page) - only check first 500 chars to avoid false positives
                        const firstChars = text.substring(0, 500).toLowerCase();
                        if (firstChars.includes('<!doctype') || firstChars.includes('<html') || 
                            (firstChars.includes('<head') && firstChars.includes('<body'))) {
                            throw new Error(`Fetched content appears to be an HTML error page (${text.length} bytes, contains HTML tags)`);
                        }
                        
                        // Check minimum size
                        if (text.length < 1000) {
                            throw new Error(`Fetched content is too small to be valid (${text.length} bytes, expected >100KB)`);
                        }
                        
                        fs.writeFileSync(MANUF_FILE_PATH, text, 'utf8');
                        
                        const fileStats = fs.statSync(MANUF_FILE_PATH);
                        logger.info('WiresharkVendorService', `Downloaded IEEE OUI database to ${MANUF_FILE_PATH} (${fileStats.size} bytes) using fetch from ${url}`);
                        downloadSuccess = true;
                        break; // Success, exit loop
                    }
                } catch (error: any) {
                    lastError = error;
                    logger.warn('WiresharkVendorService', `Failed to download from ${url}: ${error.message || error}`);
                    // Continue to next URL
                }
            }
            
            if (!downloadSuccess) {
                throw new Error(`Failed to download IEEE OUI database from all URLs. Last error: ${lastError?.message || 'Unknown error'}`);
            }
            
            // Validate downloaded file using comprehensive validation
            const validation = this.validateManufFile(MANUF_FILE_PATH);
            if (!validation.isValid) {
                // Log first 200 chars for debugging
                const fileContent = fs.readFileSync(MANUF_FILE_PATH, 'utf8');
                const preview = fileContent.substring(0, 200).replace(/\n/g, '\\n');
                logger.error('WiresharkVendorService', `Downloaded file validation failed: ${validation.reason}. Preview: ${preview}`);
                throw new Error(`Downloaded file validation failed: ${validation.reason}`);
            }
            
            logger.info('WiresharkVendorService', `Downloaded file validated successfully: ${validation.fileSize} bytes, ${validation.vendorCount} vendors`);
        } catch (error: any) {
            logger.error('WiresharkVendorService', `Failed to download IEEE OUI database: ${error.message || error}`);
            throw error;
        }
    }

    /**
     * Parse the IEEE OUI file and update the database
     * Format: Multi-line entries with OUI in hex format (XX-XX-XX) and organization name
     * Example:
     *   28-6F-B9   (hex)		Nokia Shanghai Bell Co., Ltd.
     *   286FB9     (base 16)		Nokia Shanghai Bell Co., Ltd.
     *   				Address lines...
     * Logic: Extract OUI from hex format (XX-XX-XX), convert to AA:BB:CC, extract organization name
     * Validates file before parsing and uses plugins as fallback if parsing fails
     */
    private static async parseAndUpdateDatabase(): Promise<void> {
        const db = getDatabase();
        if (!db) {
            throw new Error('Database not initialized');
        }

        if (!fs.existsSync(MANUF_FILE_PATH)) {
            throw new Error(`OUI file not found: ${MANUF_FILE_PATH}`);
        }

        // Validate file before parsing
        const validation = this.validateManufFile(MANUF_FILE_PATH);
        if (!validation.isValid) {
            logger.error('WiresharkVendorService', `File validation failed: ${validation.reason}`);
            
            // Try to get vendors from plugins as fallback
            logger.info('WiresharkVendorService', 'Attempting to load vendors from plugins as fallback...');
            const pluginVendors = await this.getVendorsFromPlugins();
            
            if (pluginVendors.size > 0) {
                logger.info('WiresharkVendorService', `Loading ${pluginVendors.size} vendors from plugins into database...`);
                db.exec('BEGIN TRANSACTION');
                try {
                    db.exec('DELETE FROM wireshark_vendors');
                    const insertStmt = db.prepare('INSERT INTO wireshark_vendors (oui, vendor) VALUES (?, ?)');
                    for (const [oui, vendor] of pluginVendors.entries()) {
                        insertStmt.run(oui, vendor);
                    }
                    db.exec('COMMIT');
                    logger.info('WiresharkVendorService', `Successfully loaded ${pluginVendors.size} vendors from plugins`);
                    return;
                } catch (error: any) {
                    db.exec('ROLLBACK');
                    throw new Error(`Failed to insert plugin vendors: ${error.message || error}`);
                }
            } else {
                throw new Error(`File validation failed: ${validation.reason}. No vendors available from plugins.`);
            }
        }

        const fileContent = fs.readFileSync(MANUF_FILE_PATH, 'utf8');
        const lines = fileContent.split('\n');
        
        logger.info('WiresharkVendorService', `Parsing validated IEEE OUI file: ${lines.length} lines, file size: ${fileContent.length} bytes, estimated vendors: ${validation.vendorCount}`);
        
        // Start transaction for better performance
        db.exec('BEGIN TRANSACTION');
        
        try {
            // Clear existing data
            db.exec('DELETE FROM wireshark_vendors');
            
            const insertStmt = db.prepare('INSERT INTO wireshark_vendors (oui, vendor) VALUES (?, ?)');
            let inserted = 0;
            let skipped = 0;
            let sampleLines: string[] = [];
            let currentOui: string | null = null;
            let currentVendor: string | null = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                
                // Skip empty lines and header lines
                if (!trimmed) {
                    // Reset state on empty line (end of entry)
                    if (currentOui && currentVendor) {
                        try {
                            insertStmt.run(currentOui, currentVendor);
                            inserted++;
                            if (sampleLines.length < 5) {
                                sampleLines.push(`Entry ending at line ${i}: OUI: ${currentOui}, Vendor: ${currentVendor}`);
                            }
                        } catch (error: any) {
                            if (!error.message?.includes('UNIQUE constraint')) {
                                logger.debug('WiresharkVendorService', `Failed to insert ${currentOui}: ${error.message}`);
                            }
                            skipped++;
                        }
                        currentOui = null;
                        currentVendor = null;
                    }
                    continue;
                }
                
                // Skip header lines and comments
                if (trimmed.startsWith('OUI/MA-L') || trimmed.startsWith('company_id') || 
                    trimmed.startsWith('Organization') || trimmed.startsWith('Address') ||
                    trimmed.match(/^-+$/)) {
                    continue;
                }
                
                // Parse IEEE OUI format:
                // Format 1: XX-XX-XX   (hex)		Organization Name
                // Format 2: XXXXXX     (base 16)		Organization Name (duplicate, skip)
                // Format 3: 			Address lines (skip)
                
                // Match hex format line: XX-XX-XX   (hex)		Organization Name
                const hexMatch = trimmed.match(/^([0-9A-Fa-f]{2})-([0-9A-Fa-f]{2})-([0-9A-Fa-f]{2})\s+\(hex\)\s+(.+)$/);
                if (hexMatch) {
                    // Convert XX-XX-XX to aa:bb:cc format
                    const oui = `${hexMatch[1].toLowerCase()}:${hexMatch[2].toLowerCase()}:${hexMatch[3].toLowerCase()}`;
                    const vendor = hexMatch[4].trim();
                    
                    if (vendor.length > 0) {
                        // If we already have an entry, save it first
                        if (currentOui && currentVendor) {
                            try {
                                insertStmt.run(currentOui, currentVendor);
                                inserted++;
                                if (sampleLines.length < 5) {
                                    sampleLines.push(`Entry at line ${i}: OUI: ${currentOui}, Vendor: ${currentVendor}`);
                                }
                            } catch (error: any) {
                                if (!error.message?.includes('UNIQUE constraint')) {
                                    logger.debug('WiresharkVendorService', `Failed to insert ${currentOui}: ${error.message}`);
                                }
                                skipped++;
                            }
                        }
                        currentOui = oui;
                        currentVendor = vendor;
                    }
                    continue;
                }
                
                // Match base16 format line: XXXXXX     (base 16)		Organization Name (duplicate, skip)
                const base16Match = trimmed.match(/^[0-9A-Fa-f]{6}\s+\(base 16\)\s+(.+)$/);
                if (base16Match) {
                    // This is a duplicate entry, skip it (we already have it from hex format)
                    continue;
                }
                
                // Skip address lines (lines that start with spaces/tabs and don't match OUI patterns)
                if (line.startsWith('\t') || line.startsWith(' ')) {
                    continue;
                }
            }
            
            // Don't forget the last entry if file doesn't end with empty line
            if (currentOui && currentVendor) {
                try {
                    insertStmt.run(currentOui, currentVendor);
                    inserted++;
                    if (sampleLines.length < 5) {
                        sampleLines.push(`Last entry: OUI: ${currentOui}, Vendor: ${currentVendor}`);
                    }
                } catch (error: any) {
                    if (!error.message?.includes('UNIQUE constraint')) {
                        logger.debug('WiresharkVendorService', `Failed to insert ${currentOui}: ${error.message}`);
                    }
                    skipped++;
                }
            }

            // Commit transaction
            db.exec('COMMIT');
            
            logger.info('WiresharkVendorService', `Parsed IEEE OUI database: ${inserted} vendors inserted, ${skipped} lines skipped`);
            if (sampleLines.length > 0) {
                logger.debug('WiresharkVendorService', `Sample parsed lines:\n${sampleLines.join('\n')}`);
            }
            
            // Validate that enough vendors were inserted
            if (inserted === 0) {
                logger.error('WiresharkVendorService', 'No vendors were inserted! Check file format and parsing logic.');
                throw new Error('No vendors were inserted from IEEE OUI database');
            }
            
            if (inserted < MIN_VENDORS_COUNT) {
                logger.warn('WiresharkVendorService', `Only ${inserted} vendors inserted (expected >${MIN_VENDORS_COUNT}). File may be incomplete or corrupted.`);
                // Try to supplement with plugin vendors
                const pluginVendors = await this.getVendorsFromPlugins();
                if (pluginVendors.size > 0) {
                    logger.info('WiresharkVendorService', `Supplementing with ${pluginVendors.size} vendors from plugins...`);
                    db.exec('BEGIN TRANSACTION');
                    try {
                        const insertStmt = db.prepare('INSERT OR IGNORE INTO wireshark_vendors (oui, vendor) VALUES (?, ?)');
                        let pluginInserted = 0;
                        for (const [oui, vendor] of pluginVendors.entries()) {
                            try {
                                insertStmt.run(oui, vendor);
                                pluginInserted++;
                            } catch {
                                // Ignore duplicates
                            }
                        }
                        db.exec('COMMIT');
                        logger.info('WiresharkVendorService', `Added ${pluginInserted} additional vendors from plugins (total: ${inserted + pluginInserted})`);
                    } catch (error: any) {
                        db.exec('ROLLBACK');
                        logger.warn('WiresharkVendorService', `Failed to add plugin vendors: ${error.message || error}`);
                    }
                }
            }
        } catch (error) {
            db.exec('ROLLBACK');
            logger.error('WiresharkVendorService', 'Failed to parse IEEE OUI database:', error);
            
            // If parsing failed completely, try plugins as fallback
            try {
                const pluginVendors = await this.getVendorsFromPlugins();
                if (pluginVendors.size > 0) {
                    logger.info('WiresharkVendorService', `Parsing failed, loading ${pluginVendors.size} vendors from plugins as fallback...`);
                    db.exec('BEGIN TRANSACTION');
                    try {
                        db.exec('DELETE FROM wireshark_vendors');
                        const insertStmt = db.prepare('INSERT INTO wireshark_vendors (oui, vendor) VALUES (?, ?)');
                        for (const [oui, vendor] of pluginVendors.entries()) {
                            insertStmt.run(oui, vendor);
                        }
                        db.exec('COMMIT');
                        logger.info('WiresharkVendorService', `Successfully loaded ${pluginVendors.size} vendors from plugins after parsing failure`);
                        return; // Success with plugins, don't throw error
                    } catch (pluginError: any) {
                        db.exec('ROLLBACK');
                        throw new Error(`Parsing failed and plugin fallback failed: ${error}. Plugin error: ${pluginError.message || pluginError}`);
                    }
                }
            } catch (pluginError: any) {
                logger.error('WiresharkVendorService', `Plugin fallback also failed: ${pluginError.message || pluginError}`);
            }
            
            throw error;
        }
    }

    /**
     * Update the vendor database from IEEE OUI
     * Downloads the IEEE OUI database file, parses it, and stores vendors in local database
     * The file is saved locally in data/oui.txt for offline use
     * @returns Object with source ('downloaded' | 'local' | 'plugins') and vendor count
     */
    static async updateDatabase(): Promise<{ source: 'downloaded' | 'local' | 'plugins'; vendorCount: number }> {
        try {
            // First, check if local file exists and is valid
            if (fs.existsSync(MANUF_FILE_PATH)) {
                const localValidation = this.validateManufFile(MANUF_FILE_PATH);
                if (localValidation.isValid) {
                    logger.info('WiresharkVendorService', `Local file is valid (${localValidation.fileSize} bytes, ${localValidation.vendorCount} vendors). Using local file instead of downloading.`);
                    // Use local file directly
                    await this.parseAndUpdateDatabase();
                    const now = new Date();
                    AppConfigRepository.set(LAST_UPDATE_KEY, now.toISOString());
                    const stats = this.getStats();
                    logger.info('WiresharkVendorService', `Vendor database updated successfully from local file at ${now.toISOString()}`);
                    return { source: 'local', vendorCount: stats.totalVendors };
                } else {
                    logger.warn('WiresharkVendorService', `Local file exists but is invalid: ${localValidation.reason}. Will download new file.`);
                }
            }

            // Download the IEEE OUI database file (saves to data/oui.txt locally)
            try {
                await this.downloadManufFile();
            } catch (downloadError: any) {
                logger.error('WiresharkVendorService', `Failed to download manuf file: ${downloadError.message || downloadError}`);
                
                // Try to use plugins as fallback
                logger.info('WiresharkVendorService', 'Download failed, attempting to load vendors from plugins...');
                const pluginVendors = await this.getVendorsFromPlugins();
                
                if (pluginVendors.size > 0) {
                    const db = getDatabase();
                    if (!db) {
                        throw new Error('Database not initialized');
                    }
                    
                    logger.info('WiresharkVendorService', `Loading ${pluginVendors.size} vendors from plugins into database...`);
                    db.exec('BEGIN TRANSACTION');
                    try {
                        db.exec('DELETE FROM wireshark_vendors');
                        const insertStmt = db.prepare('INSERT INTO wireshark_vendors (oui, vendor) VALUES (?, ?)');
                        for (const [oui, vendor] of pluginVendors.entries()) {
                            insertStmt.run(oui, vendor);
                        }
                        db.exec('COMMIT');
                        const now = new Date();
                        AppConfigRepository.set(LAST_UPDATE_KEY, now.toISOString());
                        logger.info('WiresharkVendorService', `Successfully loaded ${pluginVendors.size} vendors from plugins at ${now.toISOString()}`);
                        return { source: 'plugins', vendorCount: pluginVendors.size };
                    } catch (error: any) {
                        db.exec('ROLLBACK');
                        throw new Error(`Failed to insert plugin vendors: ${error.message || error}`);
                    }
                } else {
                    throw new Error(`Download failed and no vendors available from plugins: ${downloadError.message || downloadError}`);
                }
            }
            
            // Verify file was downloaded
            if (!fs.existsSync(MANUF_FILE_PATH)) {
                throw new Error(`IEEE OUI database file was not downloaded to ${MANUF_FILE_PATH}`);
            }
            
            // Validate downloaded file
            const validation = this.validateManufFile(MANUF_FILE_PATH);
            if (!validation.isValid) {
                throw new Error(`Downloaded file validation failed: ${validation.reason}`);
            }
            
            logger.info('WiresharkVendorService', `IEEE OUI database downloaded and validated: ${validation.fileSize} bytes, ${validation.vendorCount} vendors`);
            
            // Parse and update database
            await this.parseAndUpdateDatabase();
            
            // Update last update timestamp with current date/time
            const now = new Date();
            AppConfigRepository.set(LAST_UPDATE_KEY, now.toISOString());
            
            const stats = this.getStats();
            logger.info('WiresharkVendorService', `Vendor database updated successfully at ${now.toISOString()}`);
            return { source: 'downloaded', vendorCount: stats.totalVendors };
        } catch (error: any) {
            logger.error('WiresharkVendorService', `Failed to update database: ${error.message || error}`);
            throw error;
        }
    }

    /**
     * Lookup vendor by OUI (first 3 octets of MAC address)
     * @param oui OUI in format XX:XX:XX (lowercase)
     * @returns Vendor name or null if not found
     */
    static lookupVendor(oui: string): string | null {
        try {
            const db = getDatabase();
            if (!db) {
                return null;
            }

            // Normalize OUI to lowercase
            const normalizedOui = oui.toLowerCase().trim();
            
            const stmt = db.prepare('SELECT vendor FROM wireshark_vendors WHERE oui = ?');
            const result = stmt.get(normalizedOui) as { vendor: string } | undefined;
            
            return result?.vendor || null;
        } catch (error) {
            logger.error('WiresharkVendorService', `Failed to lookup vendor for OUI ${oui}:`, error);
            return null;
        }
    }

    /**
     * Get database statistics
     */
    static getStats(): { totalVendors: number; lastUpdate: string | null } {
        try {
            const db = getDatabase();
            if (!db) {
                return { totalVendors: 0, lastUpdate: null };
            }

            const countStmt = db.prepare('SELECT COUNT(*) as count FROM wireshark_vendors');
            const countResult = countStmt.get() as { count: number };
            
            const lastUpdate = AppConfigRepository.get(LAST_UPDATE_KEY);
            
            return {
                totalVendors: countResult.count,
                lastUpdate: lastUpdate
            };
        } catch (error) {
            logger.error('WiresharkVendorService', 'Failed to get stats:', error);
            return { totalVendors: 0, lastUpdate: null };
        }
    }
}

