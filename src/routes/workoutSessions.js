const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');
const { formatWorkoutForApp } = require('../lib/transformers');

router.use(requireAuth);

const sources = ['free', 'program', 'template'];
const statuses = ['draft', 'active', 'finished', 'abandoned'];

const sessionExerciseSetSchema = z.object({
  setIndex: z.number().int().positive().optional(),
  setNumber: z.number().int().positive().optional(),
  reps: z.number().int().nonnegative().default(0),
  weight: z.number().default(0).optional(),
  weightKg: z.number().default(0).optional(),
  completed: z.boolean().default(false),
  isCompleted: z.boolean().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  restSeconds: z.number().int().nonnegative().nullable().optional(),
});

const sessionExerciseSchema = z.object({
  exerciseId: z.string().trim().min(1).nullable().optional(),
  customExerciseName: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).nullable().optional(),
  position: z.number().int().default(0),
  sets: z.array(sessionExerciseSetSchema).default([]),
}).refine(
  (value) => value.exerciseId || value.customExerciseName || value.name,
  { message: 'exerciseId, customExerciseName ou name est requis' },
);

const draftCreateSchema = z.object({
  source: z.enum(sources).default('free'),
  programId: z.string().uuid().nullable().optional(),
  programDayId: z.string().uuid().nullable().optional(),
  startedAt: z.string().datetime().optional(),
  elapsedSeconds: z.number().int().nonnegative().default(0),
  notes: z.string().nullable().optional(),
  exercises: z.array(sessionExerciseSchema).optional(),
});

const draftPatchSchema = z.object({
  source: z.enum(sources).optional(),
  status: z.enum(statuses).optional(),
  programId: z.string().uuid().nullable().optional(),
  programDayId: z.string().uuid().nullable().optional(),
  startedAt: z.string().datetime().optional(),
  elapsedSeconds: z.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  exercises: z.array(sessionExerciseSchema).optional(),
  revision: z.number().int().positive().optional(),
});

const completeSchema = z.object({
  name: z.string().trim().min(1).optional(),
  notes: z.string().nullable().optional(),
  finishedAt: z.string().datetime().optional(),
  caloriesBurned: z.number().nonnegative().optional(),
});

function validationError(res, parsed) {
  const first = parsed.error.errors[0];
  return res.status(400).json({
    error: 'validation_error',
    message: first.message,
    fields: first.path.length ? { [first.path.join('.')]: first.code } : undefined,
  });
}

function formatDraft(draft) {
  if (!draft) return null;
  return {
    id: draft.id,
    userId: draft.userId,
    programId: draft.programId,
    programDayId: draft.programDayId,
    source: draft.source,
    status: draft.status,
    isFinished: draft.isFinished,
    startedAt: draft.startedAt,
    finishedAt: draft.finishedAt,
    lastSavedAt: draft.lastSavedAt,
    elapsedSeconds: draft.elapsedSeconds,
    revision: draft.revision,
    notes: draft.notes,
    exercises: draft.exercises || [],
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

async function ensureProgramScope(userId, programId, programDayId) {
  if (!programId && !programDayId) return true;

  const program = await prisma.customProgram.findFirst({
    where: {
      id: programId || undefined,
      userId,
      deletedAt: null,
      days: programDayId ? { some: { id: programDayId } } : undefined,
    },
    select: { id: true },
  });

  return Boolean(program);
}

async function exercisesFromProgramDay(userId, programDayId) {
  if (!programDayId) return undefined;

  const day = await prisma.customProgramDay.findFirst({
    where: {
      id: programDayId,
      program: { userId, deletedAt: null },
    },
    include: { exercises: { orderBy: { position: 'asc' } } },
  });

  if (!day) return undefined;

  return day.exercises.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    customExerciseName: exercise.customExerciseName,
    name: exercise.customExerciseName,
    position: exercise.position,
    sets: Array.from({ length: exercise.targetSets || 0 }, (_value, index) => ({
      setIndex: index + 1,
      reps: 0,
      weight: exercise.targetWeight || 0,
      completed: false,
      completedAt: null,
    })),
  }));
}

function mapDraftExercisesToWorkout(exercises) {
  return (exercises || []).map((exercise, exerciseIndex) => {
    const exerciseName = exercise.name || exercise.customExerciseName || exercise.exerciseId || 'Exercice libre';

    return {
      exerciseId: exercise.exerciseId || `custom:${exerciseName}`.slice(0, 100),
      exerciseName,
      exerciseType: 'strength',
      sortOrder: exercise.position ?? exerciseIndex,
      setLogs: {
        create: (exercise.sets || []).map((set, setIndex) => ({
          setNumber: set.setIndex || set.setNumber || setIndex + 1,
          reps: set.reps ?? 0,
          weightKg: set.weight ?? set.weightKg ?? 0,
          isCompleted: set.completed ?? set.isCompleted ?? false,
          restTimeSec: set.restSeconds ?? null,
          setType: 'normal',
        })),
      },
    };
  });
}

