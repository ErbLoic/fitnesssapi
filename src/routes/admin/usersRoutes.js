const router = require('express').Router();
const requireAdmin = require('../../middleware/requireAdmin');
const { requireAdminFull } = require('../../middleware/requireAdmin');
const prisma = require('../../lib/prisma');
const { formatWorkoutForApp, formatRunningForApp } = require('../../lib/transformers');
const { deactivateAccount } = require('../../lib/accountDeletion');

function maskEmail(email) {
  if (!email) return null;
  const [name, domain] = String(email).split('@');
  if (!domain) return 'masque';
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskUserForVisitor(user) {
  if (!user) return user;
  return { ...user, email: maskEmail(user.email) };
}

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
        select: { id: true, name: true, email: true, createdAt: true, isBanned: true, isDisabled: true },
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

    res.render(req.adminRole === 'admin' ? 'admin/dashboard' : 'admin/visitor-home', {
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
      recentUsers: req.adminRole === 'admin' ? recentUsers : recentUsers.map(maskUserForVisitor),
      recentLogs: req.adminRole === 'admin' ? recentLogs : [],
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
      users: req.adminRole === 'admin' ? users : users.map(maskUserForVisitor),
      total, page, limit, search,
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
      user: req.adminRole === 'admin' ? user : maskUserForVisitor(user),
      recentWorkouts, recentRuns, friendCount, convoCount,
      admin: req.session.adminUsername,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/users/:id/ban
router.post('/users/:id/ban', requireAdminFull, async (req, res) => {
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

// POST /admin/users/:id/disable
router.post('/users/:id/disable', requireAdminFull, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, isDisabled: true, isSystem: true },
    });
    if (!user || user.isSystem) return res.redirect('/admin/users');

    await prisma.$transaction([
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      prisma.pushToken.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          isDisabled: true,
          deactivatedAt: new Date(),
          scheduledDeletionAt: null,
        },
      }),
      prisma.auditLog.create({
        data: { action: 'DISABLE_USER', targetType: 'user', targetId: user.id },
      }),
    ]);

    res.redirect(`/admin/users/${user.id}`);
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/users/:id/reactivate
router.post('/users/:id/reactivate', requireAdminFull, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, isDisabled: true, isSystem: true },
    });
    if (!user || user.isSystem) return res.redirect('/admin/users');
    if (!user.email) {
      return res.status(400).render('admin/error', {
        message: 'Ce compte est anonymise et ne peut pas etre reactive sans email.',
        admin: req.session.adminUsername,
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          isDisabled: false,
          deactivatedAt: null,
          scheduledDeletionAt: null,
        },
      }),
      prisma.auditLog.create({
        data: { action: 'REACTIVATE_USER', targetType: 'user', targetId: user.id },
      }),
    ]);

    res.redirect(`/admin/users/${user.id}`);
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// GET /admin/users/:id/add-workout (page de création complète)
router.get('/users/:id/add-workout', requireAdminFull, async (req, res) => {
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
router.post('/users/:id/add-workout', requireAdminFull, async (req, res) => {
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
router.post('/users/:id/delete', requireAdminFull, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, isDisabled: true, isSystem: true },
    });
    if (!user || user.isDisabled || user.isSystem) {
      return res.redirect('/admin/users');
    }

    const deactivated = await deactivateAccount(prisma, req.params.id);
    await prisma.auditLog.create({
      data: {
        action: 'DEACTIVATE_USER',
        targetType: 'user',
        targetId: req.params.id,
        payload: {
          deactivatedAt: deactivated.deactivatedAt,
          scheduledDeletionAt: deactivated.scheduledDeletionAt,
        },
      },
    });
    res.redirect('/admin/users');
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// GET /admin/workouts/:id (détail détaillé d'une séance)
router.get('/workouts/:id', requireAdminFull, async (req, res) => {
  try {
    const workout = await prisma.workout.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        exerciseLogs: {
          include: {
            setLogs: true,
            cardioLogs: true
          }
        }
      }
    });
    
    if (!workout) return res.redirect('/admin/users');
    
    // Utiliser le même formateur que l'API
    const workoutData = formatWorkoutForApp(workout);
    
    res.render('admin/workout-detail', {
      workout,
      workoutData,
      admin: req.session.adminUsername
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/workouts/:id/delete (modération)
router.post('/workouts/:id/delete', requireAdminFull, async (req, res) => {
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

// GET /admin/running/:id (détail d'une course)
router.get('/running/:id', requireAdminFull, async (req, res) => {
  try {
    const running = await prisma.runningSession.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        gpsPoints: true
      }
    });
    
    if (!running) return res.redirect('/admin/users');
    
    // Utiliser le même formateur que l'API
    const runningData = formatRunningForApp(running);
    
    res.render('admin/running-detail', {
      running,
      runningData,
      admin: req.session.adminUsername
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/running/:id/delete (modération)
router.post('/running/:id/delete', requireAdminFull, async (req, res) => {
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
