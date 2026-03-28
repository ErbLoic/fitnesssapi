const router = require('express').Router();
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
router.use(requireAuth);

// GET /workouts/stats/summary  (before /:id)
router.get('/stats/summary', async (req, res) => {
  const userId = req.userId;
  const [total, calories, weekCount] = await Promise.all([
    prisma.workout.count({ where: { userId } }),
    prisma.workout.aggregate({ where: { userId }, _sum: { caloriesBurned: true } }),
    prisma.workout.count({
      where: {
        userId,
        startTime: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);
  res.json({
    totalWorkouts: total,
    totalCaloriesBurned: calories._sum.caloriesBurned || 0,
    workoutsThisWeek: weekCount,
  });
});

// GET /workouts
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;
  const where = { userId: req.userId };
  if (req.query.from) where.startTime = { ...where.startTime, gte: new Date(req.query.from) };
  if (req.query.to) where.startTime = { ...where.startTime, lte: new Date(req.query.to) };

  const [workouts, total] = await Promise.all([
    prisma.workout.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startTime: 'desc' },
      include: { _count: { select: { exerciseLogs: true } } },
    }),
    prisma.workout.count({ where }),
  ]);

  res.json({
    data: workouts.map(w => ({
      id: w.id,
      name: w.name,
      workoutType: w.workoutType,
      startTime: w.startTime,
      durationMinutes: w.durationMinutes,
      caloriesBurned: w.caloriesBurned,
      exerciseCount: w._count.exerciseLogs,
    })),
    total,
    page,
    limit,
  });
});

// POST /workouts
router.post('/', async (req, res) => {
  const setSchema = z.object({
    setNumber: z.number().int(),
    reps: z.number().int().default(0),
    weightKg: z.number().default(0),
    isCompleted: z.boolean().default(true),
    restTimeSec: z.number().int().optional(),
    setType: z.string().default('normal'),
  });
  const exerciseSchema = z.object({
    exerciseId: z.string(),
    exerciseName: z.string(),
    exerciseType: z.string().default('strength'),
    notes: z.string().optional(),
    sortOrder: z.number().int().default(0),
    sets: z.array(setSchema).optional(),
    cardio: z.object({
      durationMinutes: z.number().default(0),
      distanceKm: z.number().default(0),
      avgSpeedKmh: z.number().default(0),
      maxSpeedKmh: z.number().default(0),
      caloriesBurned: z.number().default(0),
      avgHeartRate: z.number().int().optional(),
      maxHeartRate: z.number().int().optional(),
      resistanceLevel: z.number().int().optional(),
      incline: z.number().int().optional(),
      program: z.string().optional(),
    }).optional(),
  });
  const schema = z.object({
    name: z.string(),
    workoutType: z.string().default('strength'),
    startTime: z.string(),
    endTime: z.string().optional(),
    durationMinutes: z.number().int().default(0),
    caloriesBurned: z.number().default(0),
    notes: z.string().optional(),
    exercises: z.array(exerciseSchema).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const { exercises, ...workoutData } = parsed.data;

  const workout = await prisma.workout.create({
    data: {
      ...workoutData,
      userId: req.userId,
      startTime: new Date(workoutData.startTime),
      endTime: workoutData.endTime ? new Date(workoutData.endTime) : undefined,
      exerciseLogs: exercises ? {
        create: exercises.map(ex => ({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          exerciseType: ex.exerciseType,
          notes: ex.notes,
          sortOrder: ex.sortOrder,
          setLogs: ex.sets ? { create: ex.sets } : undefined,
          cardioLogs: ex.cardio ? { create: [ex.cardio] } : undefined,
        })),
      } : undefined,
    },
    include: { exerciseLogs: { include: { setLogs: true, cardioLogs: true } } },
  });

  await prisma.user.update({
    where: { id: req.userId },
    data: { totalWorkouts: { increment: 1 } },
  });

  res.status(201).json(workout);
});

// GET /workouts/:id
router.get('/:id', async (req, res) => {
  const workout = await prisma.workout.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { exerciseLogs: { include: { setLogs: true, cardioLogs: true } } },
  });
  if (!workout) return res.status(404).json({ error: 'NOT_FOUND', message: 'Séance introuvable' });
  res.json(workout);
});

// PATCH /workouts/:id
router.patch('/:id', async (req, res) => {
  const existing = await prisma.workout.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Séance introuvable' });

  const schema = z.object({
    name: z.string().optional(),
    notes: z.string().optional(),
    caloriesBurned: z.number().optional(),
    durationMinutes: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const workout = await prisma.workout.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(workout);
});

// DELETE /workouts/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.workout.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Séance introuvable' });
  await prisma.workout.delete({ where: { id: req.params.id } });
  await prisma.user.update({ where: { id: req.userId }, data: { totalWorkouts: { decrement: 1 } } });
  res.json({ message: 'Séance supprimée' });
});

module.exports = router;
