const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const { transformWorkoutFromApp, formatWorkoutForApp, hashWorkout } = require('../lib/transformers');
const prisma = require('../lib/prisma');
router.use(requireAuth);

async function findAccessibleWorkout(workoutId, userId) {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { exerciseLogs: { include: { setLogs: true, cardioLogs: true } } },
  });
  if (!workout) return null;
  if (workout.userId === userId) return workout;

  const sharedByOwner = await prisma.message.findFirst({
    where: {
      workoutId,
      senderId: workout.userId,
      conversation: {
        participants: { some: { userId } },
      },
    },
    select: { id: true },
  });

  return sharedByOwner ? workout : null;
}

// GET /workouts/stats/summary  (before /:id)
router.get('/stats/summary', async (req, res) => {
  try {
    console.log(`[WORKOUTS] GET /stats/summary - User: ${req.userId}`);
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
    console.log(`[WORKOUTS] GET /stats/summary - SUCCESS: ${total} workouts, ${calories._sum.caloriesBurned || 0} calories`);
    res.json({
      totalWorkouts: total,
      totalCaloriesBurned: calories._sum.caloriesBurned || 0,
      workoutsThisWeek: weekCount,
    });
  } catch (err) {
    console.error(`[WORKOUTS] GET /stats/summary - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// GET /workouts
router.get('/', async (req, res) => {
  try {
    console.log(`[WORKOUTS] GET / - User: ${req.userId}, Page: ${req.query.page}, Limit: ${req.query.limit}`);
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
          ...(req.query.details === 'full' ? {
            exerciseLogs: { include: { setLogs: true, cardioLogs: true } }
          } : {})
        },
      }),
      prisma.workout.count({ where }),
    ]);

    const getData = (w) => {
      if (req.query.details === 'full') {
        return formatWorkoutForApp(w);
      } else {
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

    console.log(`[WORKOUTS] GET / - SUCCESS: ${workouts.length} workouts returned, total: ${total}`);
    res.json({
      data: workouts.map(getData),
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error(`[WORKOUTS] GET / - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// POST /workouts
router.post('/', async (req, res) => {
  try {
    console.log(`[WORKOUTS] POST / - User: ${req.userId}, Body keys:`, Object.keys(req.body));
    
    const appSetSchema = z.object({
      setNumber: z.number().int(),
      reps: z.number().int().default(0),
      weightKg: z.number().default(0),
      isCompleted: z.boolean().default(true),
      restSec: z.number().int().optional(),
      restTimeSec: z.number().int().optional(),
      type: z.string().optional(),
      setType: z.string().optional(),
    });

    const appExerciseSchema = z.object({
      exerciseId: z.string(),
      exerciseName: z.string(),
      muscleGroup: z.string().optional(),
      exerciseType: z.string().optional(),
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
      type: z.string().optional(),
      workoutType: z.string().optional(),
      startedAt: z.string().optional(),
      startTime: z.string().optional(),
      endedAt: z.string().optional(),
      endTime: z.string().optional(),
      durationMin: z.number().int().optional(),
      durationMinutes: z.number().int().optional(),
      calories: z.number().optional(),
      caloriesBurned: z.number().optional(),
      notes: z.string().optional(),
      exercises: z.array(appExerciseSchema).optional(),
    });

    const parsed = appSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn(`[WORKOUTS] POST / - VALIDATION_ERROR:`, parsed.error.errors);
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
    }

    console.log(`[WORKOUTS] POST / - Transforming data...`);
    const workoutData = transformWorkoutFromApp(parsed.data);
    console.log(`[WORKOUTS] POST / - Transformed:`, { type: workoutData.workoutType, duration: workoutData.durationMinutes, calories: workoutData.caloriesBurned });

    const dupHash = hashWorkout(req.userId, workoutData.workoutType, workoutData.startTime, workoutData.durationMinutes);
    const existingWithHash = await prisma.workout.findFirst({
      where: { userId: req.userId, workoutType: workoutData.workoutType }
    });

    let isDuplicate = false;
    if (existingWithHash) {
      const timeDiff = Math.abs(existingWithHash.startTime.getTime() - workoutData.startTime.getTime());
      const durationDiff = Math.abs(existingWithHash.durationMinutes - workoutData.durationMinutes);
      console.log(`[WORKOUTS] POST / - Duplicate check: timeDiff=${timeDiff}ms, durationDiff=${durationDiff}min`);
      if (timeDiff < 2 * 60 * 1000 && durationDiff < 2) {
        isDuplicate = true;
        console.warn(`[WORKOUTS] POST / - POTENTIAL_DUPLICATE detected!`);
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

    console.log(`[WORKOUTS] POST / - Creating workout...`);
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

    const responseWorkout = formatWorkoutForApp(workout);
    responseWorkout.isDuplicate = isDuplicate;

    console.log(`[WORKOUTS] POST / - SUCCESS: Created workout ID=${workout.id}, isDuplicate=${isDuplicate}`);
    res.status(201).json(responseWorkout);
  } catch (err) {
    console.error(`[WORKOUTS] POST / - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// GET /workouts/:id
router.get('/:id', async (req, res) => {
  try {
    console.log(`[WORKOUTS] GET /:id - User: ${req.userId}, ID: ${req.params.id}`);
    const workout = await findAccessibleWorkout(req.params.id, req.userId);
    if (!workout) return res.status(404).json({ error: 'NOT_FOUND', message: 'Séance introuvable' });
    console.log(`[WORKOUTS] GET /:id - SUCCESS: Found workout`);
    res.json(formatWorkoutForApp(workout));
  } catch (err) {
    console.error(`[WORKOUTS] GET /:id - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// PATCH /workouts/:id
router.patch('/:id', async (req, res) => {
  try {
    console.log(`[WORKOUTS] PATCH /:id - User: ${req.userId}, ID: ${req.params.id}`);
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
      console.warn(`[WORKOUTS] PATCH /:id - VALIDATION_ERROR:`, parsed.error.errors);
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
    }
    const workout = await prisma.workout.update({ where: { id: req.params.id }, data: parsed.data });
    console.log(`[WORKOUTS] PATCH /:id - SUCCESS`);
    res.json(workout);
  } catch (err) {
    console.error(`[WORKOUTS] PATCH /:id - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// DELETE /workouts/:id
router.delete('/:id', async (req, res) => {
  try {
    console.log(`[WORKOUTS] DELETE /:id - User: ${req.userId}, ID: ${req.params.id}`);
    const existing = await prisma.workout.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Séance introuvable' });
    await prisma.workout.delete({ where: { id: req.params.id } });
    await prisma.user.update({ where: { id: req.userId }, data: { totalWorkouts: { decrement: 1 } } });
    console.log(`[WORKOUTS] DELETE /:id - SUCCESS`);
    res.json({ message: 'Séance supprimée' });
  } catch (err) {
    console.error(`[WORKOUTS] DELETE /:id - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
