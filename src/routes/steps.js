const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const { transformStepsFromApp, formatStepsForApp } = require('../lib/transformers');
const prisma = require('../lib/prisma');
router.use(requireAuth);

// GET /steps/today
router.get('/today', async (req, res) => {
  try {
    console.log(`[STEPS] GET /today - User: ${req.userId}`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const entry = await prisma.dailySteps.findUnique({
      where: { userId_date: { userId: req.userId, date: today } },
      include: { hourlySteps: { orderBy: { hour: 'asc' } } },
    });
    if (!entry) {
      console.log(`[STEPS] GET /today - No entry for today`);
      return res.json({ steps: 0, date: today.toISOString().slice(0, 10) });
    }
    console.log(`[STEPS] GET /today - SUCCESS: ${entry.steps} steps`);
    res.json(entry);
  } catch (err) {
    console.error(`[STEPS] GET /today - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// GET /steps/stats/weekly
router.get('/stats/weekly', async (req, res) => {
  try {
    console.log(`[STEPS] GET /stats/weekly - User: ${req.userId}`);
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    from.setUTCHours(0, 0, 0, 0);

    const days = await prisma.dailySteps.findMany({
      where: { userId: req.userId, date: { gte: from } },
      orderBy: { date: 'asc' },
    });
    const totalSteps = days.reduce((s, d) => s + d.steps, 0);
    console.log(`[STEPS] GET /stats/weekly - SUCCESS: ${days.length} days, total: ${totalSteps} steps`);
    res.json({ days, totalSteps, averageSteps: days.length ? Math.round(totalSteps / days.length) : 0 });
  } catch (err) {
    console.error(`[STEPS] GET /stats/weekly - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// GET /steps
router.get('/', async (req, res) => {
  try {
    console.log(`[STEPS] GET / - User: ${req.userId}, From: ${req.query.from}, To: ${req.query.to}`);
    const where = { userId: req.userId };
    if (req.query.from) where.date = { ...where.date, gte: new Date(req.query.from) };
    if (req.query.to) where.date = { ...where.date, lte: new Date(req.query.to) };

    const entries = await prisma.dailySteps.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { hourlySteps: { orderBy: { hour: 'asc' } } },
    });
    console.log(`[STEPS] GET / - SUCCESS: ${entries.length} entries returned`);
    res.json(entries.map(formatStepsForApp));
  } catch (err) {
    console.error(`[STEPS] GET / - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// PUT /steps/:date
router.put('/:date', async (req, res) => {
  try {
    console.log(`[STEPS] PUT /:date - User: ${req.userId}, Date: ${req.params.date}, Body keys:`, Object.keys(req.body));
    
    const appSchema = z.object({
      steps: z.number().int().default(0),
      distanceKm: z.number().default(0),
      calories: z.number().optional(),
      caloriesBurned: z.number().optional(),
      activeMinutes: z.number().int().default(0),
      goal: z.number().int().default(10000),
      hourlySteps: z.array(z.number().int()).optional(),
      hourlyData: z.array(z.object({ hour: z.number().int().min(0).max(23), steps: z.number().int() })).optional(),
    });

    const parsed = appSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn(`[STEPS] PUT /:date - VALIDATION_ERROR:`, parsed.error.errors);
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
    }

    console.log(`[STEPS] PUT /:date - Transforming data...`);
    const stepsData = transformStepsFromApp(parsed.data);
    const { hourlyData, ...entryData } = stepsData;

    const date = new Date(req.params.date);
    date.setUTCHours(0, 0, 0, 0);

    const entry = await prisma.dailySteps.upsert({
      where: { userId_date: { userId: req.userId, date } },
      update: entryData,
      create: { ...entryData, userId: req.userId, date },
    });

    if (hourlyData && hourlyData.length > 0) {
      console.log(`[STEPS] PUT /:date - Updating ${hourlyData.length} hourly entries...`);
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
    
    console.log(`[STEPS] PUT /:date - SUCCESS: ${result.steps} steps saved`);
    res.json(formatStepsForApp(result));
  } catch (err) {
    console.error(`[STEPS] PUT /:date - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
