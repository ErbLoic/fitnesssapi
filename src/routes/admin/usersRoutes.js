const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAdmin = require('../../middleware/requireAdmin');

const prisma = new PrismaClient();

// GET /admin (dashboard)
router.get('/', requireAdmin, async (req, res) => {
  const [userCount, workoutCount, runCount, stepsAgg] = await Promise.all([
    prisma.user.count(),
    prisma.workout.count(),
    prisma.runningSession.count(),
    prisma.dailySteps.aggregate({ _sum: { steps: true } }),
  ]);
  const versions = await prisma.appVersion.findMany({ orderBy: { platform: 'asc' } });
  res.render('admin/dashboard', {
    stats: {
      users: userCount,
      workouts: workoutCount,
      runs: runCount,
      totalSteps: stepsAgg._sum.steps || 0,
    },
    versions,
    admin: req.session.adminUsername,
  });
});

// GET /admin/users
router.get('/users', requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const skip = (page - 1) * limit;
  const search = req.query.q || '';

  const where = search
    ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip, take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { workouts: true } },
        oauthProviders: { select: { provider: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.render('admin/users', {
    users, total, page, limit, search,
    totalPages: Math.ceil(total / limit),
    admin: req.session.adminUsername,
  });
});

// GET /admin/users/:id
router.get('/users/:id', requireAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      oauthProviders: true,
      userBadges: true,
      _count: { select: { workouts: true, runningSessions: true } },
    },
  });
  if (!user) return res.redirect('/admin/users');
  res.render('admin/user-detail', { user, admin: req.session.adminUsername });
});

// PATCH /admin/users/:id/ban
router.post('/users/:id/ban', requireAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.redirect('/admin/users');

  await prisma.user.update({ where: { id: req.params.id }, data: { isBanned: !user.isBanned } });
  await prisma.auditLog.create({
    data: { action: user.isBanned ? 'UNBAN_USER' : 'BAN_USER', targetType: 'user', targetId: user.id },
  });
  res.redirect(`/admin/users/${req.params.id}`);
});

// POST /admin/users/:id/delete
router.post('/users/:id/delete', requireAdmin, async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } });
  await prisma.auditLog.create({
    data: { action: 'DELETE_USER', targetType: 'user', targetId: req.params.id },
  });
  res.redirect('/admin/users');
});

module.exports = router;
