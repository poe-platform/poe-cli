/**
 * Central location for all path constants used across the application.
 */

/**
 * The relative path segments from the home directory to the credentials file.
 * Usage: path.join(homeDir, ...CREDENTIALS_PATH_SEGMENTS)
 */
export const CREDENTIALS_PATH_SEGMENTS = [".poe-setup", "credentials.json"] as const;

/**
 * The directory name where Poe setup files are stored.
 */
export const POE_SETUP_DIR = ".poe-setup";

/**
 * The filename for the credentials file.
 */
export const CREDENTIALS_FILENAME = "credentials.json";
