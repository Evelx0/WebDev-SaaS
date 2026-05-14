import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

export const SESSION_COOKIE = 'lp_session';

export type SessionPayload = {
  sub: string;
  email: string;
  role: 'admin' | 'user';
};

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionPayload;
  }
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.SESSION_SECRET, { expiresIn: '8h' });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.SESSION_SECRET) as jwt.JwtPayload & SessionPayload;
    if (typeof decoded.sub !== 'string' || typeof decoded.email !== 'string') return null;
    const role = decoded.role === 'admin' ? 'admin' : 'user';
    return { sub: decoded.sub, email: decoded.email, role };
  } catch {
    return null;
  }
}

export function attachSession(req: Request, _res: Response, next: NextFunction) {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  if (cookieToken) {
    const payload = verifySession(cookieToken);
    if (payload) req.session = payload;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  prisma.user.findUnique({
    where: { id: req.session.sub },
    select: { id: true, email: true, role: true, isActive: true },
  }).then((user) => {
    if (!user || !user.isActive) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    req.session = {
      sub: user.id,
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'user',
    };
    next();
  }).catch(next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }
  if (req.session.role !== 'admin') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
