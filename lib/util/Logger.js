const DEFAULT_LOG_LEVEL = 'warn';

const VALID_LOG_LEVELS = [ 'silent', 'error', 'warn', 'log' ];

const NO_OP = () => {};

function getConfiguredLogLevel() {
    var configuredLevel;

    if (typeof process !== 'undefined' && process.env) {
        configuredLevel = process.env.ARCHIMATE_JS_LOG_LEVEL;
    }

    if (!configuredLevel && typeof globalThis !== 'undefined') {
        configuredLevel = globalThis.__ARCHIMATE_JS_LOG_LEVEL__;
    }

    return VALID_LOG_LEVELS.indexOf(configuredLevel) !== -1
        ? configuredLevel
        : DEFAULT_LOG_LEVEL;
}

export class ConsoleLogger {

    constructor(options) {
        const { level } = options || {};
        const configuredLevel = VALID_LOG_LEVELS.indexOf(level) !== -1 ? level : DEFAULT_LOG_LEVEL;

        this.error = configuredLevel === 'silent' ? NO_OP : console.error.bind(console);

        if (configuredLevel === 'silent' || configuredLevel === 'error') {
            this.warn = NO_OP;
            this.log = NO_OP;

            return;
        }

        this.warn = console.warn.bind(console);
        
        if (configuredLevel === 'warn') {
            this.log = NO_OP;

            return;
        }

        this.log = console.log.bind(console);

    }

}

export const logger = new ConsoleLogger({ level: getConfiguredLogLevel() });