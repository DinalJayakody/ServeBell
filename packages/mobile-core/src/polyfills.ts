/**
 * Defensive: three.js's CJS build calls Node's process.emitWarning, which
 * React Native lacks. Metro is configured to use the ESM build instead.
 */
const proc = (globalThis as { process?: { emitWarning?: unknown } }).process;
if (proc && typeof proc.emitWarning !== 'function') proc.emitWarning = () => undefined;
