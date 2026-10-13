import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { config } from './config.js';
import { one, query } from './db.js';

let io: Server;

/**
 * Rooms:
 *   user:<id>      every socket of a user
 *   washers        online washers (new job alerts)
 *   admins         admin dashboard
 *   booking:<id>   customer + assigned washer (status + live location)
 */
export function initRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: config.corsOrigins.length ? config.corsOrigins : '*' } });

  io.use((socket, next) => {
    try {
      socket.data.user = verifyToken(String(socket.handshake.auth?.token ?? ''));
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as { id: string; role: string };
    socket.join(`user:${user.id}`);
    if (user.role === 'washer') socket.join('washers');
    if (user.role === 'admin') socket.join('admins');

    socket.on('booking:watch', async (bookingId: string) => {
      const b = await one('SELECT customer_id, washer_id FROM bookings WHERE id = $1', [bookingId]);
      if (b && (b.customer_id === user.id || b.washer_id === user.id || user.role === 'admin')) {
        socket.join(`booking:${bookingId}`);
      }
    });

    // Washer GPS ping while travelling to / at a job.
    socket.on('washer:location', async (p: { lat: number; lng: number }) => {
      if (user.role !== 'washer' || typeof p?.lat !== 'number' || typeof p?.lng !== 'number') return;
      await query('UPDATE users SET last_lat = $2, last_lng = $3 WHERE id = $1', [user.id, p.lat, p.lng]);
      const active = await query<{ id: string }>(
        `SELECT id FROM bookings WHERE washer_id = $1 AND status IN ('accepted','en_route','arrived','in_progress')`,
        [user.id],
      );
      for (const b of active) io.to(`booking:${b.id}`).emit('washer:location', { bookingId: b.id, ...p, at: Date.now() });
    });
  });
  return io;
}

export function emit(room: string, event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}
