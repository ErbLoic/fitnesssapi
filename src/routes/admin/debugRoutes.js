/**
 * Admin Debug Routes — Endpoints pour le dashboard développement
 * ATTENTION : Ces routes exposent des données sensibles !
 * À désactiver complètement en production.
 */

const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAdmin = require('../../middleware/requireAdmin');

const prisma = new PrismaClient();
router.use(requireAdmin);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /admin/debug-dashboard — Affiche le dashboard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.get('/', (req, res) => {
  // Vérifier que ce n'est pas en production
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Debug dashboard désactivé en production' });
  }
  res.render('admin/debug-dashboard', { title: 'Debug Dashboard' });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /admin/api/debug-stats — API pour charger les données
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

router.post('/api/debug-stats', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Debug dashboard désactivé en production' });
  }

  try {
    // ━━━ Section 1 : Conversations & Messages ━━━
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: {
            sender: { select: { id: true, name: true, email: true } },
            workout: { select: { id: true, name: true, durationMinutes: true, caloriesBurned: true } },
            running: { select: { id: true, distanceKm: true, durationSeconds: true } },
          }
        }
      }
    });

    const conversationsData = conversations.map(conv => ({
      id: conv.id,
      updatedAt: conv.updatedAt,
      participantCount: conv.participants.length,
      participants: conv.participants.map(p => ({ id: p.userId, name: p.user.name, email: p.user.email })),
      lastMessages: conv.messages.map(m => ({
        id: m.id,
        sender: m.sender.name,
        body: m.body ? m.body.substring(0, 100) : null,
        workoutId: m.workoutId,
        runningId: m.runningId,
        createdAt: m.createdAt,
        workout: m.workout,
        running: m.running,
      }))
    }));

    // Calculer unread count
    const unreadStats = await Promise.all(conversations.map(async (conv) => {
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conv.id,
        }
      });
      return { convId: conv.id, unreadCount };
    }));

    // ━━━ Section 2 : Sync Errors (Duplicatas détectés) ━━━
    const duplicates = await prisma.auditLog.findMany({
      where: { action: 'POTENTIAL_DUPLICATE' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const dupsByUser = {};
    duplicates.forEach(log => {
      const payload = log.payload;
      if (!dupsByUser[payload.newWorkout?.id || payload.newSession?.id]) {
        dupsByUser[payload.newWorkout?.id || payload.newSession?.id] = [];
      }
      dupsByUser[payload.newWorkout?.id || payload.newSession?.id].push(log);
    });

    // Détecter les utilisateurs avec beaucoup de dups
    const userDupCounts = {};
    duplicates.forEach(log => {
      // Extraire userId from targetId ou du payload
      const userId = log.targetId?.split(':')[0];
      if (userId) {
        userDupCounts[userId] = (userDupCounts[userId] || 0) + 1;
      }
    });

    const alertedUsers = Object.entries(userDupCounts)
      .filter(([_, count]) => count > 5)
      .map(([userId, count]) => ({ userId, count }));

    // ━━━ Section 3 : Transformations (derniers workouts/running) ━━━
    const lastWorkouts = await prisma.workout.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { exerciseLogs: { include: { setLogs: true, cardioLogs: true } } }
    });

    const lastRunnings = await prisma.runningSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { gpsPoints: true }
    });

    // ━━━ Section 4 : Statistiques ━━━
    const totalDups = duplicates.length;
    const totalWorkouts = await prisma.workout.count();
    const dupPercentage = totalWorkouts ? ((totalDups / totalWorkouts) * 100).toFixed(2) : 0;

    const totalRunnings = await prisma.runningSession.count();
    const totalMessages = await prisma.message.count();

    const stats = {
      totalWorkouts,
      totalRunnings,
      totalMessages,
      totalDuplicatesDetected: totalDups,
      duplicatePercentage: dupPercentage,
      alertedUsers: alertedUsers.length,
    };

    res.json({
      conversations: conversationsData,
      unreadStats,
      duplicates: duplicates.slice(0, 50),
      alertedUsers,
      lastWorkouts: lastWorkouts.slice(0, 3),
      lastRunnings: lastRunnings.slice(0, 3),
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Debug stats error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

module.exports = router;
