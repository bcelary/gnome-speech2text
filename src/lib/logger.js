import GLib from "gi://GLib";

/**
 * Logger utility for GNOME Speech2Text Whisper.cpp extension
 *
 * Provides consistent logging with [S2T-WC:Component] prefix for easy filtering.
 *
 * Usage:
 *   import { Logger } from './lib/logger.js';
 *   const logger = new Logger('ComponentName');
 *   logger.debug('Debug message');
 *   logger.info('Info message');
 *   logger.warn('Warning message');
 *   logger.error('Error message');
 *
 * To view logs:
 *   journalctl -f /usr/bin/gnome-shell | grep '\[S2T-WC'
 *
 * To control log level:
 *   S2T_LOG_LEVEL=debug gnome-shell --replace
 *   (or set in environment before starting GNOME Shell)
 *
 * Valid levels: error, warn, info, debug (default: info)
 */

// Log level hierarchy
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Read log level from environment variable once at module load
const envLogLevel = GLib.getenv("S2T_LOG_LEVEL") || "info";
const LOG_LEVEL = LOG_LEVELS[envLogLevel.toLowerCase()] !== undefined
  ? envLogLevel.toLowerCase()
  : "info";

// Log detected level at module initialization
console.log(`[S2T-WC:Logger] Log level: ${LOG_LEVEL} (env S2T_LOG_LEVEL=${envLogLevel || 'not set'})`);

export class Logger {
  constructor(component) {
    this.component = component;
    this.prefix = `[S2T-WC:${component}]`;
  }

  /**
   * Check if a message at the given level should be logged
   */
  _shouldLog(level) {
    return LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL];
  }

  /**
   * Debug-level logging (shown when S2T_LOG_LEVEL=debug)
   */
  debug(...args) {
    if (this._shouldLog("debug")) {
      console.log(this.prefix, ...args);
    }
  }

  /**
   * Info-level logging (shown when S2T_LOG_LEVEL is info or debug)
   */
  info(...args) {
    if (this._shouldLog("info")) {
      console.log(this.prefix, ...args);
    }
  }

  /**
   * Warning-level logging (shown when S2T_LOG_LEVEL is warn, info, or debug)
   */
  warn(...args) {
    if (this._shouldLog("warn")) {
      console.log(this.prefix, ...args);
    }
  }

  /**
   * Error-level logging (always shown)
   */
  error(...args) {
    if (this._shouldLog("error")) {
      console.log(this.prefix, ...args);
    }
  }
}
