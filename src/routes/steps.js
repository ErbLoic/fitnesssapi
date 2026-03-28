const router = require('express').Router();
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
router.use(requireAuth);

// GET /steps/today
router.get('/today', async (req, res) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const entry = await prisma.dailySteps.findUnique({
    where: { userId_date: { userId: req.userId, date: today } },
    include: { hourlySteps: { orderBy: { hour: 'asc' } } },
  });
  if (!entry) return res.json({ steps: 0, date: today.toISOString().slice(0, 10) });
  res.json(entry);
});

// GET /steps/stats/weekly
router.get('/stats/weekly', async (req, res) => {
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);

  const days = await prisma.dailySteps.findMany({
    where: { userId: req.userId, date: { gte: from } },
    orderBy: { date: 'asc' },
  });
  const totalSteps = days.reduce((s, d) => s + d.steps, 0);
  res.json({ days, totalSteps, averageSteps: days.length ? Math.round(totalSteps / days.length) : 0 });
});

// GET /steps
router.get('/', async (req, res) => {
  const where = { userId: req.userId };
  if (req.query.from) where.date = { ...where.date, gte: new Date(req.query.from) };
  if (req.query.to) where.date = { ...where.date, lte: new Date(req.query.to) };

  const entries = await prisma.dailySteps.findMany({
    where,
    orderBy: { date: 'desc' },
    include: { hourlySteps: { orderBy: { hour: 'asc' } } },
  });
  res.json(entries);
});

// PUT /steps/:date
router.put('/:date', async (req, res) => {
  const schema = z.object({
    steps: z.number().int().default(0),
    distanceKm: z.number().default(0),
    caloriesBurned: z.number().default(0),
    activeMinutes: z.number().int().default(0),
    goal: z.number().int().default(10000),
    hourlyData: z.array(z.object({ hour: z.number().int().min(0).max(23), steps: z.number().int() })).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const { hourlyData, ...stepsData } = parsed.data;
  const date = new Date(req.params.date);
  date.setUTCHours(0, 0, 0, 0);

  const entry = await prisma.dailySteps.upsert({
    where: { userId_date: { userId: req.userId, date } },
    update: stepsData,
    create: { ...stepsData, userId: req.userId, date },
  });

  if (hourlyData && hourlyData.length > 0) {
    for (const h of hourlyData) {
      await prisma.hourlySteps.upsert({
        where: { dailyStepsId_hour: { dailyStepsId: entry.id, hour: h.hour } },
        update: { steps: h.steps },
        create: { dailyStepsId: entry.id, hour: h.hour, steps: h.steps },
      });
    }
  }

  const result = await prisma.dailySteps.findUnique({
    where: { id: entry.id },
    include: { hourlySteps: { orderBy: { hour: 'asc' } } },
  });
  res.json(result);
});

module.exports = router;
