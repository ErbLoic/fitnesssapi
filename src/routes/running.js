const router = require('express').Router();
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');
const { transformRunningFromApp, formatRunningForApp, hashRunning } = require('../lib/transformers');

const prisma = new PrismaClient();
router.use(requireAuth);

// GET /running/stats/summary
router.get('/stats/summary', async (req, res) => {
  const userId = req.userId;
  const agg = await prisma.runningSession.aggregate({
    where: { userId },
    _sum: { distanceKm: true, durationSeconds: true, caloriesBurned: true },
    _count: true,
  });
  res.json({
    totalSessions: agg._count,
    totalDistanceKm: agg._sum.distanceKm || 0,
    totalDurationSeconds: agg._sum.durationSeconds || 0,
    totalCaloriesBurned: agg._sum.caloriesBurned || 0,
  });
});

// GET /running
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    prisma.runningSession.findMany({
      where: { userId: req.userId },
      skip, take: limit,
      orderBy: { startTime: 'desc' },
      select: {
        id: true, startTime: true, endTime: true, durationSeconds: true,
        distanceKm: true, avgSpeedKmh: true, caloriesBurned: true,
        elevationGainM: true, isCompleted: true, createdAt: true,
      },
    }),
    prisma.runningSession.count({ where: { userId: req.userId } }),
  ]);
  res.json({ data: sessions, total, page, limit });
});

// POST /running
router.post('/', async (req, res) => {
  // ━━━ Valider et transformer le body (accepte format APP ou API) ━━━
  const gpsSchema = z.object({
    lat: z.number().optional(),  // ← format app
    latitude: z.number().optional(),  // ← format api
    lng: z.number().optional(),  // ← format app
    longitude: z.number().optional(),  // ← format api
    altitudeM: z.number().optional(),
    speedKmh: z.number().optional(),  // ← format app (km/h)
    speedMs: z.number().optional(),  // ← format api (m/s)
    accuracyM: z.number().optional(),
    recordedAt: z.string(),
    sortOrder: z.number().int().optional(),
  });

  const appSchema = z.object({
    startedAt: z.string().optional(),  // ← format app
    startTime: z.string().optional(),  // ← format api
    endedAt: z.string().optional(),  // ← format app
    endTime: z.string().optional(),  // ← format api
    durationSec: z.number().int().optional(),  // ← format app
    durationSeconds: z.number().int().optional(),  // ← format api
    distanceKm: z.number().default(0),
    avgSpeedKmh: z.number().default(0),
    maxSpeedKmh: z.number().default(0),
    calories: z.number().optional(),  // ← format app
    caloriesBurned: z.number().optional(),  // ← format api
    elevationGainM: z.number().default(0),
    elevationLossM: z.number().default(0),
    avgHeartRateBpm: z.number().int().optional(),  // ← format app
    avgHeartRate: z.number().int().optional(),  // ← format api
    maxHeartRate: z.number().int().optional(),
    weatherCondition: z.string().optional(),  // ← format app
    weather: z.string().optional(),  // ← format api
    temperatureC: z.number().optional(),
    notes: z.string().optional(),
    isCompleted: z.boolean().default(true),
    splits: z.array(z.object({ km: z.number(), timeMin: z.number() })).optional(),  // ← format app
    splitTimes: z.array(z.number()).optional(),  // ← format api
    gpsPoints: z.array(gpsSchema).optional(),
  });

  const parsed = appSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }

  // ━━━ Transformer APP → format interne ━━━
  const sessionData = transformRunningFromApp(parsed.data);

  // ━━━ Détection duplicata via HASH ━━━
  const dupHash = hashRunning(req.userId, sessionData.startTime, sessionData.durationSeconds, sessionData.distanceKm);
  const existingWithHash = await prisma.runningSession.findFirst({
    where: {
      userId: req.userId,
      startTime: { gte: new Date(sessionData.startTime.getTime() - 2 * 60 * 1000), lte: new Date(sessionData.startTime.getTime() + 2 * 60 * 1000) },
    }
  });

  let isDuplicate = false;
  if (existingWithHash) {
    const durationDiff = Math.abs(existingWithHash.durationSeconds - sessionData.durationSeconds);
    const distanceDiff = Math.abs(existingWithHash.distanceKm - sessionData.distanceKm);
    if (durationDiff < 120 && distanceDiff < 0.5) {  // ±120 sec duration, ±500m distance
      isDuplicate = true;
      // ━━━ Logger le dup potentiel ━━━
      await prisma.auditLog.create({
        data: {
          action: 'POTENTIAL_DUPLICATE',
          targetType: 'RUNNING',
          targetId: `hash:${dupHash}`,
          payload: {
            newSession: { id: 'pending', startTime: sessionData.startTime, durationSeconds: sessionData.durationSeconds },
            existingSession: { id: existingWithHash.id, startTime: existingWithHash.startTime, durationSeconds: existingWithHash.durationSeconds },
          },
        },
      });
    }
  }

  // ━━━ Créer la session ━━━
  const { gpsPoints, ...restData } = sessionData;
  const session = await prisma.runningSession.create({
    data: {
      ...restData,
      userId: req.userId,
      gpsPoints: gpsPoints ? {
        create: gpsPoints.map((p, idx) => ({ ...p, recordedAt: new Date(p.recordedAt), sortOrder: idx })),
      } : undefined,
    },
    include: { gpsPoints: { orderBy: { sortOrder: 'asc' } } },
  });

  // ━━━ Retourner format APP ━━━
  const responseSession = formatRunningForApp(session);
  responseSession.isDuplicate = isDuplicate;  // ← warning si dup détecté

  res.status(201).json(responseSession);
});

// GET /running/:id
router.get('/:id', async (req, res) => {
  const session = await prisma.runningSession.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { gpsPoints: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!session) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session introuvable' });
  res.json(formatRunningForApp(session));
});

// DELETE /running/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.runningSession.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session introuvable' });
  await prisma.runningSession.delete({ where: { id: req.params.id } });
  res.json({ message: 'Session supprimée' });
});

module.exports = router;
