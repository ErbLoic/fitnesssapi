const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAdmin = require('../../middleware/requireAdmin');

const prisma = new PrismaClient();

router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const skip = (page - 1) * limit;

    const logs = await prisma.auditLog.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } });
    const total = await prisma.auditLog.count();

    res.render('admin/logs', {
      logs, total, page, limit,
      totalPages: Math.ceil(total / limit),
      admin: req.session.adminUsername,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

router.get('/security-logs', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const skip = (page - 1) * limit;

    const loginAttempts = await prisma.adminLoginAttempt.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    const totalLoginAttempts = await prisma.adminLoginAttempt.count();

    const apiFailures = await prisma.apiFailureLog.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    const totalApiFailures = await prisma.apiFailureLog.count();

    res.render('admin/security-logs', {
      loginAttempts,
      totalLoginAttempts,
      apiFailures,
      totalApiFailures,
      page,
      limit,
      totalPagesLogin: Math.ceil(totalLoginAttempts / limit),
      totalPagesApi: Math.ceil(totalApiFailures / limit),
      admin: req.session.adminUsername,
    });
  } catch (err) {
    res.render('admin/error', { message: err.message, admin: req.session.adminUsername });
  }
});

module.exports = router;
