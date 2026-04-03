const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const truncate = (value, max) => {
  if (value === undefined || value === null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
};

const normalizeIp = (ip = '') => truncate(String(ip).replace('::ffff:', '').trim(), 64);

const requestIdMiddleware = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.requestId = incoming ? truncate(incoming, 64) : crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};

const apiFailureLogger = (req, res, next) => {
  const path = req.originalUrl || req.path || '';
  const isApiRequest = !path.startsWith('/admin') && !path.startsWith('/api-docs') && !path.startsWith('/public');
  if (!isApiRequest) return next();

  let responsePayload;
  const json = res.json.bind(res);
  const send = res.send.bind(res);

  res.json = (body) => {
    responsePayload = body;
    return json(body);
  };

  res.send = (body) => {
    if (responsePayload === undefined) {
      responsePayload = body;
    }
    return send(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 400) return;

    let errorCode = null;
    let errorMessage = null;

    if (responsePayload && typeof responsePayload === 'object' && !Buffer.isBuffer(responsePayload)) {
      errorCode = truncate(responsePayload.error, 120);
      errorMessage = truncate(responsePayload.message, 5000);
    } else if (typeof responsePayload === 'string') {
      errorMessage = truncate(responsePayload, 5000);
    }

    if (!errorMessage && res.locals && res.locals.errorMessage) {
      errorMessage = truncate(res.locals.errorMessage, 5000);
    }

    if (!errorCode && res.locals && res.locals.errorCode) {
      errorCode = truncate(res.locals.errorCode, 120);
    }

    prisma.apiFailureLog.create({
      data: {
        method: truncate(req.method, 10) || 'GET',
        path: truncate(path, 500) || '/',
        statusCode: res.statusCode,
        errorCode,
        errorMessage,
        userId: truncate(req.userId || req.user?.id || null, 120),
        ipAddress: normalizeIp(req.ip || req.connection?.remoteAddress || ''),
        userAgent: truncate(req.headers['user-agent'] || null, 512),
        requestId: truncate(req.requestId || null, 64),
      },
    }).catch(() => {
      // Never block API responses if log persistence fails.
    });
  });

  next();
};

const logAdminLoginAttempt = ({ username, success, failureReason, req }) => {
  return prisma.adminLoginAttempt.create({
    data: {
      username: truncate(username || null, 255),
      success: Boolean(success),
      failureReason: truncate(failureReason || null, 120),
      ipAddress: normalizeIp(req.ip || req.connection?.remoteAddress || ''),
      userAgent: truncate(req.headers['user-agent'] || null, 512),
    },
  }).catch(() => {
    // Do not fail auth flow if logging fails.
  });
};

module.exports = {
  requestIdMiddleware,
  apiFailureLogger,
  logAdminLoginAttempt,
};
