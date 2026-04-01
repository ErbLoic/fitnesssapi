const router = require('express').Router();

router.use(require('./authRoutes'));
router.use(require('./versionsRoutes'));
router.use(require('./usersRoutes'));
router.use(require('./badgesRoutes'));
router.use(require('./statsRoutes'));
router.use(require('./logsRoutes'));

// ━━━ Debug routes — DEV ONLY ━━━
if (process.env.NODE_ENV !== 'production') {
  router.use('/debug-dashboard', require('./debugRoutes'));
}

module.exports = router;
