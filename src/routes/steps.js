const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const { transformStepsFromApp, formatStepsForApp } = require('../lib/transformers');
const prisma = require('../lib/prisma');
router.use(requireAuth);

function parseDayParam(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const day = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(day.getTime()) ? null : day;
}

function formatDay(date) {
  return date.toISOString().slice(0, 10);
}

function formatStepSummary(summary) {
  return {
    day: formatDay(summary.day),
    steps: summary.steps,
    calories: summary.calories ?? null,
    distanceKm: summary.distanceKm ?? null,
    source: summary.source,
    updatedAt: summary.updatedAt,
  };
}

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

    if (req.query.from || req.query.to || req.query.summary === 'true') {
      const where = { userId: req.userId };
      if (req.query.from) {
        const from = parseDayParam(req.query.from);
        if (!from) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'from doit etre au format YYYY-MM-DD' });
        where.day = { ...where.day, gte: from };
      }
      if (req.query.to) {
        const to = parseDayParam(req.query.to);
        if (!to) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'to doit etre au format YYYY-MM-DD' });
        where.day = { ...where.day, lte: to };
      }

      const summaries = await prisma.stepDailySummary.findMany({
        where,
        orderBy: { day: 'asc' },
      });

      const byDay = new Map();
      for (const summary of summaries) {
        const key = formatDay(summary.day);
        const existing = byDay.get(key) || { day: key, steps: 0, calories: 0, distanceKm: 0 };
        existing.steps += summary.steps;
        existing.calories += summary.calories || 0;
        existing.distanceKm += summary.distanceKm || 0;
        byDay.set(key, existing);
      }

      const legacyWhere = { userId: req.userId };
      if (where.day?.gte) legacyWhere.date = { ...legacyWhere.date, gte: where.day.gte };
      if (where.day?.lte) legacyWhere.date = { ...legacyWhere.date, lte: where.day.lte };
      const legacyDays = await prisma.dailySteps.findMany({
        where: legacyWhere,
        orderBy: { date: 'asc' },
      });
      for (const legacy of legacyDays) {
        const key = formatDay(legacy.date);
        if (byDay.has(key)) continue;
        byDay.set(key, {
          day: key,
          steps: legacy.steps,
          calories: legacy.caloriesBurned,
          distanceKm: legacy.distanceKm,
        });
      }

      return res.json({ days: Array.from(byDay.values()) });
    }

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

// PUT /steps/daily/:day
router.put('/daily/:day', async (req, res) => {
  try {
    const day = parseDayParam(req.params.day);
    if (!day) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'day doit etre au format YYYY-MM-DD' });

    const schema = z.object({
      steps: z.number().int().min(0),
      calories: z.number().min(0).nullable().optional(),
      distanceKm: z.number().min(0).nullable().optional(),
      source: z.string().trim().min(1).max(80).default('app'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
    }

    const data = parsed.data;
    const summary = await prisma.stepDailySummary.upsert({
      where: {
        userId_day_source: {
          userId: req.userId,
          day,
          source: data.source,
        },
      },
      update: {
        steps: data.steps,
        calories: data.calories ?? null,
        distanceKm: data.distanceKm ?? null,
      },
      create: {
        userId: req.userId,
        day,
        steps: data.steps,
        calories: data.calories ?? null,
        distanceKm: data.distanceKm ?? null,
        source: data.source,
      },
    });

    res.json(formatStepSummary(summary));
  } catch (err) {
    console.error(`[STEPS] PUT /daily/:day - ERROR:`, err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// POST /steps/sync-events
router.post('/sync-events', async (req, res) => {
  try {
    const schema = z.object({
      events: z.array(z.object({
        clientEventId: z.string().trim().min(1).max(200),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
        steps: z.number().int().min(0),
        rawCounterStart: z.number().int().nullable().optional(),
        rawCounterEnd: z.number().int().nullable().optional(),
        platform: z.enum(['android', 'ios']),
        source: z.string().trim().min(1).max(80).default('pedometer'),
      })).min(1).max(100),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
    }

    let inserted = 0;
    let ignored = 0;

    for (const event of parsed.data.events) {
      const startedAt = new Date(event.startedAt);
      const endedAt = new Date(event.endedAt);
      if (endedAt < startedAt) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'endedAt doit etre apres startedAt' });
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.stepSyncEvent.create({
            data: {
              userId: req.userId,
              clientEventId: event.clientEventId,
              startedAt,
              endedAt,
              steps: event.steps,
              rawCounterStart: event.rawCounterStart ?? null,
              rawCounterEnd: event.rawCounterEnd ?? null,
              platform: event.platform,
              source: event.source,
            },
          });

          const day = new Date(endedAt);
          day.setUTCHours(0, 0, 0, 0);

          await tx.stepDailySummary.upsert({
            where: {
              userId_day_source: {
                userId: req.userId,
                day,
                source: event.source,
              },
            },
            update: { steps: { increment: event.steps } },
            create: {
              userId: req.userId,
              day,
              steps: event.steps,
              source: event.source,
            },
          });
        });
        inserted += 1;
      } catch (err) {
        if (err.code === 'P2002') {
          ignored += 1;
          continue;
        }
        throw err;
      }
    }

    res.json({ inserted, ignored });
  } catch (err) {
    console.error(`[STEPS] POST /sync-events - ERROR:`, err.message);
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
