/**
 * Simple logger utility
 */
class Logger {
  constructor(context) {
    this.context = context;
  }

  _log(level, message, ...args) {
    console.log(`[${level}] ${this.context}: ${message}`, ...args);
  }

  info(message, ...args) {
    this._log('INFO', message, ...args);
  }

  error(message, ...args) {
    this._log('ERROR', message, ...args);
  }

  warn(message, ...args) {
    this._log('WARN', message, ...args);
  }

  debug(message, ...args) {
    this._log('DEBUG', message, ...args);
  }
}

module.exports = Logger;