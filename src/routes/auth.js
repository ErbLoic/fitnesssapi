const router = require('express').Router();
const passport = require('passport');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { issueAccessToken, issueRefreshToken } = require('../lib/tokens');
const requireAuth = require('../middleware/requireAuth');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  age: z.number().int().min(13).max(120).optional(),
  heightCm: z.number().positive().max(300).optional(),
  weightKg: z.number().positive().max(500).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dailyStepsGoal: z.number().int().min(1000).max(100000).optional(),
  fitnessLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /auth/register
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const { email, password, name, age, heightCm, weightKg, gender, dailyStepsGoal, fitnessLevel } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'CONFLICT', message: 'Un compte existe déjà avec cet email' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      ...(age !== undefined && { age }),
      ...(heightCm !== undefined && { heightCm }),
      ...(weightKg !== undefined && { weightKg }),
      ...(gender !== undefined && { gender }),
      ...(dailyStepsGoal !== undefined && { dailyStepsGoal }),
      ...(fitnessLevel !== undefined && { fitnessLevel }),
      settings: { create: {} },
    },
  });

  const accessToken = issueAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id);
  res.status(201).json({ accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email } });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Email ou mot de passe incorrect' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Email ou mot de passe incorrect' });
    }
    if (user.isBanned) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Compte suspendu' });
    }

    const accessToken = issueAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    return res.json({ accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Auth login error:', error.message);
    return res.status(503).json({
      error: 'SERVICE_UNAVAILABLE',
      message: 'Service temporairement indisponible, reessayez.',
      requestId: req.requestId,
    });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'refreshToken requis' });
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: true } });
  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Refresh token invalide ou expiré' });
  }

  const accessToken = issueAccessToken(stored.user);
  res.json({ accessToken });
});

// POST /auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }
  res.json({ message: 'Déconnexion réussie' });
});

// GET /auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failure' }),
  async (req, res) => {
    const accessToken = issueAccessToken(req.user);
    const refreshToken = await issueRefreshToken(req.user.id);
    const deeplink = process.env.FRONTEND_DEEPLINK || 'fitnessppro://auth';
    res.redirect(`${deeplink}?token=${accessToken}&refresh=${refreshToken}`);
  }
);

// GET /auth/github
router.get('/github', passport.authenticate('github', { scope: ['user:email'], session: false }));

router.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/auth/failure' }),
  async (req, res) => {
    const accessToken = issueAccessToken(req.user);
    const refreshToken = await issueRefreshToken(req.user.id);
    const deeplink = process.env.FRONTEND_DEEPLINK || 'fitnessppro://auth';
    res.redirect(`${deeplink}?token=${accessToken}&refresh=${refreshToken}`);
  }
);

// GET /auth/facebook
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));

router.get('/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/auth/failure' }),
  async (req, res) => {
    const accessToken = issueAccessToken(req.user);
    const refreshToken = await issueRefreshToken(req.user.id);
    const deeplink = process.env.FRONTEND_DEEPLINK || 'fitnessppro://auth';
    res.redirect(`${deeplink}?token=${accessToken}&refresh=${refreshToken}`);
  }
);

router.get('/failure', (req, res) => {
  res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentification OAuth échouée' });
});

module.exports = router;
