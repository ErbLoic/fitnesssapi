const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { logAdminLoginAttempt } = require('./securityLogging');

const isProduction = process.env.NODE_ENV === 'production';

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseAllowedOrigins = () => {
  const raw = process.env.CORS_ORIGINS || '';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();

const normalizeIp = (ip = '') => ip.replace('::ffff:', '').trim();

const adminIpAllowlist = (process.env.ADMIN_IP_ALLOWLIST || '')
  .split(',')
  .map((entry) => normalizeIp(entry))
  .filter(Boolean);

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) {
      // En prod avec aucun origin configuré, accepte le même domaine
      if (isProduction) {
        const host = process.env.RENDER_EXTERNAL_URL || process.env.ALLOWED_HOST || '';
        if (host && origin.includes(host.replace(/^https?:\/\//, ''))) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      }
      return callback(null, true); // Dev: accepte tout
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400,
});

const securityHeaders = helmet({
  contentSecurityPolicy: isProduction ? undefined : false,
  crossOriginEmbedderPolicy: false,
  hsts: isProduction
    ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    }
    : false,
});

const requireHttps = (req, res, next) => {
  if (!isProduction) return next();

  const proto = req.headers['x-forwarded-proto'];
  if (proto === 'https') return next();

  if (req.method === 'GET' && req.headers.host) {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }

  return res.status(426).json({
    error: 'HTTPS_REQUIRED',
    message: 'Connexion HTTPS obligatoire.',
  });
};

const adminNoCache = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

const adminIpGuard = (req, res, next) => {
  if (adminIpAllowlist.length === 0) return next();
  const ip = normalizeIp(req.ip || req.connection?.remoteAddress || '');
  if (adminIpAllowlist.includes(ip)) return next();
  return res.status(403).json({
    error: 'FORBIDDEN',
    message: 'Acces admin non autorise depuis cette IP.',
  });
};

const globalRateLimit = rateLimit({
  windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_MAX, 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Trop de requetes, reessayez dans quelques instants.',
  },
  skip: (req) => req.path === '/ping',
});

const authRateLimit = rateLimit({
  windowMs: toInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: toInt(process.env.AUTH_RATE_LIMIT_MAX, 25),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_AUTH_REQUESTS',
    message: 'Trop de tentatives d authentification. Merci de patienter.',
  },
});

const errorReportRateLimit = rateLimit({
  windowMs: toInt(process.env.ERROR_REPORT_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
  max: toInt(process.env.ERROR_REPORT_RATE_LIMIT_MAX, 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_ERROR_REPORTS',
    message: 'Trop de rapports d erreur envoyes en peu de temps.',
  },
});

const adminLoginRateLimit = rateLimit({
  windowMs: toInt(process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: toInt(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX, 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logAdminLoginAttempt({
      username: req.body?.username,
      success: false,
      failureReason: 'RATE_LIMIT',
      req,
    });

    if (req.accepts('html')) {
      return res.status(429).render('admin/login', {
        error: 'Trop de tentatives de connexion admin. Reessayez plus tard.',
      });
    }

    return res.status(429).json({
      error: 'TOO_MANY_ADMIN_LOGIN_ATTEMPTS',
      message: 'Trop de tentatives de connexion admin. Reessayez plus tard.',
    });
  },
});

module.exports = {
  corsMiddleware,
  securityHeaders,
  requireHttps,
  adminNoCache,
  adminIpGuard,
  globalRateLimit,
  authRateLimit,
  errorReportRateLimit,
  adminLoginRateLimit,
};
