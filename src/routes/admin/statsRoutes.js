const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAdmin = require('../../middleware/requireAdmin');

const prisma = new PrismaClient();

// GET /admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers, newUsersWeek, newUsersMonth,
    totalWorkouts, workoutsWeek,
    totalRuns, totalDistanceAgg,
    totalStepsAgg, badgeCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.workout.count(),
    prisma.workout.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.runningSession.count(),
    prisma.runningSession.aggregate({ _sum: { distanceKm: true } }),
    prisma.dailySteps.aggregate({ _sum: { steps: true } }),
    prisma.userBadge.count(),
  ]);

  res.render('admin/stats', {
    stats: {
      totalUsers, newUsersWeek, newUsersMonth,
      totalWorkouts, workoutsWeek,
      totalRuns,
      totalDistanceKm: (totalDistanceAgg._sum.distanceKm || 0).toFixed(1),
      totalSteps: totalStepsAgg._sum.steps || 0,
      badgeCount,
    },
    admin: req.session.adminUsername,
  });
});

module.exports = router;
