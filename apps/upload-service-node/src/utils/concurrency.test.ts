import { describe, expect, it } from 'vitest';
import { createConcurrencyLimiter } from './concurrency';

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('createConcurrencyLimiter', () => {
  it.each([0, -1])('is a no-op when maxConcurrent is %i', async (max) => {
    const limiter = createConcurrencyLimiter(max);
    await Promise.all(Array.from({ length: 100 }, () => limiter.acquire()));
    expect(() => limiter.release()).not.toThrow();
  });

  it('admits up to maxConcurrent callers immediately', async () => {
    const limiter = createConcurrencyLimiter(2);
    let admitted = 0;
    limiter.acquire().then(() => admitted++);
    limiter.acquire().then(() => admitted++);
    limiter.acquire().then(() => admitted++);
    await flush();

    expect(admitted).toBe(2);
  });

  it('admits a waiting caller when a slot is released', async () => {
    const limiter = createConcurrencyLimiter(1);
    const order: string[] = [];

    await limiter.acquire();
    const second = limiter.acquire().then(() => order.push('second'));
    await flush();
    expect(order).toEqual([]);

    limiter.release();
    await second;
    expect(order).toEqual(['second']);
  });

  it('serves waiters in FIFO order', async () => {
    const limiter = createConcurrencyLimiter(1);
    const order: number[] = [];

    await limiter.acquire();
    const waiters = [1, 2, 3].map((n) => limiter.acquire().then(() => order.push(n)));

    for (let i = 0; i < 3; i++) {
      limiter.release();
      await flush();
    }
    await Promise.all(waiters);
    expect(order).toEqual([1, 2, 3]);
  });

  it('never runs more than maxConcurrent tasks at once', async () => {
    const limiter = createConcurrencyLimiter(3);
    let running = 0;
    let peak = 0;

    const task = async () => {
      await limiter.acquire();
      running++;
      peak = Math.max(peak, running);
      await flush();
      running--;
      limiter.release();
    };

    await Promise.all(Array.from({ length: 20 }, task));
    expect(peak).toBe(3);
    expect(running).toBe(0);
  });
});
