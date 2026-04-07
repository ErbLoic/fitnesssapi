const router = require('express').Router();
const requireAdmin = require('../../middleware/requireAdmin');
const prisma = require('../../lib/prisma');

// GET /admin (dashboard)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [
      userCount, workoutCount, runCount, stepsAgg,
      badgeCount, friendshipCount, conversationCount,
      recentUsers, recentLogs, topUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.workout.count(),
      prisma.runningSession.count(),
      prisma.dailySteps.aggregate({ _sum: { steps: true } }),
      prisma.userBadge.count(),
      prisma.friendship.count({ where: { status: 'accepted' } }),
      prisma.conversation.count(),
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, createdAt: true, isBanned: true },
      }),
      prisma.auditLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.findMany({
        take: 5,
        orderBy: { totalWorkouts: 'desc' },
        select: { id: true, name: true, totalWorkouts: true },
      }),
    ]);

    const versions = await prisma.appVersion.findMany({ orderBy: { platform: 'asc' } });

    res.render('admin/dashboard', {
      stats: {
        users: userCount,
        workouts: workoutCount,
        runs: runCount,
        totalSteps: stepsAgg._sum.steps || 0,
        badges: badgeCount,
        friendships: friendshipCount,
        conversations: conversationCount,
      },
      versions,
      recentUsers,
      recentLogs,
      topUsers,
      admin: req.session.adminUsername,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// GET /admin/users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const search = req.query.q || '';

    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip, take: limit,
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
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// GET /admin/users/:id
router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const [user, recentWorkouts, recentRuns, friendCount, convoCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          oauthProviders: true,
          userBadges: true,
          _count: { select: { workouts: true, runningSessions: true } },
        },
      }),
      prisma.workout.findMany({
        where: { userId },
        take: 5,
        orderBy: { startTime: 'desc' },
        select: { id: true, name: true, workoutType: true, durationMinutes: true, startTime: true },
      }),
      prisma.runningSession.findMany({
        where: { userId },
        take: 5,
        orderBy: { startTime: 'desc' },
        select: { id: true, distanceKm: true, durationSeconds: true, startTime: true },
      }),
      prisma.friendship.count({
        where: { OR: [{ requesterId: userId }, { receiverId: userId }], status: 'accepted' },
      }),
      prisma.conversationParticipant.count({ where: { userId } }),
    ]);

    if (!user) return res.redirect('/admin/users');
    res.render('admin/user-detail', {
      user, recentWorkouts, recentRuns, friendCount, convoCount,
      admin: req.session.adminUsername,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/users/:id/ban
router.post('/users/:id/ban', requireAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.redirect('/admin/users');
    await prisma.user.update({ where: { id: req.params.id }, data: { isBanned: !user.isBanned } });
    await prisma.auditLog.create({
      data: { action: user.isBanned ? 'UNBAN_USER' : 'BAN_USER', targetType: 'user', targetId: user.id },
    });
    res.redirect(`/admin/users/${req.params.id}`);
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// GET /admin/users/:id/add-workout (page de création complète)
router.get('/users/:id/add-workout', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.redirect('/admin/users');
    
    res.render('admin/add-workout', {
      user,
      admin: req.session.adminUsername,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/users/:id/add-workout (créer la séance avec toutes les données)
router.post('/users/:id/add-workout', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.redirect('/admin/users');

    const { name, workoutType, startTime, endTime, durationMinutes, caloriesBurned, notes, exercises } = req.body;

    // Validation
    if (!name || !workoutType) {
      return res.status(400).render('admin/error', {
        message: 'Le nom et le type de séance sont requis',
        admin: req.session.adminUsername,
      });
    }

    // Parser les dates si c'est des strings
    let start = startTime ? new Date(startTime) : new Date();
    let end = endTime ? new Date(endTime) : new Date(start.getTime() + (parseInt(durationMinutes) || 0) * 60000);

    // Vérifier que les dates sont valides
    if (isNaN(start.getTime())) start = new Date();
    if (isNaN(end.getTime())) end = new Date(start.getTime() + (parseInt(durationMinutes) || 0) * 60000);

    // Parser les exercices s'ils sont en JSON string
    let exercisesData = [];
    if (exercises) {
      try {
        exercisesData = typeof exercises === 'string' ? JSON.parse(exercises) : exercises;
        if (!Array.isArray(exercisesData)) exercisesData = [];
      } catch (e) {
        console.error('Erreur parsing exercises:', e);
        exercisesData = [];
      }
    }

    // Créer la séance
    const workout = await prisma.workout.create({
      data: {
        userId,
        name,
        workoutType,
        startTime: start,
        endTime: end,
        durationMinutes: parseInt(durationMinutes) || 0,
        caloriesBurned: parseFloat(caloriesBurned) || 0,
        notes: notes || null,
        exerciseLogs: exercisesData.length > 0 ? {
          create: exercisesData.map(ex => ({
            exerciseId: ex.exerciseId || '',
            exerciseName: ex.exerciseName || '',
            exerciseType: ex.exerciseType || 'strength',
            notes: ex.notes || null,
            sortOrder: ex.sortOrder || 0,
            setLogs: (ex.sets && Array.isArray(ex.sets)) ? {
              create: ex.sets.map(set => ({
                setNumber: set.setNumber || 0,
                reps: set.reps || 0,
                weightKg: set.weightKg || 0,
                isCompleted: set.isCompleted !== false,
                restTimeSec: set.restTimeSec || null,
                setType: set.setType || 'normal',
              }))
            } : undefined,
            cardioLogs: (ex.cardio) ? {
              create: {
                durationMinutes: ex.cardio.durationMinutes || 0,
                distanceKm: ex.cardio.distanceKm || 0,
                avgSpeedKmh: ex.cardio.avgSpeedKmh || 0,
                maxSpeedKmh: ex.cardio.maxSpeedKmh || 0,
              }
            } : undefined,
          }))
        } : undefined,
      },
      include: {
        exerciseLogs: { include: { setLogs: true, cardioLogs: true } }
      }
    });

    // Incrémenter le compteur de workouts
    await prisma.user.update({
      where: { id: userId },
      data: { totalWorkouts: { increment: 1 } }
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: 'CREATE_WORKOUT',
        targetType: 'workout',
        targetId: workout.id,
        payload: {
          userId,
          name,
          workoutType,
          exerciseCount: exercisesData.length,
        },
      },
    });

    res.redirect(`/admin/users/${userId}`);
  } catch (err) {
    console.error('Erreur création workout:', err);
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/users/:id/delete
router.post('/users/:id/delete', requireAdmin, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    await prisma.auditLog.create({
      data: { action: 'DELETE_USER', targetType: 'user', targetId: req.params.id },
    });
    res.redirect('/admin/users');
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/workouts/:id/delete (modération)
router.post('/workouts/:id/delete', requireAdmin, async (req, res) => {
  try {
    const workout = await prisma.workout.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    if (!workout) return res.redirect('/admin/users');
    await prisma.workout.delete({ where: { id: req.params.id } });
    await prisma.auditLog.create({
      data: { action: 'DELETE_WORKOUT', targetType: 'workout', targetId: req.params.id, payload: { userId: workout.userId } },
    });
    res.redirect(`/admin/users/${workout.userId}`);
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/running/:id/delete (modération)
router.post('/running/:id/delete', requireAdmin, async (req, res) => {
  try {
    const run = await prisma.runningSession.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    if (!run) return res.redirect('/admin/users');
    await prisma.runningSession.delete({ where: { id: req.params.id } });
    await prisma.auditLog.create({
      data: { action: 'DELETE_RUN', targetType: 'running', targetId: req.params.id, payload: { userId: run.userId } },
    });
    res.redirect(`/admin/users/${run.userId}`);
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

module.exports = router;
