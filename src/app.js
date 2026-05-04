const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const compression = require('compression');
const {
  corsMiddleware,
  securityHeaders,
  requireHttps,
  adminNoCache,
  adminIpGuard,
  globalRateLimit,
  authRateLimit,
  errorReportRateLimit,
} = require('./middleware/security');
const {
  requestIdMiddleware,
  apiFailureLogger,
} = require('./middleware/securityLogging');

require('./config/passport');

const app = express();

app.disable('x-powered-by');

app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(requireHttps);
app.use(corsMiddleware);
app.options('*', corsMiddleware);
app.use(globalRateLimit);
app.use(requestIdMiddleware);

// ── Compression gzip (efficacité) ───────────────────────────────────
app.use(compression());

// ── Static files (public/) ────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// Avoid noisy favicon 404 logs when clients probe favicon automatically.
app.use('/favicon.ico', (_req, res) => res.status(204).end());

// ── Body parsers ──────────────────────────────────────────────────
app.use(express.json({ limit: process.env.BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.BODY_LIMIT || '1mb' }));
app.use(apiFailureLogger);

// ── View engine (admin) ───────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Session admin (mémoire — pas de dépendance pg externe) ───────
// Les sessions admin sont éphémères : si le serveur redémarre,
// l'admin doit se reconnecter. Parfait pour Render Free.
app.use(session({
  secret: process.env.ADMIN_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  unset: 'destroy',
  name: 'fitnesspro_admin_session',
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8h
  },
}));

// ── Passport ──────────────────────────────────────────────────────
app.use(passport.initialize());

// ── Swagger/OpenAPI documentation (admin only) ───────────────────
const { swaggerUi, getSwaggerDocForRole, getSwaggerUiOptions } = require('./swagger');
const requireAdmin = require('./middleware/requireAdmin');
app.use('/api-docs', requireAdmin, swaggerUi.serve);
app.get('/api-docs', requireAdmin, (req, res, next) => {
  return swaggerUi.setup(
    getSwaggerDocForRole(req.adminRole),
    getSwaggerUiOptions(req.adminRole),
  )(req, res, next);
});

app.get('/guide-visiteur', requireAdmin, (req, res) => {
  res.json({
    title: 'Guide visiteur Swagger',
    role: req.adminRole,
    steps: [
      'Connecte-toi au panel admin avec le compte visiteur.',
      'Ouvre /api-docs.',
      'Pour tester une route protegee, utilise POST /auth/login avec un compte mobile de test.',
      'Copie accessToken, clique sur Authorize, puis colle Bearer TON_ACCESS_TOKEN.',
      'Evite les routes POST/PATCH/DELETE en production si tu veux seulement observer.',
    ],
    protectedData: [
      'Emails masques dans le panel visiteur.',
      'Details de seances et courses reserves aux administrateurs complets.',
      'Coordonnees GPS et JSON complets non exposes au visiteur.',
    ],
    productionServer: 'https://fitnesssapi.onrender.com',
  });
});

// ── Routes API ────────────────────────────────────────────────────
app.use('/ping',     require('./routes/ping'));
app.use('/auth',     authRateLimit, require('./routes/auth'));
app.use('/users',    require('./routes/users'));
app.use('/workouts', require('./routes/workouts'));
app.use('/programs', require('./routes/programs'));
app.use('/workout-sessions', require('./routes/workoutSessions'));
app.use('/running',  require('./routes/running'));
app.use('/steps',    require('./routes/steps'));
app.use('/weight',   require('./routes/weight'));
app.use('/badges',   require('./routes/badges'));
app.use('/settings', require('./routes/settings'));
app.use('/sync',           require('./routes/sync'));
app.use('/app',           require('./routes/appConfig'));
app.use('/conversations', require('./routes/messages'));
app.use('/friends',       require('./routes/friends'));
app.use('/errors/report', errorReportRateLimit);
app.use('/errors',        require('./routes/errors'));
app.use('/',              require('./routes/legal'));

// Aliases avec prefixe /api pour les nouveaux endpoints mobiles documentes.
app.use('/api/users', require('./routes/users'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/workout-sessions', require('./routes/workoutSessions'));

// ── Admin panel ───────────────────────────────────────────────────
app.use('/admin', adminIpGuard, adminNoCache, require('./routes/admin/index'));

// ── Global error handler ──────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.locals.errorCode = 'INTERNAL_ERROR';
  res.locals.errorMessage = err?.message || 'Unhandled server error';
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Erreur interne du serveur',
    requestId: _req.requestId,
  });
});

module.exports = app;
