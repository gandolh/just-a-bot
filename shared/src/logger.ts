type Level = 'info' | 'warn' | 'error' | 'debug';

function log(level: Level, scope: string, message: string, meta?: unknown): void {
  const time = new Date().toISOString();
  const line = `[${time}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (meta !== undefined) {
    console[level === 'debug' ? 'log' : level](line, meta);
  } else {
    console[level === 'debug' ? 'log' : level](line);
  }
}

export const logger = {
  scoped(scope: string) {
    return {
      info: (msg: string, meta?: unknown) => log('info', scope, msg, meta),
      warn: (msg: string, meta?: unknown) => log('warn', scope, msg, meta),
      error: (msg: string, meta?: unknown) => log('error', scope, msg, meta),
      debug: (msg: string, meta?: unknown) => log('debug', scope, msg, meta),
    };
  },
};
