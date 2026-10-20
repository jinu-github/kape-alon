import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';

describe('health and error HTTP contracts', () => {
  let server: Server;
  let baseUrl: string;
  let databaseDown = false;
  beforeAll(async () => {
    const app = createApp({
      probe: async () => {
        if (databaseDown) throw new Error('secret connection details');
      },
      webOrigin: 'http://localhost:5173',
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  it('returns ready only when the database probe succeeds', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'api',
      database: 'up',
    });
  });
  it('returns a safe 503 when the database is unavailable', async () => {
    databaseDown = true;
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'degraded',
      service: 'api',
      database: 'down',
    });
    databaseDown = false;
  });
  it('rejects unknown query parameters with the shared error shape', async () => {
    const response = await fetch(`${baseUrl}/health?unexpected=true`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });
  it('returns consistent 404 and malformed-body errors', async () => {
    const response = await fetch(`${baseUrl}/missing`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    const malformed = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: { code: 'INVALID_JSON' },
    });
  });
  it('allows only the configured origin for credentialed browser requests', async () => {
    const allowed = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5173',
    );
    const denied = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://untrusted.example' },
    });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
});
