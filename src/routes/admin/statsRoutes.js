const router = require('express').Router();
const requireAdmin = require('../../middleware/requireAdmin');
const prisma = require('../../lib/prisma');

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Important: this route intentionally runs queries sequentially to prevent
    // pool exhaustion on deployments configured with a low connection limit.
    const totalUsers = await prisma.user.count();
    const newUsersWeek = await prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } });
    const newUsersMonth = await prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } });
    const totalWorkouts = await prisma.workout.count();
    const workoutsWeek = await prisma.workout.count({ where: { createdAt: { gte: sevenDaysAgo } } });
    const totalRuns = await prisma.runningSession.count();
    const totalDistanceAgg = await prisma.runningSession.aggregate({ _sum: { distanceKm: true } });
    const totalStepsAgg = await prisma.dailySteps.aggregate({ _sum: { steps: true } });
    const badgeCount = await prisma.userBadge.count();
    const friendshipCount = await prisma.friendship.count({ where: { status: 'accepted' } });
    const conversationCount = await prisma.conversation.count();
    const workoutsByType = await prisma.workout.groupBy({ by: ['workoutType'], _count: { _all: true } });
    const topExercisesRaw = await prisma.exerciseLog.groupBy({
      by: ['exerciseName'],
      _count: { _all: true },
      orderBy: { _count: { exerciseName: 'desc' } },
      take: 5,
    });
    // Inscriptions des 7 derniers jours
    const usersByDay = await prisma.user.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Calcul répartition types séances
    const typeMap = { strength: 0, cardio: 0, mixed: 0 };
    for (const row of workoutsByType) {
      if (typeMap[row.workoutType] !== undefined) typeMap[row.workoutType] = row._count._all;
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

    const chartData = {
      inscriptions: {
        labels: inscriptionsByDay.map(d => d.date.slice(5)),
        values: inscriptionsByDay.map(d => d.count),
      },
      workoutTypes: {
        labels: ['Strength', 'Cardio', 'Mixed'],
        values: [typeMap.strength, typeMap.cardio, typeMap.mixed],
      },
      topExercises: {
        labels: topExercisesRaw.map(e => e.exerciseName),
        values: topExercisesRaw.map(e => e._count._all),
      },
    };

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
      chartData,
      admin: req.session.adminUsername,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

module.exports = router;
