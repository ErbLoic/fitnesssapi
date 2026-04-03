const router = require('express').Router();
const { z } = require('zod');
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');
router.use(requireAuth);

// GET /weight
router.get('/', async (req, res) => {
  const where = { userId: req.userId };
  if (req.query.from) where.date = { ...where.date, gte: new Date(req.query.from) };
  if (req.query.to) where.date = { ...where.date, lte: new Date(req.query.to) };

  const entries = await prisma.weightEntry.findMany({ where, orderBy: { date: 'desc' } });
  res.json(entries);
});

// POST /weight
router.post('/', async (req, res) => {
  const schema = z.object({
    weightKg: z.number().positive(),
    date: z.string(),
    note: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const date = new Date(parsed.data.date);
  date.setUTCHours(0, 0, 0, 0);

  const existing = await prisma.weightEntry.findUnique({ where: { userId_date: { userId: req.userId, date } } });
  if (existing) {
    return res.status(409).json({ error: 'CONFLICT', message: 'Une entrée existe déjà pour cette date' });
  }
  const entry = await prisma.weightEntry.create({
    data: { userId: req.userId, weightKg: parsed.data.weightKg, date, note: parsed.data.note },
  });
  res.status(201).json(entry);
});

// PUT /weight/:date
router.put('/:date', async (req, res) => {
  const schema = z.object({
    weightKg: z.number().positive(),
    note: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.errors[0].message });
  }
  const date = new Date(req.params.date);
  date.setUTCHours(0, 0, 0, 0);

  const entry = await prisma.weightEntry.upsert({
    where: { userId_date: { userId: req.userId, date } },
    update: parsed.data,
    create: { ...parsed.data, userId: req.userId, date },
  });
  res.json(entry);
});

// DELETE /weight/:id
router.delete('/:id', async (req, res) => {
  const existing = await prisma.weightEntry.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND', message: 'Entrée introuvable' });
  await prisma.weightEntry.delete({ where: { id: req.params.id } });
  res.json({ message: 'Entrée supprimée' });
});

module.exports = router;
