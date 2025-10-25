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
 * To enable debug logging, set DEBUG = true below
 */

// Toggle debug logging here (default: false)
const DEBUG = true;

export class Logger {
  constructor(component) {
    this.component = component;
    this.prefix = `[S2T-WC:${component}]`;
  }

  /**
   * Debug-level logging (only shown when DEBUG = true)
   * Uses console.debug which maps to GLib.LogLevelFlags.LEVEL_DEBUG
   */
  debug(...args) {
    if (DEBUG) {
      console.debug(this.prefix, ...args);
    }
  }

  /**
   * Info-level logging (always shown)
   * Uses console.log which maps to GLib.LogLevelFlags.LEVEL_MESSAGE
   */
  info(...args) {
    console.log(this.prefix, ...args);
  }

  /**
   * Warning-level logging (always shown, includes stack trace)
   * Uses console.warn which maps to GLib.LogLevelFlags.LEVEL_WARNING
   */
  warn(...args) {
    console.warn(this.prefix, ...args);
  }

  /**
   * Error-level logging (always shown, includes stack trace)
   * Uses console.error which maps to GLib.LogLevelFlags.LEVEL_CRITICAL
   */
  error(...args) {
    console.error(this.prefix, ...args);
  }
}
