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

module.exports = router;
