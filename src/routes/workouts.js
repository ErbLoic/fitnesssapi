const router = require('express').Router();
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');
const { transformWorkoutFromApp, formatWorkoutForApp, hashWorkout } = require('../lib/transformers');

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
      include: {
        _count: { select: { exerciseLogs: true } },
        // Inclure les exercises que si demandé explicitement (?details=full)
        ...(req.query.details === 'full' ? {
          exerciseLogs: { include: { setLogs: true, cardioLogs: true } }
        } : {})
      },
    }),
    prisma.workout.count({ where }),
  ]);

  // Formater la liste selon le mode demandé
  const getData = (w) => {
    if (req.query.details === 'full') {
      return formatWorkoutForApp(w);
    } else {
      // Mode liste légère
      return {
        id: w.id,
        name: w.name,
        workoutType: w.workoutType,
        startTime: w.startTime,
        endTime: w.endTime,
        durationMinutes: w.durationMinutes,
        caloriesBurned: w.caloriesBurned,
        exerciseCount: w._count.exerciseLogs,
      };
    }
  };

  res.json({
    data: workouts.map(getData),
    total,
    page,
    limit,
  });
});

// POST /workouts
router.post('/', async (req, res) => {
  // ━━━ Valider et transformer le body (accepte format APP ou API) ━━━
  // Schema flexible : accepte type|workoutType, startedAt|startTime, etc.
  const appSetSchema = z.object({
    setNumber: z.number().int(),
    reps: z.number().int().default(0),
    weightKg: z.number().default(0),
    isCompleted: z.boolean().default(true),
    restSec: z.number().int().optional(),  // ← format app
    restTimeSec: z.number().int().optional(),  // ← format api
    type: z.string().optional(),  // ← format app
    setType: z.string().optional(),  // ← format api
  });

  const appExerciseSchema = z.object({
    exerciseId: z.string(),
    exerciseName: z.string(),
    muscleGroup: z.string().optional(),  // ← format app
    exerciseType: z.string().optional(),  // ← format api
    notes: z.string().optional(),
    sortOrder: z.number().int().default(0),
    sets: z.array(appSetSchema).optional(),
    cardio: z.object({
      durationMin: z.number().optional(),
      durationMinutes: z.number().optional(),
      distanceKm: z.number().default(0),
      avgSpeedKmh: z.number().default(0),
      maxSpeedKmh: z.number().default(0),
      calories: z.number().optional(),
      caloriesBurned: z.number().optional(),
      avgHeartRate: z.number().int().optional(),
      maxHeartRate: z.number().int().optional(),
      resistanceLevel: z.number().int().optional(),
      incline: z.number().int().optional(),
      program: z.string().optional(),
    }).optional(),
  });

  const appSchema = z.object({
    name: z.string(),
    type: z.string().optional(),  // ← format app
    workoutType: z.string().optional(),  // ← format api
    startedAt: z.string().optional(),  // ← format app
    startTime: z.string().optional(),  // ← format api
    endedAt: z.string().optional(),  // ← format app
    endTime: z.string().optional(),  // ← format api
    durationMin: z.number().int().optional(),  // ← format app
    durationMinutes: z.number().int().optional(),  // ← format api
    calories: z.number().optional(),  // ← format app
    caloriesBurned: z.number().optional(),  // ← format api
    notes: z.string().optional(),
    exercises: z.array(appExerciseSchema).optional(),
  });

  const parsed = appSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }

  // ━━━ Transformer APP → format interne ━━━
  const workoutData = transformWorkoutFromApp(parsed.data);

  // ━━━ Détection duplicata via HASH ━━━
  const dupHash = hashWorkout(req.userId, workoutData.workoutType, workoutData.startTime, workoutData.durationMinutes);
  const existingWithHash = await prisma.workout.findFirst({
    where: { userId: req.userId, workoutType: workoutData.workoutType }
  });

  let isDuplicate = false;
  if (existingWithHash) {
    const timeDiff = Math.abs(existingWithHash.startTime.getTime() - workoutData.startTime.getTime());
    const durationDiff = Math.abs(existingWithHash.durationMinutes - workoutData.durationMinutes);
    if (timeDiff < 2 * 60 * 1000 && durationDiff < 2) {  // ±2 min time, ±2 min duration
      isDuplicate = true;
      // ━━━ Logger le dup potentiel ━━━
      await prisma.auditLog.create({
        data: {
          action: 'POTENTIAL_DUPLICATE',
          targetType: 'WORKOUT',
          targetId: `hash:${dupHash}`,
          payload: {
            newWorkout: { id: 'pending', startTime: workoutData.startTime, durationMinutes: workoutData.durationMinutes },
            existingWorkout: { id: existingWithHash.id, startTime: existingWithHash.startTime, durationMinutes: existingWithHash.durationMinutes },
          },
        },
      });
    }
  }

  // ━━━ Créer la séance ━━━
  const { exercises, ...restData } = workoutData;
  const workout = await prisma.workout.create({
    data: {
      ...restData,
      userId: req.userId,
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

  // ━━━ Retourner format APP ━━━
  const responseWorkout = formatWorkoutForApp(workout);
  responseWorkout.isDuplicate = isDuplicate;  // ← warning si dup détecté

  res.status(201).json(responseWorkout);
});

// GET /workouts/:id
router.get('/:id', async (req, res) => {
  const workout = await prisma.workout.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { exerciseLogs: { include: { setLogs: true, cardioLogs: true } } },
  });
  if (!workout) return res.status(404).json({ error: 'NOT_FOUND', message: 'Séance introuvable' });
  res.json(formatWorkoutForApp(workout));
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
