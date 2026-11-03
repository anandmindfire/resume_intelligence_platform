import { afterEach, describe, expect, it, vi } from 'vitest';
import winston from 'winston';
import { createLogger, getErrorMessage, getErrorStack, logger } from './index';

const MESSAGE = Symbol.for('message');
const LEVEL = Symbol.for('level');

/** Run an info object through a logger's format pipeline and return the rendered line. */
function render(log: winston.Logger, info: Record<string, unknown>): string {
  const entry = { ...info, [LEVEL]: info.level };
  const out = log.format.transform(entry as unknown as winston.Logform.TransformableInfo);
  if (!out || typeof out === 'boolean') throw new Error('log entry was filtered out');
  return out[MESSAGE as unknown as string] as string;
}

describe('createLogger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies defaults: info level, unknown service, single console transport', () => {
    const log = createLogger();
    expect(log.level).toBe('info');
    expect(log.defaultMeta).toEqual({ service: 'unknown' });
    expect(log.transports).toHaveLength(1);
    expect(log.transports[0]).toBeInstanceOf(winston.transports.Console);
  });

  it('honours level and service options', () => {
    const log = createLogger({ level: 'debug', service: 'upload-service' });
    expect(log.level).toBe('debug');
    expect(log.defaultMeta).toEqual({ service: 'upload-service' });
  });

  it('renders JSON lines with timestamp and metadata in json format', () => {
    const log = createLogger({ format: 'json', service: 'svc' });
    const line = render(log, { level: 'info', message: 'hello', service: 'svc', resumeId: 'r1' });
    const parsed = JSON.parse(line);

    expect(parsed).toMatchObject({
      level: 'info',
      message: 'hello',
      service: 'svc',
      resumeId: 'r1',
    });
    expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('serialises error stacks in json format', () => {
    const log = createLogger({ format: 'json' });
    const err = new Error('boom');
    const line = render(log, { level: 'error', message: err });
    const parsed = JSON.parse(line);

    expect(parsed.message).toBe('boom');
    expect(parsed.stack).toContain('Error: boom');
  });

  it('renders human readable lines in simple format', () => {
    const log = createLogger({ format: 'simple', service: 'svc' });
    const line = render(log, { level: 'info', message: 'started', service: 'svc', port: 3000 });

    expect(line).toMatch(/\[svc\]/);
    expect(line).toContain('started');
    expect(line).toContain('{"port":3000}');
  });

  it('omits the metadata blob in simple format when there is none', () => {
    const log = createLogger({ format: 'simple', service: 'svc' });
    const line = render(log, { level: 'info', message: 'plain', service: 'svc' });
    expect(line.trimEnd().endsWith('plain')).toBe(true);
  });

  it('filters out messages below the configured level', () => {
    const log = createLogger({ level: 'warn' });
    expect(log.isLevelEnabled('info')).toBe(false);
    expect(log.isLevelEnabled('warn')).toBe(true);
    expect(log.isLevelEnabled('error')).toBe(true);
  });
});

describe('default logger', () => {
  it('is configured from LOG_LEVEL, LOG_FORMAT and SERVICE_NAME', async () => {
    vi.resetModules();
    vi.stubEnv('LOG_LEVEL', 'debug');
    vi.stubEnv('LOG_FORMAT', 'simple');
    vi.stubEnv('SERVICE_NAME', 'matcher-worker');

    const mod = await import('./index');
    expect(mod.logger.level).toBe('debug');
    expect(mod.logger.defaultMeta).toEqual({ service: 'matcher-worker' });
    expect(mod.default).toBe(mod.logger);
  });

  it('is a winston logger instance', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});

describe('getErrorMessage', () => {
  it('returns the message of Error instances, including subclasses', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage(new TypeError('bad type'))).toBe('bad type');
  });

  it.each([
    ['a string', 'plain failure', 'plain failure'],
    ['a number', 42, '42'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
  ])('stringifies %s thrown values', (_label, value, expected) => {
    expect(getErrorMessage(value)).toBe(expected);
  });
});

describe('getErrorStack', () => {
  it('returns the stack of Error instances', () => {
    const error = new Error('boom');
    expect(getErrorStack(error)).toBe(error.stack);
  });

  it('returns undefined for non-errors', () => {
    expect(getErrorStack('nope')).toBeUndefined();
    expect(getErrorStack({ stack: 'fake' })).toBeUndefined();
  });
});
