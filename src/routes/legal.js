const router = require('express').Router();

// GET /privacy
router.get('/privacy', (req, res) => {
  res.render('privacy');
});

// GET /terms
router.get('/terms', (req, res) => {
  res.render('terms');
});

module.exports = router;
