import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { idSchema } from '@kape/shared';
import type { OrderResponse } from '@kape/shared';
import type { CustomerService } from './services/customer.ts';

export function attachRealtime(
  server: HttpServer,
  service: CustomerService,
  origin: string,
) {
  const io = new Server(server, {
    cors: { origin, methods: ['GET', 'POST'], credentials: true },
    maxHttpBufferSize: 4096,
    allowRequest: (req, done) =>
      done(null, !req.headers.origin || req.headers.origin === origin),
  });
  io.on('connection', (socket) => {
    let joins = 0;
    socket.on('order:join', async (value: unknown) => {
      if (++joins > 20) {
        socket.disconnect(true);
        return;
      }
      const parsed = idSchema.safeParse(value);
      if (!parsed.success) {
        socket.emit('order:error', 'Invalid order link.');
        return;
      }
      try {
        for (const room of socket.rooms)
          if (room.startsWith('order:')) await socket.leave(room);
        await socket.join('order:' + parsed.data);
        socket.emit('order:updated', await service.order(parsed.data));
      } catch {
        await socket.leave('order:' + parsed.data);
        socket.emit('order:error', 'Order unavailable. Please retry.');
      }
    });
  });
  const onUpdated = (order: OrderResponse) =>
    io.to('order:' + order.id).emit('order:updated', order);
  service.events.on('updated', onUpdated);
  server.on('close', () => service.events.off('updated', onUpdated));
  return io;
}
