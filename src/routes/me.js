const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');

router.use(requireAuth);

// PATCH /me/notification-settings
router.patch('/notification-settings', async (req, res) => {
  const parsed = z.object({
    messages: z.boolean().optional(),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }

  const settings = await prisma.userSettings.upsert({
    where: { userId: req.userId },
    update: {
      ...(parsed.data.messages !== undefined ? { notifMessages: parsed.data.messages } : {}),
    },
    create: {
      userId: req.userId,
      notifMessages: parsed.data.messages ?? true,
    },
  });

  res.json({ messages: settings.notifMessages });
});

module.exports = router;