router.get('/active', async (req, res) => {
  try {
    const draft = await prisma.workoutSessionDraft.findFirst({
      where: {
        userId: req.userId,
        status: { in: ['draft', 'active'] },
        isFinished: false,
      },
      orderBy: { lastSavedAt: 'desc' },
    });

    res.json(formatDraft(draft));
  } catch (err) {
    console.error('[WORKOUT_SESSIONS] GET /active - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

router.post('/draft', async (req, res) => {
  try {
    const parsed = draftCreateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);

    const active = await prisma.workoutSessionDraft.findFirst({
      where: { userId: req.userId, status: { in: ['draft', 'active'] }, isFinished: false },
    });
    if (active) {
      return res.status(409).json({
        error: 'active_session_exists',
        message: 'Une séance est déjà en cours',
        session: formatDraft(active),
      });
    }

    const scoped = await ensureProgramScope(req.userId, parsed.data.programId, parsed.data.programDayId);
    if (!scoped) return res.status(404).json({ error: 'not_found', message: 'Programme introuvable' });

    const exercises = parsed.data.exercises ?? await exercisesFromProgramDay(req.userId, parsed.data.programDayId) ?? [];

    const draft = await prisma.workoutSessionDraft.create({
      data: {
        userId: req.userId,
        source: parsed.data.source,
        status: 'active',
        programId: parsed.data.programId ?? null,
        programDayId: parsed.data.programDayId ?? null,
        startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date(),
        elapsedSeconds: parsed.data.elapsedSeconds,
        notes: parsed.data.notes ?? null,
        exercises,
        lastSavedAt: new Date(),
      },
    });

    res.status(201).json(formatDraft(draft));
  } catch (err) {
    console.error('[WORKOUT_SESSIONS] POST /draft - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

router.patch('/draft/:id', async (req, res) => {
  try {
    const parsed = draftPatchSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);

    const existing = await prisma.workoutSessionDraft.findFirst({
      where: { id: req.params.id, userId: req.userId, status: { in: ['draft', 'active'] }, isFinished: false },
    });
    if (!existing) return res.status(404).json({ error: 'not_found', message: 'Séance en cours introuvable' });

    if (parsed.data.revision && parsed.data.revision < existing.revision) {
      return res.status(409).json({
        error: 'revision_conflict',
        message: 'Une sauvegarde plus récente existe déjà',
        session: formatDraft(existing),
      });
    }

    const nextProgramId = Object.prototype.hasOwnProperty.call(parsed.data, 'programId') ? parsed.data.programId : existing.programId;
    const nextProgramDayId = Object.prototype.hasOwnProperty.call(parsed.data, 'programDayId') ? parsed.data.programDayId : existing.programDayId;
    const scoped = await ensureProgramScope(req.userId, nextProgramId, nextProgramDayId);
    if (!scoped) return res.status(404).json({ error: 'not_found', message: 'Programme introuvable' });

    const updateData = {
      lastSavedAt: new Date(),
      revision: { increment: 1 },
    };

    for (const key of ['source', 'status', 'programId', 'programDayId', 'elapsedSeconds', 'notes', 'exercises']) {
      if (Object.prototype.hasOwnProperty.call(parsed.data, key)) updateData[key] = parsed.data[key];
    }
    if (parsed.data.startedAt) updateData.startedAt = new Date(parsed.data.startedAt);

    const draft = await prisma.workoutSessionDraft.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(formatDraft(draft));
  } catch (err) {
    console.error('[WORKOUT_SESSIONS] PATCH /draft/:id - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

router.post('/draft/:id/complete', async (req, res) => {
  try {
    const parsed = completeSchema.safeParse(req.body || {});
    if (!parsed.success) return validationError(res, parsed);

    const existing = await prisma.workoutSessionDraft.findFirst({
      where: { id: req.params.id, userId: req.userId, status: { in: ['draft', 'active'] }, isFinished: false },
    });
    if (!existing) return res.status(404).json({ error: 'not_found', message: 'Séance en cours introuvable' });

    const finishedAt = parsed.data.finishedAt ? new Date(parsed.data.finishedAt) : new Date();
    const result = await prisma.$transaction(async (tx) => {
      const createdWorkout = await tx.workout.create({
        data: {
          userId: req.userId,
          name: parsed.data.name || `Séance du ${existing.startedAt.toISOString().slice(0, 10)}`,
          workoutType: 'strength',
          startTime: existing.startedAt,
          endTime: finishedAt,
          durationMinutes: Math.max(0, Math.round(existing.elapsedSeconds / 60)),
          caloriesBurned: parsed.data.caloriesBurned ?? 0,
          notes: parsed.data.notes ?? existing.notes,
          exerciseLogs: { create: mapDraftExercisesToWorkout(existing.exercises) },
        },
        include: { exerciseLogs: { include: { setLogs: true, cardioLogs: true } } },
      });

      const updatedDraft = await tx.workoutSessionDraft.update({
        where: { id: existing.id },
        data: {
          status: 'finished',
          isFinished: true,
          finishedAt,
          lastSavedAt: finishedAt,
          revision: { increment: 1 },
        },
      });

      await tx.user.update({
        where: { id: req.userId },
        data: { totalWorkouts: { increment: 1 } },
      });

      return { workout: createdWorkout, draft: updatedDraft };
    });

    res.status(201).json({
      session: formatDraft(result.draft),
      workout: formatWorkoutForApp(result.workout),
    });
  } catch (err) {
    console.error('[WORKOUT_SESSIONS] POST /draft/:id/complete - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

router.delete('/draft/:id', async (req, res) => {
  try {
    const existing = await prisma.workoutSessionDraft.findFirst({
      where: { id: req.params.id, userId: req.userId, status: { in: ['draft', 'active'] }, isFinished: false },
    });
    if (!existing) return res.status(404).json({ error: 'not_found', message: 'Séance en cours introuvable' });

    const draft = await prisma.workoutSessionDraft.update({
      where: { id: req.params.id },
      data: {
        status: 'abandoned',
        isFinished: false,
        finishedAt: new Date(),
        lastSavedAt: new Date(),
        revision: { increment: 1 },
      },
    });

    res.json(formatDraft(draft));
  } catch (err) {
    console.error('[WORKOUT_SESSIONS] DELETE /draft/:id - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
