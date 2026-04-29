const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');

router.use(requireAuth);

const programInclude = {
  days: {
    orderBy: { position: 'asc' },
    include: {
      exercises: { orderBy: { position: 'asc' } },
    },
  },
};

const programExerciseSchema = z.object({
  exerciseId: z.string().trim().min(1).nullable().optional(),
  customExerciseName: z.string().trim().min(1).nullable().optional(),
  position: z.number().int().default(0),
  targetSets: z.number().int().positive().nullable().optional(),
  targetReps: z.string().trim().max(50).nullable().optional(),
  targetWeight: z.number().nullable().optional(),
  restSeconds: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
}).refine(
  (value) => value.exerciseId || value.customExerciseName,
  { message: 'exerciseId ou customExerciseName est requis' },
);

const programDaySchema = z.object({
  name: z.string().trim().min(1, 'Le nom du jour est requis'),
  position: z.number().int().default(0),
  exercises: z.array(programExerciseSchema).default([]),
});

const programSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du programme est requis'),
  description: z.string().nullable().optional(),
  level: z.string().trim().max(30).nullable().optional(),
  goal: z.string().trim().max(50).nullable().optional(),
  isPublic: z.boolean().default(false),
  days: z.array(programDaySchema).default([]),
});

function validationError(res, parsed) {
  const first = parsed.error.errors[0];
  return res.status(400).json({
    error: 'validation_error',
    message: first.message,
    fields: first.path.length ? { [first.path.join('.')]: first.code } : undefined,
  });
}

function programDataFromBody(body) {
  return {
    name: body.name,
    description: body.description ?? null,
    level: body.level ?? null,
    goal: body.goal ?? null,
    isPublic: body.isPublic,
    days: {
      create: body.days.map((day) => ({
        name: day.name,
        position: day.position,
        exercises: {
          create: day.exercises.map((exercise) => ({
            exerciseId: exercise.exerciseId ?? null,
            customExerciseName: exercise.customExerciseName ?? null,
            position: exercise.position,
            targetSets: exercise.targetSets ?? null,
            targetReps: exercise.targetReps ?? null,
            targetWeight: exercise.targetWeight ?? null,
            restSeconds: exercise.restSeconds ?? null,
            notes: exercise.notes ?? null,
          })),
        },
      })),
    },
  };
}

async function findOwnedProgram(id, userId) {
  return prisma.customProgram.findFirst({
    where: { id, userId, deletedAt: null },
    include: programInclude,
  });
}

router.get('/custom', async (req, res) => {
  try {
    const programs = await prisma.customProgram.findMany({
      where: { userId: req.userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: programInclude,
    });
    res.json({ data: programs });
  } catch (err) {
    console.error('[PROGRAMS] GET /custom - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

router.post('/custom', async (req, res) => {
  try {
    const parsed = programSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);

    const program = await prisma.customProgram.create({
      data: {
        ...programDataFromBody(parsed.data),
        userId: req.userId,
      },
      include: programInclude,
    });

    res.status(201).json(program);
  } catch (err) {
    console.error('[PROGRAMS] POST /custom - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

router.get('/custom/:id', async (req, res) => {
  try {
    const program = await findOwnedProgram(req.params.id, req.userId);
    if (!program) return res.status(404).json({ error: 'not_found', message: 'Programme introuvable' });
    res.json(program);
  } catch (err) {
    console.error('[PROGRAMS] GET /custom/:id - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

router.put('/custom/:id', async (req, res) => {
  try {
    const parsed = programSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed);

    const existing = await prisma.customProgram.findFirst({
      where: { id: req.params.id, userId: req.userId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'not_found', message: 'Programme introuvable' });

    const program = await prisma.$transaction(async (tx) => {
      await tx.customProgramDay.deleteMany({ where: { programId: req.params.id } });
      return tx.customProgram.update({
        where: { id: req.params.id },
        data: programDataFromBody(parsed.data),
        include: programInclude,
      });
    });

    res.json(program);
  } catch (err) {
    console.error('[PROGRAMS] PUT /custom/:id - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

router.delete('/custom/:id', async (req, res) => {
  try {
    const existing = await prisma.customProgram.findFirst({
      where: { id: req.params.id, userId: req.userId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'not_found', message: 'Programme introuvable' });

    const program = await prisma.customProgram.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json({ message: 'Programme archive', id: program.id, deletedAt: program.deletedAt });
  } catch (err) {
    console.error('[PROGRAMS] DELETE /custom/:id - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

router.post('/custom/:id/duplicate', async (req, res) => {
  try {
    const existing = await findOwnedProgram(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'not_found', message: 'Programme introuvable' });

    const program = await prisma.customProgram.create({
      data: {
        userId: req.userId,
        name: req.body?.name || `${existing.name} copie`,
        description: existing.description,
        level: existing.level,
        goal: existing.goal,
        isPublic: false,
        days: {
          create: existing.days.map((day) => ({
            name: day.name,
            position: day.position,
            exercises: {
              create: day.exercises.map((exercise) => ({
                exerciseId: exercise.exerciseId,
                customExerciseName: exercise.customExerciseName,
                position: exercise.position,
                targetSets: exercise.targetSets,
                targetReps: exercise.targetReps,
                targetWeight: exercise.targetWeight,
                restSeconds: exercise.restSeconds,
                notes: exercise.notes,
              })),
            },
          })),
        },
      },
      include: programInclude,
    });

    res.status(201).json(program);
  } catch (err) {
    console.error('[PROGRAMS] POST /custom/:id/duplicate - ERROR:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
