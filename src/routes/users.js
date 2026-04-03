const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');

router.use(requireAuth);

// GET /users/search?q=
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Le terme de recherche doit faire au moins 2 caractères' });
  }
  const users = await prisma.user.findMany({
    where: {
      id: { not: req.userId },
      name: { contains: q, mode: 'insensitive' },
    },
    select: { id: true, name: true, fitnessLevel: true, profileImageUrl: true },
    take: 20,
  });
  res.json(users);
});

// GET /users/me
router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' });

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    age: user.age,
    heightCm: user.heightCm,
    weightKg: user.weightKg,
    gender: user.gender,
    fitnessLevel: user.fitnessLevel,
    profileImageUrl: user.profileImageUrl,
    dailyStepsGoal: user.dailyStepsGoal,
    dailyCaloriesGoal: user.dailyCaloriesGoal,
    weeklyWorkoutsGoal: user.weeklyWorkoutsGoal,
    totalWorkouts: user.totalWorkouts,
    currentStreak: user.currentStreak,
    bestStreak: user.bestStreak,
    onboardingComplete: user.onboardingComplete,
    createdAt: user.createdAt,
  });
});

// PATCH /users/me
router.patch('/me', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    age: z.number().int().positive().optional(),
    heightCm: z.number().positive().optional(),
    weightKg: z.number().positive().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    fitnessLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    onboardingComplete: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const user = await prisma.user.update({ where: { id: req.userId }, data: parsed.data });
  res.json({ id: user.id, name: user.name, email: user.email });
});

// PATCH /users/me/goals
router.patch('/me/goals', async (req, res) => {
  const schema = z.object({
    dailyStepsGoal: z.number().int().positive().optional(),
    dailyCaloriesGoal: z.number().positive().optional(),
    weeklyWorkoutsGoal: z.number().int().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const user = await prisma.user.update({ where: { id: req.userId }, data: parsed.data });
  res.json({ dailyStepsGoal: user.dailyStepsGoal, dailyCaloriesGoal: user.dailyCaloriesGoal, weeklyWorkoutsGoal: user.weeklyWorkoutsGoal });
});

// DELETE /users/me
router.delete('/me', async (req, res) => {
  await prisma.user.delete({ where: { id: req.userId } });
  res.json({ message: 'Compte supprimé avec succès' });
});

module.exports = router;
