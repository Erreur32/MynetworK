/**
 * Vendor Detection Service
 * 
 * Detects hardware vendor/manufacturer from MAC address using OUI (Organizationally Unique Identifier)
 * Inspired by WatchYourLAN's vendor detection approach
 */

import { logger } from '../utils/logger.js';
import { WiresharkVendorService } from './wiresharkVendorService.js';

/**
 * OUI Database - Common vendor prefixes
 * This is a subset of the IEEE OUI database for common vendors
 * For a complete database, we could use an external API or download the full IEEE OUI list
 */
const OUI_DATABASE: Record<string, string> = {
    // Apple
    '00:1e:c2': 'Apple',
    '00:23:df': 'Apple',
    '00:25:00': 'Apple',
    '00:25:4b': 'Apple',
    '00:26:08': 'Apple',
    '00:26:4a': 'Apple',
    '00:26:bb': 'Apple',
    '00:50:e4': 'Apple',
    '04:0c:ce': 'Apple',
    '04:15:52': 'Apple',
    '04:1e:64': 'Apple',
    '04:26:65': 'Apple',
    '04:4c:59': 'Apple',
    '04:52:f7': 'Apple',
    '04:54:53': 'Apple',
    '04:69:f8': 'Apple',
    '04:d3:cf': 'Apple',
    '04:db:56': 'Apple',
    '08:00:07': 'Apple',
    '08:66:98': 'Apple',
    '08:74:02': 'Apple',
    '0c:3e:9f': 'Apple',
    '0c:4d:e9': 'Apple',
    '0c:74:c2': 'Apple',
    '0c:bc:9f': 'Apple',
    '0c:d0:f8': 'Apple',
    '10:93:e9': 'Apple',
    '10:dd:b1': 'Apple',
    '14:10:9f': 'Apple',
    '14:7d:da': 'Apple',
    '14:99:e2': 'Apple',
    '18:20:32': 'Apple',
    '18:65:90': 'Apple',
    '18:af:61': 'Apple',
    '1c:1a:c0': 'Apple',
    '1c:ab:a7': 'Apple',
    '20:78:f0': 'Apple',
    '20:c9:d0': 'Apple',
    '24:a0:74': 'Apple',
    '24:ab:81': 'Apple',
    '28:37:37': 'Apple',
    '28:cf:da': 'Apple',
    '28:e0:2c': 'Apple',
    '2c:1f:23': 'Apple',
    '2c:33:7a': 'Apple',
    '30:90:ab': 'Apple',
    '34:15:9e': 'Apple',
    '34:c0:59': 'Apple',
    '38:c9:86': 'Apple',
    '3c:07:54': 'Apple',
    '3c:ab:8e': 'Apple',
    '40:33:1a': 'Apple',
    '40:cb:c0': 'Apple',
    '44:fb:42': 'Apple',
    '48:43:7c': 'Apple',
    '4c:8d:79': 'Apple',
    '50:ea:d6': 'Apple',
    '54:26:96': 'Apple',
    '54:72:4f': 'Apple',
    '58:55:ca': 'Apple',
    '5c:59:48': 'Apple',
    '5c:95:ae': 'Apple',
    '60:33:4b': 'Apple',
    '60:c5:47': 'Apple',
    '64:a3:cb': 'Apple',
    '68:96:7b': 'Apple',
    '6c:40:08': 'Apple',
    '6c:72:e7': 'Apple',
    '6c:8d:c1': 'Apple',
    '70:48:0f': 'Apple',
    '70:56:81': 'Apple',
    '74:e2:f5': 'Apple',
    '78:31:c1': 'Apple',
    '78:4f:43': 'Apple',
    '78:ca:39': 'Apple',
    '7c:6d:62': 'Apple',
    '80:be:05': 'Apple',
    '84:38:35': 'Apple',
    '84:85:06': 'Apple',
    '84:fc:fe': 'Apple',
    '88:63:df': 'Apple',
    '8c:85:90': 'Apple',
    '8c:fa:ba': 'Apple',
    '90:72:40': 'Apple',
    '94:e9:6a': 'Apple',
    '98:01:a7': 'Apple',
    '98:e0:d9': 'Apple',
    '9c:20:7b': 'Apple',
    '9c:84:bf': 'Apple',
    'a0:99:9b': 'Apple',
    'a4:5e:60': 'Apple',
    'a4:c3:61': 'Apple',
    'a8:60:b6': 'Apple',
    'a8:96:8a': 'Apple',
    'ac:1f:74': 'Apple',
    'ac:bc:32': 'Apple',
    'b0:65:bd': 'Apple',
    'b4:f0:ab': 'Apple',
    'b8:09:8a': 'Apple',
    'b8:c7:5d': 'Apple',
    'bc:3b:af': 'Apple',
    'bc:52:b7': 'Apple',
    'c0:25:e9': 'Apple',
    'c4:2c:03': 'Apple',
    'c8:1e:e7': 'Apple',
    'c8:2a:14': 'Apple',
    'c8:bc:c8': 'Apple',
    'cc:08:e0': 'Apple',
    'cc:29:f5': 'Apple',
    'd0:03:4b': 'Apple',
    'd0:23:db': 'Apple',
    'd4:9a:20': 'Apple',
    'd8:30:62': 'Apple',
    'd8:a2:5e': 'Apple',
    'dc:a9:04': 'Apple',
    'e0:ac:cb': 'Apple',
    'e4:ce:8f': 'Apple',
    'e8:40:40': 'Apple',
    'e8:80:2e': 'Apple',
    'ec:35:86': 'Apple',
    'f0:18:98': 'Apple',
    'f0:db:e2': 'Apple',
    'f4:0f:24': 'Apple',
    'f4:f1:5a': 'Apple',
    'f8:1e:df': 'Apple',
    'fc:25:3f': 'Apple',
    
    // Samsung
    '00:12:fb': 'Samsung',
    '00:15:99': 'Samsung',
    '00:16:6c': 'Samsung',
    '00:17:d9': 'Samsung',
    '00:1d:25': 'Samsung',
    '00:1e:7d': 'Samsung',
    '00:23:39': 'Samsung',
    '00:24:90': 'Samsung',
    '00:26:5d': 'Samsung',
    '00:26:e2': 'Samsung',
    '00:50:f1': 'Samsung',
    '04:fe:31': 'Samsung',
    '08:00:28': 'Samsung',
    '0c:14:20': 'Samsung',
    '10:30:47': 'Samsung',
    '18:16:c9': 'Samsung',
    '1c:66:aa': 'Samsung',
    '20:02:af': 'Samsung',
    '24:4b:03': 'Samsung',
    '28:36:38': 'Samsung',
    '2c:44:fd': 'Samsung',
    '30:19:66': 'Samsung',
    '34:23:87': 'Samsung',
    '38:2c:4a': 'Samsung',
    '3c:bd:3e': 'Samsung',
    '40:b0:34': 'Samsung',
    '44:80:eb': 'Samsung',
    '48:13:7e': 'Samsung',
    '4c:66:41': 'Samsung',
    '54:92:09': 'Samsung',
    '58:48:22': 'Samsung',
    '5c:0a:5b': 'Samsung',
    '60:6b:bd': 'Samsung',
    '64:16:66': 'Samsung',
    '68:27:37': 'Samsung',
    '74:45:ce': 'Samsung',
    '78:25:ad': 'Samsung',
    '7c:1e:52': 'Samsung',
    '80:1f:02': 'Samsung',
    '84:25:db': 'Samsung',
    '88:83:22': 'Samsung',
    '8c:77:12': 'Samsung',
    '90:48:9a': 'Samsung',
    '94:51:03': 'Samsung',
    '98:0c:82': 'Samsung',
    '9c:65:f9': 'Samsung',
    'a0:82:c7': 'Samsung',
    'a4:50:46': 'Samsung',
    'ac:5a:14': 'Samsung',
    'b0:47:bf': 'Samsung',
    'b4:0b:44': 'Samsung',
    'b8:57:d8': 'Samsung',
    'bc:30:5d': 'Samsung',
    'c0:65:99': 'Samsung',
    'c4:50:06': 'Samsung',
    'c8:14:79': 'Samsung',
    'cc:f9:54': 'Samsung',
    'd0:22:be': 'Samsung',
    'd4:6e:5c': 'Samsung',
    'd8:55:75': 'Samsung',
    'dc:66:72': 'Samsung',
    'e0:99:71': 'Samsung',
    'e4:58:b8': 'Samsung',
    'e8:50:8b': 'Samsung',
    'ec:9b:f3': 'Samsung',
    'f0:25:b7': 'Samsung',
    'f4:09:d8': 'Samsung',
    'f8:04:2e': 'Samsung',
    
    // Google
    '00:1a:11': 'Google',
    '08:00:27': 'Google',
    '0c:8b:fd': 'Google',
    '18:b4:30': 'Google',
    '20:df:b9': 'Google',
    '24:0a:64': 'Google',
    '30:fd:38': 'Google',
    '38:8b:59': 'Google',
    '3c:5a:37': 'Google',
    '40:65:a4': 'Google',
    '44:07:0b': 'Google',
    '48:9d:24': 'Google',
    '54:60:09': 'Google',
    '5c:f7:e6': 'Google',
    '60:57:18': 'Google',
    '64:9a:be': 'Google',
    '68:ef:bd': 'Google',
    '70:3a:cb': 'Google',
    '74:23:44': 'Google',
    '7c:ab:60': 'Google',
    '88:36:6c': 'Google',
    '94:eb:2c': 'Google',
    '98:5f:d3': 'Google',
    '9c:ef:d5': 'Google',
    'a0:ce:c8': 'Google',
    'a4:77:33': 'Google',
    'ac:67:b2': 'Google',
    'b0:7f:b9': 'Google',
    'b8:27:eb': 'Google',
    'bc:54:36': 'Google',
    'c0:28:8d': 'Google',
    'c4:93:00': 'Google',
    'c8:f6:50': 'Google',
    'cc:46:d6': 'Google',
    'd4:6a:6a': 'Google',
    'd8:eb:97': 'Google',
    'dc:a6:32': 'Google',
    'e4:f8:9c': 'Google',
    'f0:ef:86': 'Google',
    'f4:f5:e8': 'Google',
    'f8:8f:ca': 'Google',
    'fc:a6:67': 'Google',
    
    // Microsoft
    '00:03:ff': 'Microsoft',
    '00:15:5d': 'Microsoft',
    '00:50:f2': 'Microsoft',
    '00:aa:00': 'Microsoft',
    '00:aa:01': 'Microsoft',
    '00:aa:02': 'Microsoft',
    '0c:29:52': 'Microsoft',
    '14:fe:b5': 'Microsoft',
    '18:db:f2': 'Microsoft',
    '20:47:47': 'Microsoft',
    '28:18:78': 'Microsoft',
    '30:9c:23': 'Microsoft',
    '40:16:7e': 'Microsoft',
    '44:37:e6': 'Microsoft',
    '48:4d:7e': 'Microsoft',
    '4c:cc:6a': 'Microsoft',
    '54:53:ed': 'Microsoft',
    '58:2a:f7': 'Microsoft',
    '5c:e8:eb': 'Microsoft',
    '60:45:cb': 'Microsoft',
    '64:31:50': 'Microsoft',
    '68:05:ca': 'Microsoft',
    '6c:4b:90': 'Microsoft',
    '70:85:c2': 'Microsoft',
    '78:2b:cb': 'Microsoft',
    '80:9b:20': 'Microsoft',
    '88:85:00': 'Microsoft',
    '8c:de:52': 'Microsoft',
    '94:57:a5': 'Microsoft',
    '98:90:96': 'Microsoft',
    '9c:b6:d0': 'Microsoft',
    'a0:36:9f': 'Microsoft',
    'a4:1f:72': 'Microsoft',
    'b0:83:fe': 'Microsoft',
    'b4:ae:2b': 'Microsoft',
    'b8:81:98': 'Microsoft',
    'c4:9d:ed': 'Microsoft',
    'c8:3a:35': 'Microsoft',
    'd0:17:c2': 'Microsoft',
    'd4:3d:7e': 'Microsoft',
    'd8:50:e6': 'Microsoft',
    'dc:b4:c4': 'Microsoft',
    'e4:12:1d': 'Microsoft',
    'ec:55:f9': 'Microsoft',
    'f0:1f:af': 'Microsoft',
    'f4:4c:70': 'Microsoft',
    'f8:26:9e': 'Microsoft',
    'fc:45:96': 'Microsoft',
    
    // TP-Link
    '00:27:19': 'TP-Link',
    '00:50:43': 'TP-Link',
    '04:8d:38': 'TP-Link',
    '08:57:00': 'TP-Link',
    '0c:80:63': 'TP-Link',
    '10:fe:ed': 'TP-Link',
    '14:cc:20': 'TP-Link',
    '18:a6:f7': 'TP-Link',
    '1c:99:4c': 'TP-Link',
    '20:dc:e6': 'TP-Link',
    '28:10:7b': 'TP-Link',
    '2c:4d:54': 'TP-Link',
    '30:87:30': 'TP-Link',
    '34:e6:ad': 'TP-Link',
    '3c:46:d8': 'TP-Link',
    '40:4e:36': 'TP-Link',
    '44:d4:e0': 'TP-Link',
    '48:8d:36': 'TP-Link',
    '4c:60:de': 'TP-Link',
    '50:c7:bf': 'TP-Link',
    '58:6e:ce': 'TP-Link',
    '5c:41:e7': 'TP-Link',
    '60:e3:27': 'TP-Link',
    '68:ff:7b': 'TP-Link',
    '6c:e8:73': 'TP-Link',
    '70:4d:7b': 'TP-Link',
    '74:da:38': 'TP-Link',
    '78:44:fd': 'TP-Link',
    '7c:49:eb': 'TP-Link',
    '84:16:f9': 'TP-Link',
    '88:25:2c': 'TP-Link',
    '8c:21:0a': 'TP-Link',
    '90:21:55': 'TP-Link',
    '94:83:c4': 'TP-Link',
    '98:de:d0': 'TP-Link',
    '9c:3d:cf': 'TP-Link',
    'a0:f3:c1': 'TP-Link',
    'a4:2b:b0': 'TP-Link',
    'a8:15:4d': 'TP-Link',
    'ac:84:c6': 'TP-Link',
    'b0:95:8e': 'TP-Link',
    'b4:75:0e': 'TP-Link',
    'bc:46:99': 'TP-Link',
    'c4:6e:1f': 'TP-Link',
    'cc:5d:4e': 'TP-Link',
    'd0:27:88': 'TP-Link',
    'dc:15:2d': 'TP-Link',
    'e0:19:1d': 'TP-Link',
    'e4:95:6e': 'TP-Link',
    'e8:de:27': 'TP-Link',
    'ec:08:6b': 'TP-Link',
    'f0:99:bf': 'TP-Link',
    'f4:ec:38': 'TP-Link',
    'f8:1a:67': 'TP-Link',
    'fc:2a:9c': 'TP-Link',
    
    // Xiaomi
    '00:9e:c8': 'Xiaomi',
    '04:4e:5a': 'Xiaomi',
    '0c:1d:af': 'Xiaomi',
    '10:2a:b3': 'Xiaomi',
    '14:f6:d8': 'Xiaomi',
    '18:59:36': 'Xiaomi',
    '20:82:c0': 'Xiaomi',
    '28:6e:d4': 'Xiaomi',
    '30:83:98': 'Xiaomi',
    '34:ce:00': 'Xiaomi',
    '48:87:64': 'Xiaomi',
    '4c:49:e3': 'Xiaomi',
    '50:64:2b': 'Xiaomi',
    '58:44:98': 'Xiaomi',
    '5c:cf:7f': 'Xiaomi',
    '60:f4:45': 'Xiaomi',
    '64:09:80': 'Xiaomi',
    '68:3e:34': 'Xiaomi',
    '6c:59:dc': 'Xiaomi',
    '7c:1d:d9': 'Xiaomi',
    '8c:be:be': 'Xiaomi',
    '90:32:4b': 'Xiaomi',
    '94:87:e0': 'Xiaomi',
    '98:f0:ab': 'Xiaomi',
    '9c:99:a0': 'Xiaomi',
    'a0:86:c6': 'Xiaomi',
    'ac:d1:b8': 'Xiaomi',
    'bc:83:85': 'Xiaomi',
    'c4:64:13': 'Xiaomi',
    'd8:63:75': 'Xiaomi',
    'dc:53:60': 'Xiaomi',
    'e4:46:da': 'Xiaomi',
    'ec:d0:9f': 'Xiaomi',
    'f0:b4:29': 'Xiaomi',
    'f4:8c:eb': 'Xiaomi',
    'f8:a4:5f': 'Xiaomi',
    'fc:64:ba': 'Xiaomi',
    
    // Huawei
    '00:e0:fc': 'Huawei',
    '00:46:4b': 'Huawei',
    '04:9f:ca': 'Huawei',
    '08:19:a6': 'Huawei',
    '0c:37:dc': 'Huawei',
    '10:47:80': 'Huawei',
    '1c:1d:86': 'Huawei',
    '20:08:ed': 'Huawei',
    '24:69:a5': 'Huawei',
    '30:72:77': 'Huawei',
    '48:46:fb': 'Huawei',
    '4c:1f:cc': 'Huawei',
    '50:01:d9': 'Huawei',
    '54:89:98': 'Huawei',
    '5c:b3:95': 'Huawei',
    '60:de:44': 'Huawei',
    '74:ac:5f': 'Huawei',
    '8c:99:e6': 'Huawei',
    '98:3b:8f': 'Huawei',
    '9c:28:ef': 'Huawei',
    'a0:08:6f': 'Huawei',
    'ac:e2:d3': 'Huawei',
    'bc:25:e0': 'Huawei',
    
    // Sony
    '00:13:a9': 'Sony',
    '00:16:fe': 'Sony',
    '00:1a:80': 'Sony',
    '00:1e:3d': 'Sony',
    '00:24:be': 'Sony',
    '00:26:4c': 'Sony',
    '0c:60:76': 'Sony',
    '1c:7b:21': 'Sony',
    '20:54:fa': 'Sony',
    '30:17:c8': 'Sony',
    '44:4c:0c': 'Sony',
    '4c:21:d0': 'Sony',
    '6c:0b:84': 'Sony',
    
    // LG
    '00:1e:75': 'LG',
    '0c:48:85': 'LG',
    
    // Netgear
    '00:09:5b': 'Netgear',
    '00:0f:b5': 'Netgear',
    '00:14:6c': 'Netgear',
    '00:18:4d': 'Netgear',
    '00:1b:2f': 'Netgear',
    '00:1e:2a': 'Netgear',
    '00:22:3f': 'Netgear',
    '00:24:b2': 'Netgear',
    '00:27:22': 'Netgear',
    '10:0d:7f': 'Netgear',
    '14:60:80': 'Netgear',
    '20:4e:7f': 'Netgear',
    '5c:33:8e': 'Netgear',
    '60:38:e0': 'Netgear',
    '68:7f:74': 'Netgear',
    '6c:b0:ce': 'Netgear',
    '74:44:01': 'Netgear',
    '7c:10:c9': 'Netgear',
    '84:1b:5e': 'Netgear',
    '8c:3a:e3': 'Netgear',
    'a0:63:91': 'Netgear',
    'a8:40:41': 'Netgear',
    'ac:9e:17': 'Netgear',
    
    // D-Link
    '00:05:5d': 'D-Link',
    '00:0d:88': 'D-Link',
    '00:11:95': 'D-Link',
    '00:13:46': 'D-Link',
    '00:14:d1': 'D-Link',
    '00:17:9a': 'D-Link',
    '00:1b:11': 'D-Link',
    '00:1e:58': 'D-Link',
    '00:21:91': 'D-Link',
    '00:24:01': 'D-Link',
    '00:26:5a': 'D-Link',
    '0c:41:3e': 'D-Link',
    '1c:7e:e5': 'D-Link',
    '5c:d9:98': 'D-Link',
    
    // Raspberry Pi
    'e4:5f:01': 'Raspberry Pi',
    
    // Intel
    '00:13:ce': 'Intel',
    '00:1b:21': 'Intel',
    '00:1e:67': 'Intel',
    '00:21:5c': 'Intel',
    '00:23:14': 'Intel',
    '04:7d:7b': 'Intel',
    '0c:c4:7a': 'Intel',
    '10:1b:54': 'Intel',
    '18:03:73': 'Intel',
    '1c:1b:0d': 'Intel',
    
    // Amazon
    '00:11:32': 'Amazon',
    '00:fc:58': 'Amazon',
    '0c:47:c9': 'Amazon',
    '10:ae:60': 'Amazon',
    '18:74:2e': 'Amazon',
    '24:6f:28': 'Amazon',
    '2c:d0:5a': 'Amazon',
    '30:57:ac': 'Amazon',
    '34:d2:70': 'Amazon',
    '38:f7:3d': 'Amazon',
    '3c:57:d5': 'Amazon',
    '40:b4:cd': 'Amazon',
    '44:65:0d': 'Amazon',
    '48:a1:95': 'Amazon',
    '4c:ef:c0': 'Amazon',
    '50:dc:e7': 'Amazon',
    '54:d4:6f': 'Amazon',
    '58:71:2f': 'Amazon',
    '60:8c:2b': 'Amazon',
    '68:37:e9': 'Amazon',
    '6c:56:97': 'Amazon',
    '70:81:eb': 'Amazon',
    '74:c2:46': 'Amazon',
    '78:e1:03': 'Amazon',
    '7c:67:a2': 'Amazon',
    '80:55:6b': 'Amazon',
    '84:d6:d0': 'Amazon',
    '88:71:e5': 'Amazon',
    '94:94:26': 'Amazon',
    '98:00:d6': 'Amazon',
    'a0:02:dc': 'Amazon',
    'a4:6c:2a': 'Amazon',
    'a8:9f:ba': 'Amazon',
    'ac:63:be': 'Amazon',
    'b4:7c:9c': 'Amazon',
    'b8:78:2e': 'Amazon',
    'bc:6e:64': 'Amazon',
    'c8:4c:75': 'Amazon',
    'd0:73:d5': 'Amazon',
    'd8:ae:90': 'Amazon',
    'e0:50:8b': 'Amazon',
    'e4:98:d6': 'Amazon',
    'f0:27:2d': 'Amazon',
    'f4:f2:6d': 'Amazon',
    'f8:67:97': 'Amazon',
    'fc:a1:83': 'Amazon',
    
    // Add more vendors as needed...
};

