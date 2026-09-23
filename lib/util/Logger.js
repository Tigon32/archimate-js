const DEFAULT_LOG_LEVEL = 'warn';

const ALLOWED_LEVELS = new Set([ 'error', 'warn', 'log' ]);

const NO_OP = () => {};

function configuredLevel() {
  const level = typeof process !== 'undefined' && process.env
    ? process.env.ARCHIMATE_JS_LOG_LEVEL
    : undefined;

  return ALLOWED_LEVELS.has(level) ? level : DEFAULT_LOG_LEVEL;
}

function summarizeObject(value) {
  if (!value) {
    return value;
  }

  if (Array.isArray(value)) {
    return `[Array(${value.length}) redacted]`;
  }

  const type = value.$type || value.type || value.constructor && value.constructor.name || 'Object';

  return `[${type} redacted]`;
}

export function sanitizeLogValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.startsWith('<') || trimmed.length > 500) {
      return `[redacted string payload: ${value.length} chars]`;
    }

    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogValue(value.message)
    };
  }

  if (typeof value === 'object') {
    return summarizeObject(value);
  }

  return value;
}

function bindConsoleMethod(consoleTarget, methodName) {
  const method = consoleTarget[methodName] || consoleTarget.log || NO_OP;

  return function(...args) {
    method.apply(consoleTarget, args.map(sanitizeLogValue));
  };
}

export class ConsoleLogger {

  constructor(options) {
    const {
      level = configuredLevel(),
      console: consoleTarget = console
    } = options || {};

    this.error = bindConsoleMethod(consoleTarget, 'error');

    if (level === 'error') {
      this.warn = NO_OP;
      this.log = NO_OP;

      return;
    }

    this.warn = bindConsoleMethod(consoleTarget, 'warn');

    if (level === 'warn') {
      this.log = NO_OP;

      return;
    }

    this.log = bindConsoleMethod(consoleTarget, 'log');
  }

}

export const logger = new ConsoleLogger();
