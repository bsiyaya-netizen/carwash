import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';

export const hubsRouter = Router();

/** Active hubs, nearest first when lat/lng are given. */
hubsRouter.get('/', async (req, res) => {
  const pos = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).safeParse(req.query);
  if (!pos.success) {
    res.json(await query('SELECT *, NULL::float AS distance_km FROM hubs WHERE active ORDER BY name'));
    return;
  }
  res.json(await query(
    `SELECT *, round((6371 * acos(least(1, cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2))
        + sin(radians($1)) * sin(radians(lat)))))::numeric, 1)::float AS distance_km
     FROM hubs WHERE active ORDER BY distance_km`,
    [pos.data.lat, pos.data.lng],
  ));
});
