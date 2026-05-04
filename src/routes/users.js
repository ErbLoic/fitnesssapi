const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');
const { deactivateAccount } = require('../lib/accountDeletion');
const {
  ALLOWED_CONTENT_TYPES,
  assertObjectKey,
  buildPublicUrl,
  createPresignedProfileUpload,
  deleteObject,
  extractObjectKey,
  hasR2Config,
} = require('../lib/cloudflareR2');

router.use(requireAuth);

const directUploadSchema = z.object({
  contentType: z.enum([...ALLOWED_CONTENT_TYPES.keys()]).default('image/jpeg').optional(),
  expiresInMinutes: z.number().int().min(1).max(60).default(15).optional(),
});

const profileImageConfirmSchema = z.object({
  objectKey: z.string().trim().min(1),
});

function formatMe(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    age: user.age,
    heightCm: user.heightCm,
    weightKg: user.weightKg,
    gender: user.gender,
    fitnessLevel: user.fitnessLevel,
    profileImageUrl: user.profileImageUrl,
    dailyStepsGoal: user.dailyStepsGoal,
    dailyCaloriesGoal: user.dailyCaloriesGoal,
    weeklyWorkoutsGoal: user.weeklyWorkoutsGoal,
    totalWorkouts: user.totalWorkouts,
    currentStreak: user.currentStreak,
    bestStreak: user.bestStreak,
    onboardingComplete: user.onboardingComplete,
    createdAt: user.createdAt,
  };
}

function handleCloudflareError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    error: err.code || 'INTERNAL_ERROR',
    message: status >= 500 ? 'Service image temporairement indisponible' : err.message,
  });
}

function assertUserOwnsObjectKey(userId, objectKey) {
  if (!objectKey.startsWith(`profile-images/${userId}/`)) {
    const error = new Error('objectKey invalide pour cet utilisateur');
    error.statusCode = 403;
    error.code = 'forbidden';
    throw error;
  }
}

// GET /users/search?q=
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Le terme de recherche doit faire au moins 2 caracteres' });
  }
  const users = await prisma.user.findMany({
    where: {
      id: { not: req.userId },
      isDisabled: false,
      isSystem: false,
      name: { contains: q, mode: 'insensitive' },
    },
    select: { id: true, name: true, fitnessLevel: true, profileImageUrl: true },
    take: 20,
  });
  res.json(users);
});

// GET /users/me
router.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' });

  res.json(formatMe(user));
});

// PATCH /users/me
router.patch('/me', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    age: z.number().int().positive().optional(),
    heightCm: z.number().positive().optional(),
    weightKg: z.number().positive().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    fitnessLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    onboardingComplete: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const user = await prisma.user.update({ where: { id: req.userId }, data: parsed.data });
  res.json({ id: user.id, name: user.name, email: user.email });
});

// POST /users/me/profile-image/upload-url
router.post('/me/profile-image/upload-url', async (req, res) => {
  try {
    const parsed = directUploadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
    }

    if (!hasR2Config()) {
      return res.status(503).json({
        error: 'r2_not_configured',
        message: 'Stockage des photos de profil non configure',
      });
    }

    const contentType = parsed.data.contentType || 'image/jpeg';
    const expiresInMinutes = parsed.data.expiresInMinutes || 15;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const upload = createPresignedProfileUpload({
      userId: req.userId,
      contentType,
      expiresInSeconds: expiresInMinutes * 60,
    });

    res.status(201).json({
      objectKey: upload.objectKey,
      uploadURL: upload.uploadURL,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt,
      publicUrl: upload.publicUrl,
    });
  } catch (err) {
    console.error('[USERS] POST /me/profile-image/upload-url - ERROR:', err.message);
    return handleCloudflareError(res, err);
  }
});

// POST /users/me/profile-image/confirm
router.post('/me/profile-image/confirm', async (req, res) => {
  try {
    const parsed = profileImageConfirmSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
    }

    assertObjectKey(parsed.data.objectKey);
    assertUserOwnsObjectKey(req.userId, parsed.data.objectKey);
    const profileImageUrl = buildPublicUrl(parsed.data.objectKey);
    if (!profileImageUrl) {
      return res.status(503).json({
        error: 'r2_not_configured',
        message: 'Stockage des photos de profil non configure',
      });
    }

    const existing = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { profileImageUrl: true },
    });

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { profileImageUrl },
    });

    const previousObjectKey = extractObjectKey(existing?.profileImageUrl);
    if (previousObjectKey && previousObjectKey !== parsed.data.objectKey) {
      deleteObject(previousObjectKey).catch((err) => {
        console.warn('[USERS] Ancienne photo de profil non supprimee:', err.message);
      });
    }

    res.json(formatMe(user));
  } catch (err) {
    console.error('[USERS] POST /me/profile-image/confirm - ERROR:', err.message);
    return handleCloudflareError(res, err);
  }
});

// DELETE /users/me/profile-image
router.delete('/me/profile-image', async (req, res) => {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { profileImageUrl: true },
    });

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { profileImageUrl: null },
    });

    const objectKey = extractObjectKey(existing?.profileImageUrl);
    if (objectKey) {
      deleteObject(objectKey).catch((err) => {
        console.warn('[USERS] Photo de profil non supprimee de Cloudflare:', err.message);
      });
    }

    res.json(formatMe(user));
  } catch (err) {
    console.error('[USERS] DELETE /me/profile-image - ERROR:', err.message);
    return handleCloudflareError(res, err);
  }
});

// PATCH /users/me/goals
router.patch('/me/goals', async (req, res) => {
  const schema = z.object({
    dailyStepsGoal: z.number().int().positive().optional(),
    dailyCaloriesGoal: z.number().positive().optional(),
    weeklyWorkoutsGoal: z.number().int().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const user = await prisma.user.update({ where: { id: req.userId }, data: parsed.data });
  res.json({ dailyStepsGoal: user.dailyStepsGoal, dailyCaloriesGoal: user.dailyCaloriesGoal, weeklyWorkoutsGoal: user.weeklyWorkoutsGoal });
});

// DELETE /users/me
router.delete('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, isDisabled: true, isSystem: true },
  });
  if (!user || user.isDisabled || user.isSystem) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' });
  }

  const deactivated = await deactivateAccount(prisma, req.userId);
  res.json({
    message: 'Compte desactive. Suppression definitive planifiee dans 2 ans.',
    deactivatedAt: deactivated.deactivatedAt,
    scheduledDeletionAt: deactivated.scheduledDeletionAt,
  });
});

module.exports = router;
