import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { idSchema } from '@kape/shared';
import type { OrderResponse } from '@kape/shared';
import type { CustomerService } from './services/customer.ts';
import type { AuthService } from './services/auth.ts';

export function attachRealtime(
  server: HttpServer,
  service: CustomerService,
  origin: string,
  auth?: AuthService,
) {
  const io = new Server(server, {
    cors: { origin, methods: ['GET', 'POST'], credentials: true },
    maxHttpBufferSize: 4096,
    allowRequest: (req, done) =>
      done(null, !req.headers.origin || req.headers.origin === origin),
  });
  io.on('connection', (socket) => {
    let joins = 0;
    let joining = false;
    socket.on('order:join', async (value: unknown) => {
      if (++joins > 20) {
        socket.disconnect(true);
        return;
      }
      if (joining) return;
      const parsed = idSchema.safeParse(value);
      if (!parsed.success) {
        socket.emit('order:error', 'Invalid order link.');
        return;
      }
      joining = true;
      try {
        for (const room of socket.rooms)
          if (room.startsWith('order:')) await socket.leave(room);
        await socket.join('order:' + parsed.data);
        socket.emit('order:updated', await service.order(parsed.data));
      } catch {
        await socket.leave('order:' + parsed.data);
        socket.emit('order:error', 'Order unavailable. Please retry.');
      } finally {
        joining = false;
      }
    });
  });
  const kitchen = io.of('/kitchen');
  const sessions = new Map<string, { id: string; expiresAt: number }>();
  kitchen.use(async (socket, next) => {
    try {
      if (!auth || socket.handshake.headers.origin !== origin)
        throw new Error('Unauthorized');
      const session = await auth.authenticate(socket.request.headers.cookie);
      if (!['admin', 'kitchen'].includes(session.user.role))
        throw new Error('Forbidden');
      sessions.set(socket.id, {
        id: session.sessionId,
        expiresAt: session.expiresAt,
      });
      next();
    } catch {
      next(new Error('Please sign in to the kitchen.'));
    }
  });
  kitchen.on('connection', (socket) => {
    const session = sessions.get(socket.id);
    if (!session) {
      socket.disconnect(true);
      return;
    }
    void socket.join('session:' + session.id);
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, session.expiresAt - Date.now()),
    );
    expiry.unref();
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      sessions.delete(socket.id);
    });
    socket.emit('kitchen:refresh');
  });
  const onCreated = (order: OrderResponse) =>
    kitchen.emit('kitchen:changed', { id: order.id, created: true });
  const onUpdated = (order: OrderResponse) => {
    io.to('order:' + order.id).emit('order:updated', order);
    kitchen.emit('kitchen:changed', { id: order.id, created: false });
  };
  const onRevoked = (sessionId: string) =>
    kitchen.in('session:' + sessionId).disconnectSockets(true);
  service.events.on('created', onCreated);
  service.events.on('updated', onUpdated);
  auth?.events.on('revoked', onRevoked);
  server.on('close', () => {
    service.events.off('created', onCreated);
    service.events.off('updated', onUpdated);
    auth?.events.off('revoked', onRevoked);
    sessions.clear();
  });
  return io;
}
