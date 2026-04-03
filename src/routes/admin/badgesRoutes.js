const router = require('express').Router();
const requireAdmin = require('../../middleware/requireAdmin');
const prisma = require('../../lib/prisma');

// GET /admin/badges
router.get('/badges', requireAdmin, async (req, res) => {
  try {
    const [definitions, userBadges] = await Promise.all([
      prisma.badgeDefinition.findMany({ orderBy: { category: 'asc' } }),
      prisma.userBadge.findMany({
        orderBy: { unlockedAt: 'desc' }, take: 100,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    res.render('admin/badges', {
      definitions, userBadges,
      admin: req.session.adminUsername,
      success: req.query.success,
      error: req.query.error,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/badges/definitions
router.post('/badges/definitions', requireAdmin, async (req, res) => {
  const { badgeId, name, description, icon, category } = req.body;
  if (!badgeId || !name || !description) return res.redirect('/admin/badges?error=Champs+requis+manquants');
  try {
    await prisma.badgeDefinition.create({ data: { badgeId, name, description, icon: icon || '🏅', category: category || 'general' } });
    await prisma.auditLog.create({ data: { action: 'CREATE_BADGE_DEF', targetType: 'badge', payload: { badgeId, name } } });
    res.redirect('/admin/badges?success=Badge+créé');
  } catch {
    res.redirect('/admin/badges?error=Cet+ID+de+badge+existe+déjà');
  }
});

// POST /admin/badges/definitions/:id/toggle
router.post('/badges/definitions/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const def = await prisma.badgeDefinition.findUnique({ where: { id: req.params.id } });
    if (!def) return res.redirect('/admin/badges');
    await prisma.badgeDefinition.update({ where: { id: req.params.id }, data: { isActive: !def.isActive } });
    res.redirect('/admin/badges');
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/badges/definitions/:id/delete
router.post('/badges/definitions/:id/delete', requireAdmin, async (req, res) => {
  try {
    await prisma.badgeDefinition.delete({ where: { id: req.params.id } });
    res.redirect('/admin/badges?success=Badge+supprimé');
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

// POST /admin/badges/grant
router.post('/badges/grant', requireAdmin, async (req, res) => {
  const { userId, badgeId } = req.body;
  if (!userId || !badgeId) return res.redirect('/admin/badges?error=Champs+manquants');
  try {
    await prisma.userBadge.create({ data: { userId, badgeId } });
    await prisma.auditLog.create({ data: { action: 'GRANT_BADGE', targetType: 'user', targetId: userId, payload: { badgeId } } });
    res.redirect('/admin/badges?success=Badge+attribué');
  } catch {
    res.redirect('/admin/badges?error=Badge+déjà+attribué+à+cet+utilisateur');
  }
});

// POST /admin/badges/:userId/:badgeId/delete
router.post('/badges/:userId/:badgeId/delete', requireAdmin, async (req, res) => {
  try {
    await prisma.userBadge.deleteMany({ where: { userId: req.params.userId, badgeId: req.params.badgeId } });
    res.redirect('/admin/badges');
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

module.exports = router;
