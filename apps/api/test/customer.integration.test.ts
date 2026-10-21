import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { io as connect } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { Server as SocketServer } from 'socket.io';
import { createOrderSchema } from '@kape/shared';
import type { MenuResponse, OrderResponse } from '@kape/shared';
import { createApp } from '../src/app.ts';
import { createCustomerService } from '../src/services/customer.ts';
import type { CustomerService } from '../src/services/customer.ts';
import { attachRealtime } from '../src/realtime.ts';
import * as s from '../src/db/schema.ts';
import type { db as dbType, pool as poolType } from '../src/db/client.ts';

describe.skipIf(process.env.INTEGRATION_TESTS !== '1')(
  'customer API against configured Postgres',
  () => {
    let service: CustomerService;
    let database: typeof dbType;
    let pool: typeof poolType;
    let server: Server;
    let socketServer: SocketServer;
    let base: string;
    let menu: MenuResponse;
    let created: OrderResponse;
    const createdIds: string[] = [];
    const sockets: Socket[] = [];
    beforeAll(async () => {
      ({ db: database, pool } = await import('../src/db/client.ts'));
      service = createCustomerService(database);
      server = createServer(
        createApp({
          customer: service,
          probe: async () => {
            await pool.query('SELECT 1');
          },
          webOrigin: 'http://localhost:5173',
        }),
      );
      socketServer = attachRealtime(server, service, 'http://localhost:5173');
      server.listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server.once('listening', resolve));
      base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
      menu = await service.menu();
    }, 30000);
    afterAll(async () => {
      sockets.forEach((socket) => socket.disconnect());
      await new Promise<void>((resolve) => socketServer.close(() => resolve()));
      for (const id of createdIds)
        await database.delete(s.orders).where(eq(s.orders.id, id));
      await pool.end();
    }, 30000);
    async function post(body: unknown) {
      return fetch(base + '/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    function input() {
      const item = menu.items.find((entry) => entry.name === 'Spanish Latte');
      if (!item) throw new Error('Seed menu required');
      return {
        tableNumber: 5,
        notes: '<b>Water please</b>',
        items: [
          {
            menuItemId: item.id,
            quantity: 2,
            choiceIds: item.options
              .filter((group) => group.minSelections > 0)
              .map((group) => group.choices[1]!.id),
            notes: '<b>No ice</b>\nplease',
          },
        ],
      };
    }
    it('confirms all seed tables, users, items and price snapshots persisted', async () => {
      const result = await database.execute(
        sql.raw(
          "SELECT (SELECT count(*)::int FROM categories) AS categories, (SELECT count(*)::int FROM menu_items) AS items, (SELECT count(*)::int FROM tables) AS tables, (SELECT count(*)::int FROM users WHERE password_hash LIKE '$2b$%') AS hashed_users, (SELECT count(*)::int FROM orders WHERE id::text LIKE '00000000-%') AS sample_orders",
        ),
      );
      expect(result.rows[0]).toMatchObject({
        categories: 5,
        items: 25,
        tables: 10,
        hashed_users: 2,
        sample_orders: 9,
      });
    });
    it('serves menu with availability and validates table links', async () => {
      expect((await fetch(base + '/menu')).status).toBe(200);
      expect(menu.items.some((item) => !item.available)).toBe(true);
      expect((await fetch(base + '/tables/5')).status).toBe(200);
      expect((await fetch(base + '/tables/999')).status).toBe(404);
      expect((await fetch(base + '/tables/5x')).status).toBe(400);
    });
    it('rejects client prices and invalid quantities', async () => {
      expect((await post({ ...input(), totalCents: 1 })).status).toBe(400);
      const body = input();
      body.items[0]!.quantity = 0;
      expect((await post(body)).status).toBe(400);
    });
    it('creates a priced order, sanitizes notes, and preserves the receipt', async () => {
      const response = await post(input());
      expect(response.status).toBe(201);
      created = (await response.json()) as OrderResponse;
      createdIds.push(created.id);
      expect(created.totalCents).toBe(40000);
      expect(created.items[0]?.notes).toBe('No ice please');
      expect(created.notes).toBe('Water please');
      expect(created.status).toBe('received');
      expect(
        await (await fetch(base + '/orders/' + created.id)).json(),
      ).toEqual(created);
    });
    it('rejects foreign, duplicate, missing and unavailable choices', async () => {
      const body = createOrderSchema.parse(input());
      const line = body.items[0]!;
      for (const choiceIds of [
        [],
        [randomUUID()],
        [line.choiceIds[0]!, line.choiceIds[0]!],
      ]) {
        await expect(
          service.create({ ...body, items: [{ ...line, choiceIds }] }),
        ).rejects.toMatchObject({ status: 409 });
      }
      const choiceId = line.choiceIds[0]!;
      await database
        .update(s.optionChoices)
        .set({ available: false })
        .where(eq(s.optionChoices.id, choiceId));
      try {
        await expect(service.create(body)).rejects.toMatchObject({
          status: 409,
        });
      } finally {
        await database
          .update(s.optionChoices)
          .set({ available: true })
          .where(eq(s.optionChoices.id, choiceId));
      }
      const groupId = menu.items.find((item) => item.id === line.menuItemId)!
        .options[0]!.id;
      await database
        .update(s.itemOptions)
        .set({ available: false })
        .where(eq(s.itemOptions.id, groupId));
      try {
        await expect(service.create(body)).rejects.toMatchObject({
          status: 409,
        });
      } finally {
        await database
          .update(s.itemOptions)
          .set({ available: true })
          .where(eq(s.itemOptions.id, groupId));
      }
    }, 30000);
    it('rejects unavailable items and tables without creating orders', async () => {
      const body = createOrderSchema.parse(input());
      const unavailable = menu.items.find((item) => !item.available)!;
      await expect(
        service.create({
          ...body,
          items: [{ ...body.items[0]!, menuItemId: unavailable.id }],
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        service.create({ ...body, tableNumber: 999 }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it('delivers room updates over polling, isolates rooms, and rejoins after reconnect', async () => {
      const socket = connect(base, {
        transports: ['polling'],
        autoConnect: false,
      });
      sockets.push(socket);
      const waitStatus = (status: string) =>
        new Promise<OrderResponse>((resolve, reject) => {
          const timer = setTimeout(() => {
            socket.off('order:updated', handler);
            reject(new Error('Socket status timeout: ' + status));
          }, 8000);
          const handler = (value: OrderResponse) => {
            if (value.status === status) {
              clearTimeout(timer);
              socket.off('order:updated', handler);
              resolve(value);
            }
          };
          socket.on('order:updated', handler);
        });
      socket.on('connect', () => socket.emit('order:join', created.id));
      let received = waitStatus('received');
      socket.connect();
      expect((await received).id).toBe(created.id);
      expect(socket.io.engine.transport.name).toBe('polling');
      received = waitStatus('preparing');
      await service.setStatus(created.id, 'preparing');
      expect((await received).status).toBe('preparing');
      socket.disconnect();
      await service.setStatus(created.id, 'ready');
      received = waitStatus('ready');
      socket.connect();
      expect((await received).status).toBe('ready');
      const other = await service.create(createOrderSchema.parse(input()));
      createdIds.push(other.id);
      const leaked: string[] = [];
      socket.on('order:updated', (value: OrderResponse) =>
        leaked.push(value.id),
      );
      await service.setStatus(other.id, 'preparing');
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(leaked).not.toContain(other.id);
    }, 30000);
    it('rejects backward or skipped transitions and terminal reopen', async () => {
      await expect(
        service.setStatus(created.id, 'received'),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      await service.setStatus(created.id, 'served');
      await expect(
        service.setStatus(created.id, 'preparing'),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      const other = await service.create(createOrderSchema.parse(input()));
      createdIds.push(other.id);
      await expect(service.setStatus(other.id, 'served')).rejects.toMatchObject(
        { code: 'INVALID_TRANSITION' },
      );
      await service.setStatus(other.id, 'cancelled');
      await expect(
        service.setStatus(other.id, 'preparing'),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    });
    it('returns consistent errors for invalid IDs and cross-origin writes', async () => {
      const missing = await fetch(base + '/orders/' + randomUUID());
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({
        error: { code: 'ORDER_NOT_FOUND' },
      });
      expect((await fetch(base + '/orders/nope')).status).toBe(400);
      expect(
        (
          await fetch(base + '/orders', {
            method: 'POST',
            headers: { Origin: 'https://untrusted.example' },
          })
        ).status,
      ).toBe(403);
    });
    it('limits order attempts and includes Retry-After', async () => {
      let response: Response | undefined;
      for (let i = 0; i < 11; i++) response = await post({});
      expect(response?.status).toBe(429);
      expect(response?.headers.get('retry-after')).toBeTruthy();
    });
  },
);
