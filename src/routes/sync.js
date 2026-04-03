const router = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const { formatRunningForApp } = require('../lib/transformers');
const { formatWorkoutForApp } = require('../lib/transformers');
const { formatStepsForApp } = require('../lib/transformers');
const prisma = require('../lib/prisma');
router.use(requireAuth);

/**
 * GET /sync/all
 * 🔄 Synchronisation complète pour nouveau téléphone
 * Retourne TOUTES les données d'un utilisateur en une seule requête
 */
router.get('/all', async (req, res) => {
  try {
    console.log(`[SYNC] GET /all - User: ${req.userId}, IP: ${req.ip}`);
    
    // Récupérer TOUTES les données en parallèle
    const [user, workouts, running, steps, badges, friends] = await Promise.all([
      // Profil utilisateur
      prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          name: true,
          email: true,
          age: true,
          heightCm: true,
          weightKg: true,
          gender: true,
          fitnessLevel: true,
          profileImageUrl: true,
          dailyStepsGoal: true,
          dailyCaloriesGoal: true,
          weeklyWorkoutsGoal: true,
          totalWorkouts: true,
          currentStreak: true,
          bestStreak: true,
          onboardingComplete: true,
          createdAt: true,
        },
      }),

      // TOUTES les séances (sans pagination)
      prisma.workout.findMany({
        where: { userId: req.userId },
        orderBy: { startTime: 'desc' },
        include: {
          exerciseLogs: {
            include: { setLogs: true, cardioLogs: true },
          },
        },
      }),

      // TOUTES les courses (sans pagination)
      prisma.runningSession.findMany({
        where: { userId: req.userId },
        orderBy: { startTime: 'desc' },
        include: { gpsPoints: { orderBy: { sortOrder: 'asc' } } },
      }),

      // TOUTES les entrées de pas (sans pagination)
      prisma.dailySteps.findMany({
        where: { userId: req.userId },
        orderBy: { date: 'desc' },
        include: { hourlySteps: { orderBy: { hour: 'asc' } } },
      }),

      // Badges débloqués
      prisma.userBadge.findMany({
        where: { userId: req.userId },
        orderBy: { unlockedAt: 'asc' },
      }),

      // Amis acceptés
      prisma.friendship.findMany({
        where: {
          status: 'accepted',
          OR: [
            { requesterId: req.userId },
            { receiverId: req.userId },
          ],
        },
        include: {
          requester: {
            select: { id: true, name: true, fitnessLevel: true, profileImageUrl: true },
          },
          receiver: {
            select: { id: true, name: true, fitnessLevel: true, profileImageUrl: true },
          },
        },
      }),
    ]);

    // Formater les données
    const workoutsFormatted = workouts.map(w => formatWorkoutForApp(w));
    const runningFormatted = running.map(r => formatRunningForApp(r));
    const stepsFormatted = steps.map(s => formatStepsForApp(s));

    const friendsFormatted = friends.map(f => ({
      friendshipId: f.id,
      since: f.createdAt,
      user: f.requesterId === req.userId ? f.receiver : f.requester,
    }));

    const badgesFormatted = {
      unlocked: badges.map(b => b.badgeId),
      unlockedAt: badges.reduce((acc, b) => {
        acc[b.badgeId] = b.unlockedAt;
        return acc;
      }, {}),
    };

    console.log(`[SYNC] GET /all - SUCCESS: ${workouts.length} workouts, ${running.length} running, ${steps.length} steps, ${badges.length} badges`);

    res.json({
      user,
      workouts: workoutsFormatted,
      running: runningFormatted,
      steps: stepsFormatted,
      badges: badgesFormatted,
      friends: friendsFormatted,
      syncedAt: new Date().toISOString(),
      totalItems: {
        workouts: workouts.length,
        running: running.length,
        steps: steps.length,
        badges: badges.length,
        friends: friends.length,
      },
    });
  } catch (err) {
    console.error(`[SYNC] GET /all - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * GET /sync/since/:timestamp
 * 🔄 Synchronisation incrémdale depuis une date
 * Pour synchroniser uniquement les nouvelles données
 */
router.get('/since/:timestamp', async (req, res) => {
  try {
    const since = new Date(parseInt(req.params.timestamp));
    if (isNaN(since.getTime())) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Timestamp invalide' });
    }

    console.log(`[SYNC] GET /since/:timestamp - User: ${req.userId}, Since: ${since.toISOString()}`);

    // Récupérer uniquement les données modifiées après la date
    const [workouts, running, steps, badges] = await Promise.all([
      prisma.workout.findMany({
        where: {
          userId: req.userId,
          createdAt: { gt: since },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          exerciseLogs: {
            include: { setLogs: true, cardioLogs: true },
          },
        },
      }),

      prisma.runningSession.findMany({
        where: {
          userId: req.userId,
          createdAt: { gt: since },
        },
        orderBy: { createdAt: 'desc' },
        include: { gpsPoints: { orderBy: { sortOrder: 'asc' } } },
      }),

      prisma.dailySteps.findMany({
        where: {
          userId: req.userId,
          updatedAt: { gt: since },
        },
        orderBy: { date: 'desc' },
        include: { hourlySteps: { orderBy: { hour: 'asc' } } },
      }),

      prisma.userBadge.findMany({
        where: {
          userId: req.userId,
          unlockedAt: { gt: since },
        },
      }),
    ]);

    const workoutsFormatted = workouts.map(w => formatWorkoutForApp(w));
    const runningFormatted = running.map(r => formatRunningForApp(r));
    const stepsFormatted = steps.map(s => formatStepsForApp(s));

    console.log(`[SYNC] GET /since/:timestamp - SUCCESS: ${workouts.length} new workouts, ${running.length} new running`);

    res.json({
      since,
      workouts: workoutsFormatted,
      running: runningFormatted,
      steps: stepsFormatted,
      badges: badges.map(b => ({ badgeId: b.badgeId, unlockedAt: b.unlockedAt })),
      syncedAt: new Date().toISOString(),
      totalNewItems: {
        workouts: workouts.length,
        running: running.length,
        steps: steps.length,
        badges: badges.length,
      },
    });
  } catch (err) {
    console.error(`[SYNC] GET /since/:timestamp - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * GET /sync/status
 * 📊 Infos de synchronisation pour afficher un résumé
 */
router.get('/status', async (req, res) => {
  try {
    console.log(`[SYNC] GET /status - User: ${req.userId}`);

    const [workoutCount, runningCount, stepsCount, badgeCount] = await Promise.all([
      prisma.workout.count({ where: { userId: req.userId } }),
      prisma.runningSession.count({ where: { userId: req.userId } }),
      prisma.dailySteps.count({ where: { userId: req.userId } }),
      prisma.userBadge.count({ where: { userId: req.userId } }),
    ]);

    const lastWorkout = await prisma.workout.findFirst({
      where: { userId: req.userId },
      orderBy: { startTime: 'desc' },
      select: { startTime: true },
    });

    const lastRunning = await prisma.runningSession.findFirst({
      where: { userId: req.userId },
      orderBy: { startTime: 'desc' },
      select: { startTime: true },
    });

    const lastSteps = await prisma.dailySteps.findFirst({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    console.log(`[SYNC] GET /status - SUCCESS`);

    res.json({
      status: 'synchronized',
      totalData: {
        workouts: workoutCount,
        running: runningCount,
        steps: stepsCount,
        badges: badgeCount,
      },
      lastUpdated: {
        workout: lastWorkout?.startTime || null,
        running: lastRunning?.startTime || null,
        steps: lastSteps?.date || null,
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[SYNC] GET /status - ERROR:`, err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

module.exports = router;
