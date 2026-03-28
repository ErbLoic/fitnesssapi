const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();

router.use(requireAuth);

// Helper : vérifie que l'utilisateur est bien participant de la conversation
async function assertParticipant(conversationId, userId, res) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Accès refusé à cette conversation' });
    return false;
  }
  return true;
}

// GET /conversations — liste des conversations de l'utilisateur
router.get('/', async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId: req.userId } } },
    orderBy: { updatedAt: 'desc' },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, profileImageUrl: true } } },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, body: true, senderId: true, createdAt: true, workoutId: true, runningId: true },
      },
    },
  });

  const result = await Promise.all(conversations.map(async (conv) => {
    const me = conv.participants.find(p => p.userId === req.userId);
    const unreadCount = await prisma.message.count({
      where: {
        conversationId: conv.id,
        createdAt: { gt: me?.lastReadAt ?? new Date(0) },
        senderId: { not: req.userId },
      },
    });
    return {
      id: conv.id,
      updatedAt: conv.updatedAt,
      participants: conv.participants.map(p => p.user),
      lastMessage: conv.messages[0] || null,
      unreadCount,
    };
  }));

  res.json(result);
});

// POST /conversations — créer ou récupérer un DM avec un autre user
router.post('/', async (req, res) => {
  const { userId: otherId } = req.body;
  if (!otherId) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'userId requis' });
  if (otherId === req.userId) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Impossible de créer une conversation avec soi-même' });

  // Cherche une conversation existante entre les deux
  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: req.userId } } },
        { participants: { some: { userId: otherId } } },
      ],
    },
    include: { participants: { select: { userId: true } } },
  });

  if (existing && existing.participants.length === 2) {
    return res.json({ id: existing.id });
  }

  // Vérifie que l'autre user existe
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
  if (!other) return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' });

  const conv = await prisma.conversation.create({
    data: {
      participants: {
        create: [{ userId: req.userId }, { userId: otherId }],
      },
    },
  });

  res.status(201).json({ id: conv.id });
});

// GET /conversations/:id/messages — messages paginés (cursor-based)
router.get('/:id/messages', async (req, res) => {
  const { id } = req.params;
  if (!await assertParticipant(id, req.userId, res)) return;

  const { cursor } = req.query;
  const take = 30;

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'desc' },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      sender: { select: { id: true, name: true, profileImageUrl: true } },
      workout: { select: { id: true, name: true, durationMinutes: true, caloriesBurned: true } },
      running: { select: { id: true, distanceKm: true, durationSeconds: true, caloriesBurned: true } },
    },
  });

  const nextCursor = messages.length === take ? messages[messages.length - 1].id : null;
  res.json({ messages: messages.reverse(), nextCursor });
});

// POST /conversations/:id/messages — envoyer un message
router.post('/:id/messages', async (req, res) => {
  const { id } = req.params;
  if (!await assertParticipant(id, req.userId, res)) return;

  const { body, workoutId, runningId } = req.body;
  if (!body && !workoutId && !runningId) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'body, workoutId ou runningId requis' });
  }

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      senderId: req.userId,
      body: body || null,
      workoutId: workoutId || null,
      runningId: runningId || null,
    },
    include: {
      sender: { select: { id: true, name: true, profileImageUrl: true } },
      workout: { select: { id: true, name: true, durationMinutes: true, caloriesBurned: true } },
      running: { select: { id: true, distanceKm: true, durationSeconds: true, caloriesBurned: true } },
    },
  });

  // Met à jour updatedAt de la conversation
  await prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });

  res.status(201).json(message);
});

// POST /conversations/:id/read — marquer comme lu
router.post('/:id/read', async (req, res) => {
  const { id } = req.params;
  if (!await assertParticipant(id, req.userId, res)) return;

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: req.userId } },
    data: { lastReadAt: new Date() },
  });

  res.json({ ok: true });
});

module.exports = router;
