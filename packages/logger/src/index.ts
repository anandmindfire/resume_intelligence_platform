import winston from 'winston';

export interface LoggerConfig {
  level?: string;
  format?: 'json' | 'simple';
  service?: string;
}

const createLogger = (config: LoggerConfig = {}) => {
  const { level = 'info', format = 'json', service = 'unknown' } = config;

  const logFormat =
    format === 'json'
      ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      : winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
            return `${timestamp} [${service}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
          })
        );

  return winston.createLogger({
    level,
    format: logFormat,
    defaultMeta: { service },
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true,
      }),
    ],
  });
};

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: (process.env.LOG_FORMAT as 'json' | 'simple') || 'json',
  service: process.env.SERVICE_NAME || 'unknown',
});

export { createLogger };
export default logger;

/**
 * `catch` bindings are `unknown`: anything can be thrown, so narrow before reading Error fields.
 * Intended for building `logger.error(...)` metadata, e.g. `{ error: getErrorMessage(error) }`.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
