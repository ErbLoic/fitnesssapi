const router = require('express').Router();
const prisma = require('../lib/prisma');
const startTime = Date.now();

router.get('/', async (req, res) => {
  let dbStatus = 'connected';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'unreachable';
  }

  const status = dbStatus === 'connected' ? 'ok' : 'degraded';
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0',
    database: dbStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

module.exports = router;
