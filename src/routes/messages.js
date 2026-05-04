const router = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');
const { encryptMessageBody, decryptMessage } = require('../lib/messageCrypto');

router.use(requireAuth);

async function assertParticipant(conversationId, userId, res) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Acces refuse a cette conversation' });
    return false;
  }
  return true;
}

function isConversationVisibleForUser(conversation, userId) {
  const me = conversation.participants.find(p => p.userId === userId);
  return !me?.hiddenAt || conversation.updatedAt > me.hiddenAt;
}

async function assertOwnsSharedResources({ userId, workoutId, runningId }, res) {
  if (workoutId) {
    const workout = await prisma.workout.findFirst({
      where: { id: workoutId, userId },
      select: { id: true },
    });
    if (!workout) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Seance a partager introuvable' });
      return false;
    }
  }

  if (runningId) {
    const running = await prisma.runningSession.findFirst({
      where: { id: runningId, userId },
      select: { id: true },
    });
    if (!running) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Course a partager introuvable' });
      return false;
    }
  }

  return true;
}

// GET /conversations - liste des conversations visibles de l'utilisateur.
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

  const visibleConversations = conversations.filter(conv => isConversationVisibleForUser(conv, req.userId));

  const result = await Promise.all(visibleConversations.map(async (conv) => {
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
      lastMessage: decryptMessage(conv.messages[0] || null),
      unreadCount,
    };
  }));

  res.json(result);
});

// POST /conversations - creer ou recuperer un DM avec un autre user.
router.post('/', async (req, res) => {
  const { userId: otherId } = req.body;
  if (!otherId) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'userId requis' });
  if (otherId === req.userId) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Impossible de creer une conversation avec soi-meme' });
  }

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
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: existing.id, userId: req.userId } },
      data: { hiddenAt: null },
    });
    return res.json({ id: existing.id });
  }

  const other = await prisma.user.findFirst({
    where: { id: otherId, isDisabled: false, isSystem: false },
    select: { id: true },
  });
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

// GET /conversations/:id/messages - messages pagines, historique complet.
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
  res.json({ messages: messages.reverse().map(decryptMessage), nextCursor });
});

// POST /conversations/:id/messages - envoyer un message et reactiver la conversation.
router.post('/:id/messages', async (req, res) => {
  const { id } = req.params;
  if (!await assertParticipant(id, req.userId, res)) return;

  const { body, workoutId, runningId } = req.body;
  if (!body && !workoutId && !runningId) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'body, workoutId ou runningId requis' });
  }
  if (!await assertOwnsSharedResources({ userId: req.userId, workoutId, runningId }, res)) return;

  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: id,
        senderId: req.userId,
        body: body ? encryptMessageBody(body) : null,
        workoutId: workoutId || null,
        runningId: runningId || null,
      },
      include: {
        sender: { select: { id: true, name: true, profileImageUrl: true } },
        workout: { select: { id: true, name: true, durationMinutes: true, caloriesBurned: true } },
        running: { select: { id: true, distanceKm: true, durationSeconds: true, caloriesBurned: true } },
      },
    });

    await tx.conversationParticipant.updateMany({
      where: { conversationId: id },
      data: { hiddenAt: null },
    });

    await tx.conversation.update({ where: { id }, data: { updatedAt: now } });

    return created;
  });

  res.status(201).json(decryptMessage(message));
});

// DELETE /conversations/:id - masquer la conversation pour l'utilisateur courant.
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!await assertParticipant(id, req.userId, res)) return;

  const now = new Date();
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: req.userId } },
    data: {
      hiddenAt: now,
      lastReadAt: now,
    },
  });

  res.json({
    ok: true,
    hidden: true,
    message: 'Conversation masquee pour cet utilisateur uniquement',
  });
});

// POST /conversations/:id/read - marquer comme lu.
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
