const router = require('express').Router();

// GET / — page d'accueil publique (requis Google OAuth / Meta)
router.get('/', (req, res) => {
  res.render('home');
});

// GET /privacy
router.get('/privacy', (req, res) => {
  res.render('privacy');
});

// GET /terms
router.get('/terms', (req, res) => {
  res.render('terms');
});

// GET /data-deletion — requis par Facebook/Meta OAuth
router.get('/data-deletion', (req, res) => {
  res.render('data-deletion');
});

module.exports = router;
