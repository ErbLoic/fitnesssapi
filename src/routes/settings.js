const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');
router.use(requireAuth);

// GET /settings
router.get('/', async (req, res) => {
  let settings = await prisma.userSettings.findUnique({ where: { userId: req.userId } });
  if (!settings) {
    settings = await prisma.userSettings.create({ data: { userId: req.userId } });
  }
  res.json(settings);
});

// PATCH /settings
router.patch('/', async (req, res) => {
  const schema = z.object({
    notifWorkoutReminders: z.boolean().optional(),
    notifReminderHour: z.number().int().min(0).max(23).optional(),
    notifReminderMinute: z.number().int().min(0).max(59).optional(),
    notifStepGoalAlerts: z.boolean().optional(),
    notifWeeklyProgress: z.boolean().optional(),
    notifMotivationalQuotes: z.boolean().optional(),
    themeDark: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const settings = await prisma.userSettings.upsert({
    where: { userId: req.userId },
    update: parsed.data,
    create: { userId: req.userId, ...parsed.data },
  });
  res.json(settings);
});

module.exports = router;
