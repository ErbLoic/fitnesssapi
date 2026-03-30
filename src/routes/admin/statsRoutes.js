const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAdmin = require('../../middleware/requireAdmin');

const prisma = new PrismaClient();

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, newUsersWeek, newUsersMonth,
      totalWorkouts, workoutsWeek,
      totalRuns, totalDistanceAgg,
      totalStepsAgg, badgeCount,
      friendshipCount, conversationCount,
      workoutsByType, topExercisesRaw,
      usersByDay,
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
      prisma.friendship.count({ where: { status: 'accepted' } }),
      prisma.conversation.count(),
      prisma.workout.groupBy({ by: ['type'], _count: { _all: true } }),
      prisma.exerciseLog.groupBy({
        by: ['exerciseName'],
        _count: { _all: true },
        orderBy: { _count: { exerciseName: 'desc' } },
        take: 5,
      }),
      // Inscriptions des 7 derniers jours
      prisma.user.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Calcul répartition types séances
    const typeMap = { strength: 0, cardio: 0, mixed: 0 };
    for (const row of workoutsByType) {
      if (typeMap[row.type] !== undefined) typeMap[row.type] = row._count._all;
    }
    const typeTotal = Object.values(typeMap).reduce((a, b) => a + b, 0);
    const typePercent = {
      strength: typeTotal ? Math.round(typeMap.strength / typeTotal * 100) : 0,
      cardio: typeTotal ? Math.round(typeMap.cardio / typeTotal * 100) : 0,
      mixed: typeTotal ? Math.round(typeMap.mixed / typeTotal * 100) : 0,
    };

    // Inscriptions par jour (7 derniers jours)
    const inscriptionsByDay = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const count = usersByDay.filter(u => u.createdAt.toISOString().slice(0, 10) === key).length;
      inscriptionsByDay.push({ date: key, count });
    }
    const maxInscriptions = Math.max(...inscriptionsByDay.map(d => d.count), 1);

    res.render('admin/stats', {
      stats: {
        totalUsers, newUsersWeek, newUsersMonth,
        totalWorkouts, workoutsWeek, totalRuns,
        totalDistanceKm: (totalDistanceAgg._sum.distanceKm || 0).toFixed(1),
        totalSteps: totalStepsAgg._sum.steps || 0,
        badgeCount, friendshipCount, conversationCount,
      },
      typePercent,
      topExercises: topExercisesRaw.map(e => ({ name: e.exerciseName, count: e._count._all })),
      inscriptionsByDay,
      maxInscriptions,
      admin: req.session.adminUsername,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

module.exports = router;
