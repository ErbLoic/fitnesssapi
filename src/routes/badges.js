const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
router.use(requireAuth);

// GET /badges
router.get('/', async (req, res) => {
  const badges = await prisma.userBadge.findMany({
    where: { userId: req.userId },
    orderBy: { unlockedAt: 'asc' },
  });
  const unlocked = badges.map(b => b.badgeId);
  const unlockedAt = {};
  badges.forEach(b => { unlockedAt[b.badgeId] = b.unlockedAt; });
  res.json({ unlocked, unlockedAt });
});

// POST /badges/:badgeId
router.post('/:badgeId', async (req, res) => {
  const { badgeId } = req.params;
  const existing = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId: req.userId, badgeId } },
  });
  if (existing) {
    return res.status(409).json({ error: 'CONFLICT', message: 'Badge déjà débloqué' });
  }
  const badge = await prisma.userBadge.create({ data: { userId: req.userId, badgeId } });
  res.status(201).json(badge);
});

module.exports = router;
