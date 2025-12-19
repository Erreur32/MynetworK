/**
 * Application version constant
 * This file is automatically updated by scripts/update-version.sh
 * Do not modify this file manually - use the update script instead
 */

export const APP_VERSION = '0.1.2';

/**
 * Get the formatted version string with 'v' prefix
 */
export const getVersionString = (): string => {
  return `v${APP_VERSION}`;
};

