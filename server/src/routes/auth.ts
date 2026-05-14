import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { loginSchema } from '../schemas/index.js';
import { clearSessionCookie, requireAuth, setSessionCookie, signSession } from '../middleware/auth.js';
import { hasUsableEmailConfig, hasUsableMailboxSync } from '../services/userSettings.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({ error: 'account_disabled' });
      return;
    }
    const token = signSession({ sub: user.id, email: user.email, role: user.role === 'admin' ? 'admin' : 'user' });
    setSessionCookie(res, token);
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      usageLimitPer24h: user.usageLimitPer24h,
      hasVercelConfig: user.role === 'admin' || Boolean(user.vercelApiTokenEnc && user.vercelProjectPrefix),
      hasOpenRouterKey: Boolean(user.openrouterApiKeyEnc),
      hasEmailConfig: hasUsableEmailConfig(user),
      hasMailboxSync: hasUsableMailboxSync(user),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session!.sub } });
    if (!user) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (!user.isActive) {
      clearSessionCookie(res);
      res.status(403).json({ error: 'account_disabled' });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      usageLimitPer24h: user.usageLimitPer24h,
      hasVercelConfig: user.role === 'admin' || Boolean(user.vercelApiTokenEnc && user.vercelProjectPrefix),
      hasOpenRouterKey: Boolean(user.openrouterApiKeyEnc),
      hasEmailConfig: hasUsableEmailConfig(user),
      hasMailboxSync: hasUsableMailboxSync(user),
    });
  } catch (err) {
    next(err);
  }
});
