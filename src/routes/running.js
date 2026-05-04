const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const { transformRunningFromApp, formatRunningForApp, hashRunning } = require('../lib/transformers');
const prisma = require('../lib/prisma');
router.use(requireAuth);

async function findAccessibleRunningSession(runningId, userId) {
  const session = await prisma.runningSession.findUnique({
    where: { id: runningId },
    include: { gpsPoints: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!session) return null;
  if (session.userId === userId) return session;

  const sharedByOwner = await prisma.message.findFirst({
    where: {
      runningId,
      senderId: session.userId,
      conversation: {
        participants: { some: { userId } },
      },
    },
    select: { id: true },
  });

  return sharedByOwner ? session : null;
}

// GET /running/stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    console.log(`[RUNNING] GET /stats/summary - User: ${req.userId}`);
    const userId = req.userId;
    const agg = await prisma.runningSession.aggregate({
      where: { userId },
      _sum: { distanceKm: true, durationSeconds: true, caloriesBurned: true },
      _count: true,
    });
    console.log(`[RUNNING] GET /stats/summary - SUCCESS: ${agg._count} sessions`);
    res.json({
      totalSessions: agg._count,
      totalDistanceKm: agg._sum.distanceKm || 0,
      totalDurationSeconds: agg._sum.durationSeconds || 0,
      totalCaloriesBurned: agg._sum.caloriesBurned || 0,
    });
  } catch (err) {
    console.error(`[RUNNING] GET /stats/summary - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// GET /running
router.get('/', async (req, res) => {
  try {
    console.log(`[RUNNING] GET / - User: ${req.userId}, Page: ${req.query.page}, Limit: ${req.query.limit}`);
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
    console.log(`[RUNNING] GET / - SUCCESS: ${sessions.length} sessions returned, total: ${total}`);
    res.json({ data: sessions, total, page, limit });
  } catch (err) {
    console.error(`[RUNNING] GET / - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// POST /running
router.post('/', async (req, res) => {
  try {
    console.log(`[RUNNING] POST / - User: ${req.userId}, Body keys:`, Object.keys(req.body));
    
    const gpsSchema = z.object({
      lat: z.number().optional(),
      latitude: z.number().optional(),
      lng: z.number().optional(),
      longitude: z.number().optional(),
      altitudeM: z.number().optional(),
      speedKmh: z.number().optional(),
      speedMs: z.number().optional(),
      accuracyM: z.number().optional(),
      recordedAt: z.string(),
      sortOrder: z.number().int().optional(),
    });

    const appSchema = z.object({
      startedAt: z.string().optional(),
      startTime: z.string().optional(),
      endedAt: z.string().optional(),
      endTime: z.string().optional(),
      durationSec: z.number().int().optional(),
      durationSeconds: z.number().int().optional(),
      distanceKm: z.number().default(0),
      avgSpeedKmh: z.number().default(0),
      maxSpeedKmh: z.number().default(0),
      calories: z.number().optional(),
      caloriesBurned: z.number().optional(),
      elevationGainM: z.number().default(0),
      elevationLossM: z.number().default(0),
      avgHeartRateBpm: z.number().int().optional(),
      avgHeartRate: z.number().int().optional(),
      maxHeartRate: z.number().int().optional(),
      weatherCondition: z.string().optional(),
      weather: z.string().optional(),
      temperatureC: z.number().optional(),
      notes: z.string().optional(),
      isCompleted: z.boolean().default(true),
      splits: z.array(z.object({ km: z.number(), timeMin: z.number() })).optional(),
      splitTimes: z.array(z.number()).optional(),
      gpsPoints: z.array(gpsSchema).optional(),
    });

    const parsed = appSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn(`[RUNNING] POST / - VALIDATION_ERROR:`, parsed.error.errors);
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
    }

    console.log(`[RUNNING] POST / - Transforming data...`);
    const sessionData = transformRunningFromApp(parsed.data);
    console.log(`[RUNNING] POST / - Transformed:`, { distance: sessionData.distanceKm, duration: sessionData.durationSeconds, calories: sessionData.caloriesBurned });

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
      console.log(`[RUNNING] POST / - Duplicate check: durationDiff=${durationDiff}sec, distanceDiff=${distanceDiff}km`);
      if (durationDiff < 120 && distanceDiff < 0.5) {
        isDuplicate = true;
        console.warn(`[RUNNING] POST / - POTENTIAL_DUPLICATE detected!`);
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

    console.log(`[RUNNING] POST / - Creating session with ${sessionData.gpsPoints?.length || 0} GPS points...`);
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

    const responseSession = formatRunningForApp(session);
    responseSession.isDuplicate = isDuplicate;

    console.log(`[RUNNING] POST / - SUCCESS: Created session ID=${session.id}, isDuplicate=${isDuplicate}`);
    res.status(201).json(responseSession);
  } catch (err) {
    console.error(`[RUNNING] POST / - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// GET /running/:id
router.get('/:id', async (req, res) => {
  try {
    console.log(`[RUNNING] GET /:id - User: ${req.userId}, ID: ${req.params.id}`);
    const session = await findAccessibleRunningSession(req.params.id, req.userId);
    if (!session) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session introuvable' });
    console.log(`[RUNNING] GET /:id - SUCCESS: Found session with ${session.gpsPoints?.length || 0} GPS points`);
    res.json(formatRunningForApp(session));
  } catch (err) {
    console.error(`[RUNNING] GET /:id - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// DELETE /running/:id
router.delete('/:id', async (req, res) => {
  try {
    console.log(`[RUNNING] DELETE /:id - User: ${req.userId}, ID: ${req.params.id}`);
    const existing = await prisma.runningSession.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Session introuvable' });
    await prisma.runningSession.delete({ where: { id: req.params.id } });
    console.log(`[RUNNING] DELETE /:id - SUCCESS`);
    res.json({ message: 'Session supprimée' });
  } catch (err) {
    console.error(`[RUNNING] DELETE /:id - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
