const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const path = require('path');
const { Pool } = require('pg');

require('./config/passport');

const app = express();

// ── Body parsers ──────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── View engine (admin) ───────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Session (admin panel) ─────────────────────────────────────────
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(session({
  store: new pgSession({ pool: pgPool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.ADMIN_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }, // 8h
}));

// ── Passport ──────────────────────────────────────────────────────
app.use(passport.initialize());

// ── Routes API ────────────────────────────────────────────────────
app.use('/ping',     require('./routes/ping'));
app.use('/auth',     require('./routes/auth'));
app.use('/users',    require('./routes/users'));
app.use('/workouts', require('./routes/workouts'));
app.use('/running',  require('./routes/running'));
app.use('/steps',    require('./routes/steps'));
app.use('/weight',   require('./routes/weight'));
app.use('/badges',   require('./routes/badges'));
app.use('/settings', require('./routes/settings'));
app.use('/app',      require('./routes/appConfig'));

// ── Admin panel ───────────────────────────────────────────────────
app.use('/admin', require('./routes/admin/index'));

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' });
});

module.exports = app;
