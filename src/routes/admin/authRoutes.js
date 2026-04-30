const router = require('express').Router();
const { adminLoginRateLimit } = require('../../middleware/security');
const { logAdminLoginAttempt } = require('../../middleware/securityLogging');

const failedAdminLogins = new Map();

const lockConfig = {
  threshold: Number.parseInt(process.env.ADMIN_LOCK_THRESHOLD || '5', 10),
  lockMs: Number.parseInt(process.env.ADMIN_LOCK_MS || `${15 * 60 * 1000}`, 10),
};

const getAttemptKey = (req, username = '') => {
  const ip = (req.ip || req.connection?.remoteAddress || '').replace('::ffff:', '');
  return `${ip}:${String(username || '').toLowerCase()}`;
};

// GET /admin/login
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

// POST /admin/login
router.post('/login', adminLoginRateLimit, (req, res) => {
  const { username, password } = req.body;
  const key = getAttemptKey(req, username);
  const current = failedAdminLogins.get(key);
  if (current && current.until > Date.now()) {
    logAdminLoginAttempt({
      username,
      success: false,
      failureReason: 'LOCKED',
      req,
    });

    return res.status(429).render('admin/login', {
      error: 'Trop de tentatives. Reessayez dans quelques minutes.',
    });
  }

  const isFullAdmin = username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD;
  const isVisitorAdmin = (
    process.env.ADMIN_VISITOR_USERNAME &&
    process.env.ADMIN_VISITOR_PASSWORD &&
    username === process.env.ADMIN_VISITOR_USERNAME &&
    password === process.env.ADMIN_VISITOR_PASSWORD
  );

  if (isFullAdmin || isVisitorAdmin) {
    failedAdminLogins.delete(key);
    return req.session.regenerate((err) => {
      if (err) {
        logAdminLoginAttempt({
          username,
          success: false,
          failureReason: 'SESSION_ERROR',
          req,
        });
        return res.status(500).render('admin/login', { error: 'Erreur session, reessayez.' });
      }
      req.session.admin = true;
      req.session.adminRole = isFullAdmin ? 'admin' : 'visitor';
      req.session.adminUsername = username;
      logAdminLoginAttempt({
        username,
        success: true,
        failureReason: null,
        req,
      });
      return res.redirect('/admin');
    });
  }

  const count = (current?.count || 0) + 1;
  const lockUntil = count >= lockConfig.threshold ? Date.now() + lockConfig.lockMs : 0;
  failedAdminLogins.set(key, { count, until: lockUntil });

  logAdminLoginAttempt({
    username,
    success: false,
    failureReason: lockUntil ? 'INVALID_CREDENTIALS_LOCKED' : 'INVALID_CREDENTIALS',
    req,
  });

  return res.status(401).render('admin/login', { error: 'Identifiants invalides' });
});

// POST /admin/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

module.exports = router;
