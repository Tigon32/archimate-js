const ENV = typeof process !== 'undefined' && process.env ? process.env : {};

const DEFAULT_LOG_LEVEL = 'warn';

const LOG_LEVEL = ENV.ARCHIMATE_JS_LOG_LEVEL || DEFAULT_LOG_LEVEL;

const NO_OP = () => {};

function normalizeLevel(level) {
    if (level === 'debug') {
        return 'log';
    }

    if ([ 'silent', 'error', 'warn', 'log' ].includes(level)) {
        return level;
    }

    return DEFAULT_LOG_LEVEL;
}

export class ConsoleLogger {

    constructor(options) {
        const { level } = options || {};
        const normalizedLevel = normalizeLevel(level);

        this.error = normalizedLevel === 'silent' ? NO_OP : console.error.bind(console);

        if (normalizedLevel === 'silent' || normalizedLevel === 'error') {
            this.warn = NO_OP;
            this.log = NO_OP;

            return;
        }

        this.warn = console.warn.bind(console);
        
        if (normalizedLevel === 'warn') {
            this.log = NO_OP;

            return;
        }

        this.log = console.log.bind(console);

    }

}

export const logger = new ConsoleLogger({ level: LOG_LEVEL });
