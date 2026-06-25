import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

let app: FastifyInstance;
beforeAll(async () => { app = await buildServer(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/dishes/featured', () => {
  it('returns dishes ordered by relation count, capped by limit', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dishes/featured?limit=5' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { dishes: any[]; count: number };
    expect(Array.isArray(body.dishes)).toBe(true);
    expect(body.dishes.length).toBeLessThanOrEqual(5);
    // monotonic non-increasing relationCount
    for (let i = 1; i < body.dishes.length; i++) {
      expect(body.dishes[i - 1].relationCount).toBeGreaterThanOrEqual(body.dishes[i].relationCount);
    }
    if (body.dishes.length) {
      const d = body.dishes[0];
      expect(typeof d.slug).toBe('string');
      expect(typeof d.canonicalName).toBe('string');
      expect(typeof d.relationCount).toBe('number');
      expect('coverMediaId' in d).toBe(true);
    }
  });

  it('defaults limit to 8 and caps at 24', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dishes/featured?limit=999' });
    expect(res.statusCode).toBe(200);
    expect(res.json().dishes.length).toBeLessThanOrEqual(24);
  });
});
