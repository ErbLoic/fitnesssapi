const router = require('express').Router();
const requireAdmin = require('../../middleware/requireAdmin');

router.use(require('./authRoutes'));

router.use(requireAdmin);
router.use((req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method) || req.adminRole === 'admin') return next();
  return res.status(403).render('admin/error', {
    message: 'Compte visiteur: action non autorisee.',
    admin: req.session.adminUsername,
  });
});

router.use(require('./versionsRoutes'));
router.use(require('./usersRoutes'));
router.use(require('./badgesRoutes'));
router.use(require('./statsRoutes'));
router.use(require('./logsRoutes'));
router.use(require('./errorReportsRoutes'));

module.exports = router;