/**
 * Vendor Detection Service
 * Detects hardware vendor/manufacturer from MAC address using OUI lookup
 */
export class VendorDetectionService {
    /**
     * Normalize MAC address to standard format (lowercase, colons)
     * Handles various formats: 00:11:22:33:44:55, 00-11-22-33-44-55, 001122334455
     */
    private normalizeMac(mac: string): string {
        // Remove separators and convert to lowercase
        const cleaned = mac.replace(/[:-]/g, '').toLowerCase();
        
        // Validate format (should be 12 hex characters)
        if (!/^[0-9a-f]{12}$/.test(cleaned)) {
            return '';
        }
        
        // Format as XX:XX:XX:XX:XX:XX
        return cleaned.match(/.{2}/g)?.join(':') || '';
    }

    /**
     * Extract OUI (first 3 octets) from MAC address
     * OUI is used to identify the vendor/manufacturer
     */
    private extractOui(mac: string): string {
        const normalized = this.normalizeMac(mac);
        if (!normalized) return '';
        
        // Extract first 3 octets (6 hex characters = 3 bytes)
        return normalized.substring(0, 8); // Format: XX:XX:XX
    }

    /**
     * Detect vendor from MAC address using OUI database
     * 
     * @param mac MAC address in any format (with or without separators)
     * @returns Vendor name or null if not found
     */
    detectVendor(mac: string): string | null {
        if (!mac) return null;
        
        try {
            const oui = this.extractOui(mac);
            if (!oui) {
                logger.debug('VendorDetection', `Invalid MAC address format: ${mac}`);
                return null;
            }
            
            // Priority 1: Try Wireshark database (most complete)
            try {
                const wiresharkVendor = WiresharkVendorService.lookupVendor(oui);
                if (wiresharkVendor) {
                    logger.debug('VendorDetection', `Detected vendor ${wiresharkVendor} for MAC ${mac} (OUI: ${oui}) from Wireshark DB`);
                    return wiresharkVendor;
                }
            } catch (error) {
                // Wireshark DB might not be initialized yet, continue to local DB
                logger.debug('VendorDetection', `Wireshark lookup failed for ${mac}, trying local DB`);
            }
            
            // Priority 2: Try local OUI database (fallback)
            const vendor = OUI_DATABASE[oui];
            if (vendor) {
                logger.debug('VendorDetection', `Detected vendor ${vendor} for MAC ${mac} (OUI: ${oui}) from local DB`);
                return vendor;
            }
            
            logger.debug('VendorDetection', `No vendor found for MAC ${mac} (OUI: ${oui})`);
            return null;
        } catch (error) {
            logger.error('VendorDetection', `Failed to detect vendor for MAC ${mac}:`, error);
            return null;
        }
    }

