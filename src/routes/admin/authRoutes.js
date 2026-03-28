const router = require('express').Router();

// GET /admin/login
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

// POST /admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.admin = true;
    req.session.adminUsername = username;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Identifiants invalides' });
});

// GET /admin/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

module.exports = router;
