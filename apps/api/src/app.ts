import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './errors.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { catalogRouter, vehiclesRouter } from './routes/customer.js';
import { washerRouter } from './routes/washer.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/auth', authRouter);
  app.use('/', catalogRouter);
  app.use('/vehicles', vehiclesRouter);
  app.use('/bookings', bookingsRouter);
  app.use('/washer', washerRouter);
  app.use('/admin', adminRouter);

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err?.code === '23503') {
      res.status(409).json({ error: 'This record is still used elsewhere' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  };
  app.use(onError);
  return app;
}
