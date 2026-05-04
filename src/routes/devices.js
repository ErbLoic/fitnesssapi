const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');

router.use(requireAuth);

const pushTokenSchema = z.object({
  token: z.string().trim().min(1),
  platform: z.enum(['android', 'ios', 'web']),
  deviceId: z.string().trim().min(1).max(200).nullable().optional(),
  appVersion: z.string().trim().min(1).max(80).nullable().optional(),
});

// POST /devices/push-token
router.post('/push-token', async (req, res) => {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }

  const data = parsed.data;
  await prisma.pushToken.upsert({
    where: { token: data.token },
    update: {
      userId: req.userId,
      platform: data.platform,
      deviceId: data.deviceId ?? null,
      appVersion: data.appVersion ?? null,
      enabled: true,
      lastSeenAt: new Date(),
    },
    create: {
      userId: req.userId,
      token: data.token,
      platform: data.platform,
      deviceId: data.deviceId ?? null,
      appVersion: data.appVersion ?? null,
      enabled: true,
      lastSeenAt: new Date(),
    },
  });

  res.json({ success: true });
});

// DELETE /devices/push-token
router.delete('/push-token', async (req, res) => {
  const parsed = z.object({ token: z.string().trim().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }

  await prisma.pushToken.updateMany({
    where: { userId: req.userId, token: parsed.data.token },
    data: { enabled: false },
  });

  res.json({ success: true });
});

module.exports = router;
