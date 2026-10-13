import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { HttpError } from './errors.js';

export type Role = 'customer' | 'washer' | 'admin';
export interface AuthUser { id: string; role: Role }

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, config.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthUser {
  const { id, role } = jwt.verify(token, config.jwtSecret) as AuthUser;
  return { id, role };
}

export function requireAuth(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      req.user = verifyToken(token);
    } catch {
      return next(new HttpError(401, 'Not signed in'));
    }
    if (roles.length && !roles.includes(req.user.role)) return next(new HttpError(403, 'Wrong role'));
    next();
  };
}

/** Use after requireAuth: narrows req.user for handlers. */
export const me = (req: Request) => req.user as AuthUser;