    /**
     * Try to detect vendor using external API as fallback
     * This can be used if the local OUI database doesn't have the vendor
     * 
     * @param mac MAC address
     * @returns Vendor name or null if not found
     */
    async detectVendorFromApi(mac: string): Promise<string | null> {
        // First try local database (fast check)
        const localVendor = this.detectVendor(mac);
        if (localVendor) {
            logger.debug('VendorDetection', `Found vendor ${localVendor} in local DB for MAC ${mac}`);
            return localVendor;
        }
        
        try {
            const normalized = this.normalizeMac(mac);
            if (!normalized) {
                logger.debug('VendorDetection', `Invalid MAC format for API lookup: ${mac}`);
                return null;
            }
            
            // Extract OUI (first 3 bytes = 6 hex chars)
            const oui = normalized.substring(0, 8).replace(/:/g, '');
            if (oui.length !== 6) {
                logger.debug('VendorDetection', `Invalid OUI extracted from MAC ${mac}: ${oui}`);
                return null;
            }
            
            // Try multiple free APIs for better reliability
            // API 1: macvendors.com (free, no API key required)
            try {
                const response = await fetch(`https://api.macvendors.com/${oui}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/plain',
                    },
                    // Add timeout to avoid hanging
                    signal: AbortSignal.timeout(3000)
                });
                
                if (response.ok) {
                    const vendor = await response.text();
                    if (vendor && 
                        vendor.trim().length > 0 && 
                        !vendor.includes('Not Found') &&
                        !vendor.includes('error') &&
                        !vendor.includes('Error')) {
                        const cleanedVendor = vendor.trim();
                        logger.debug('VendorDetection', `✓ Detected vendor ${cleanedVendor} from macvendors.com for MAC ${mac} (OUI: ${oui})`);
                        return cleanedVendor;
                    }
                } else {
                    logger.debug('VendorDetection', `macvendors.com API returned status ${response.status} for MAC ${mac}`);
                }
            } catch (error: any) {
                logger.debug('VendorDetection', `macvendors.com API failed for MAC ${mac}: ${error.message || error}`);
            }
            
            // API 2: macaddress.io (alternative, requires API key but has free tier)
            // We'll skip this for now as it requires registration
            
            // API 3: maclookup.app (free alternative)
            try {
                const response = await fetch(`https://api.maclookup.app/v2/macs/${oui}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    },
                    signal: AbortSignal.timeout(3000)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.company && data.company.trim().length > 0) {
                        const vendor = data.company.trim();
                        logger.debug('VendorDetection', `✓ Detected vendor ${vendor} from maclookup.app for MAC ${mac} (OUI: ${oui})`);
                        return vendor;
                    }
                }
            } catch (error: any) {
                logger.debug('VendorDetection', `maclookup.app API failed for MAC ${mac}: ${error.message || error}`);
            }
            
        } catch (error: any) {
            logger.debug('VendorDetection', `API lookup failed for MAC ${mac}: ${error.message || error}`);
        }
        
        return null;
    }
}

// Export singleton instance
export const vendorDetectionService = new VendorDetectionService();

