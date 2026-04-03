const router = require('express').Router();

router.use(require('./authRoutes'));
router.use(require('./versionsRoutes'));
router.use(require('./usersRoutes'));
router.use(require('./badgesRoutes'));
router.use(require('./statsRoutes'));
router.use(require('./logsRoutes'));
router.use(require('./errorReportsRoutes'));

module.exports = router;
