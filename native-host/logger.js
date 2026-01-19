/**
 * Centralized logging utility for YouTube Summary Extension
 * Logs to native-host directory with automatic rotation at 1MB
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'extension.log');
const MAX_LOG_SIZE = 1 * 1024 * 1024; // 1MB

/**
 * Rotate log file if it exceeds MAX_LOG_SIZE
 * Keeps the last half of the file to preserve recent logs
 */
function rotateIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;

    const stats = fs.statSync(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      // Read file and keep last half
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const lines = content.split('\n');
      const halfIndex = Math.floor(lines.length / 2);
      const truncatedContent = '--- Log rotated ---\n' + lines.slice(halfIndex).join('\n');
      fs.writeFileSync(LOG_FILE, truncatedContent);
    }
  } catch (err) {
    // Silently ignore rotation errors
  }
}

/**
 * Log a message with timestamp
 * @param {string} message - Message to log
 * @param {string} [prefix] - Optional prefix (e.g., 'claude-bridge')
 */
function log(message, prefix = '') {
  rotateIfNeeded();
  const timestamp = new Date().toISOString();
  const prefixStr = prefix ? ` [${prefix}]` : '';
  fs.appendFileSync(LOG_FILE, `[${timestamp}]${prefixStr} ${message}\n`);
}

/**
 * Get the log file path
 * @returns {string} - Path to log file
 */
function getLogPath() {
  return LOG_FILE;
}

module.exports = { log, getLogPath, LOG_FILE, rotateIfNeeded };
