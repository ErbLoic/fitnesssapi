const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();

router.use(requireAuth);

// POST /friends/request — envoyer une demande d'ami
router.post('/request', async (req, res) => {
  const { userId: receiverId } = req.body;
  if (!receiverId) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'userId requis' });
  if (receiverId === req.userId) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Impossible de vous ajouter vous-même' });

  const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true } });
  if (!receiver) return res.status(404).json({ error: 'NOT_FOUND', message: 'Utilisateur introuvable' });

  // Vérifie si une relation existe déjà dans les deux sens
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: req.userId, receiverId },
        { requesterId: receiverId, receiverId: req.userId },
      ],
    },
  });
  if (existing) {
    const msg = existing.status === 'accepted'
      ? 'Vous êtes déjà amis'
      : 'Une demande est déjà en attente';
    return res.status(409).json({ error: 'CONFLICT', message: msg });
  }

  const friendship = await prisma.friendship.create({
    data: { requesterId: req.userId, receiverId, status: 'pending' },
  });

  res.status(201).json({ id: friendship.id, status: friendship.status });
});

// GET /friends — liste des amis acceptés
router.get('/', async (req, res) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: req.userId },
        { receiverId: req.userId },
      ],
    },
    include: {
      requester: { select: { id: true, name: true, fitnessLevel: true, profileImageUrl: true } },
      receiver:  { select: { id: true, name: true, fitnessLevel: true, profileImageUrl: true } },
    },
  });

  const friends = friendships.map(f => ({
    friendshipId: f.id,
    since: f.createdAt,
    user: f.requesterId === req.userId ? f.receiver : f.requester,
  }));

  res.json(friends);
});

// GET /friends/requests — demandes reçues en attente
router.get('/requests', async (req, res) => {
  const requests = await prisma.friendship.findMany({
    where: { receiverId: req.userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: {
      requester: { select: { id: true, name: true, fitnessLevel: true, profileImageUrl: true } },
    },
  });

  res.json(requests.map(r => ({
    id: r.id,
    from: r.requester,
    createdAt: r.createdAt,
  })));
});

// GET /friends/sent — demandes envoyées en attente
router.get('/sent', async (req, res) => {
  const sent = await prisma.friendship.findMany({
    where: { requesterId: req.userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: {
      receiver: { select: { id: true, name: true, fitnessLevel: true, profileImageUrl: true } },
    },
  });

  res.json(sent.map(s => ({
    id: s.id,
    to: s.receiver,
    createdAt: s.createdAt,
  })));
});

// POST /friends/:id/accept — accepter une demande
router.post('/:id/accept', async (req, res) => {
  const friendship = await prisma.friendship.findUnique({ where: { id: req.params.id } });
  if (!friendship) return res.status(404).json({ error: 'NOT_FOUND', message: 'Demande introuvable' });
  if (friendship.receiverId !== req.userId) return res.status(403).json({ error: 'FORBIDDEN', message: 'Accès refusé' });
  if (friendship.status !== 'pending') return res.status(409).json({ error: 'CONFLICT', message: 'Demande déjà traitée' });

  const updated = await prisma.friendship.update({
    where: { id: req.params.id },
    data: { status: 'accepted' },
  });

  res.json({ id: updated.id, status: updated.status });
});

// POST /friends/:id/decline — refuser une demande
router.post('/:id/decline', async (req, res) => {
  const friendship = await prisma.friendship.findUnique({ where: { id: req.params.id } });
  if (!friendship) return res.status(404).json({ error: 'NOT_FOUND', message: 'Demande introuvable' });
  if (friendship.receiverId !== req.userId) return res.status(403).json({ error: 'FORBIDDEN', message: 'Accès refusé' });
  if (friendship.status !== 'pending') return res.status(409).json({ error: 'CONFLICT', message: 'Demande déjà traitée' });

  await prisma.friendship.delete({ where: { id: req.params.id } });

  res.json({ message: 'Demande refusée' });
});

// DELETE /friends/:id — supprimer un ami (ou annuler une demande envoyée)
router.delete('/:id', async (req, res) => {
  const friendship = await prisma.friendship.findUnique({ where: { id: req.params.id } });
  if (!friendship) return res.status(404).json({ error: 'NOT_FOUND', message: 'Relation introuvable' });
  if (friendship.requesterId !== req.userId && friendship.receiverId !== req.userId) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Accès refusé' });
  }

  await prisma.friendship.delete({ where: { id: req.params.id } });

  res.json({ message: 'Ami supprimé' });
});

module.exports = router;
