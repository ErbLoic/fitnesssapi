const router = require('express').Router();
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

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
  const gpsSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
    altitudeM: z.number().default(0),
    speedMs: z.number().default(0),
    accuracyM: z.number().optional(),
    recordedAt: z.string(),
    sortOrder: z.number().int(),
  });
  const schema = z.object({
    startTime: z.string(),
    endTime: z.string().optional(),
    durationSeconds: z.number().int().default(0),
    distanceKm: z.number().default(0),
    avgSpeedKmh: z.number().default(0),
    maxSpeedKmh: z.number().default(0),
    caloriesBurned: z.number().default(0),
    elevationGainM: z.number().default(0),
    elevationLossM: z.number().default(0),
    avgHeartRate: z.number().int().optional(),
    maxHeartRate: z.number().int().optional(),
    weather: z.string().optional(),
    temperatureC: z.number().optional(),
    notes: z.string().optional(),
    isCompleted: z.boolean().default(true),
    splitTimes: z.array(z.number()).default([]),
    gpsPoints: z.array(gpsSchema).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const { gpsPoints, ...sessionData } = parsed.data;

  const session = await prisma.runningSession.create({
    data: {
      ...sessionData,
      userId: req.userId,
      startTime: new Date(sessionData.startTime),
      endTime: sessionData.endTime ? new Date(sessionData.endTime) : undefined,
      gpsPoints: gpsPoints ? {
        create: gpsPoints.map(p => ({ ...p, recordedAt: new Date(p.recordedAt) })),
      } : undefined,
    },
  });
  res.status(201).json(session);
});

// GET /running/:id
router.get('/:id', async (req, res) => {
  const session = await prisma.runningSession.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { gpsPoints: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!session) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session introuvable' });
  res.json(session);
});

// DELETE /running/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.runningSession.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session introuvable' });
  await prisma.runningSession.delete({ where: { id: req.params.id } });
  res.json({ message: 'Session supprimée' });
});

module.exports = router;
