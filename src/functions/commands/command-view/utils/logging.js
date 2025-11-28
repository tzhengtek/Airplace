export const Severity = Object.freeze({
    DEFAULT: 'DEFAULT',
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    NOTICE: 'NOTICE',
    WARNING: 'WARNING',
    ERROR: 'ERROR',
    CRITICAL: 'CRITICAL',
    ALERT: 'ALERT',
    EMERGENCY: 'EMERGENCY',
});

export function log(entryFields = {}, globalLogFields = {}) {
    const defaults = {
        severity: 'NOTICE',
        message: 'This is the default display field.',
    };
    const entry = Object.assign({}, defaults, entryFields, globalLogFields);
    console.log(JSON.stringify(entry));
}

export function createLogger(globalLogFields = {}) {
    return (entryFields = {}) => log(entryFields, globalLogFields);
}
