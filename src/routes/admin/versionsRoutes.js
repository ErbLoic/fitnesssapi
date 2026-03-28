const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const requireAdmin = require('../../middleware/requireAdmin');

const prisma = new PrismaClient();

// GET /admin/versions
router.get('/versions', requireAdmin, async (req, res) => {
  const versions = await prisma.appVersion.findMany({ orderBy: { platform: 'asc' } });
  res.render('admin/versions', { versions, success: req.query.success, admin: req.session.adminUsername });
});

// POST /admin/versions/:platform
router.post('/versions/:platform', requireAdmin, async (req, res) => {
  const { platform } = req.params;
  const {
    latestVersion, minRequiredVersion, storeUrl, releaseNotes,
    forceUpdate, maintenanceMode, maintenanceMessage,
    socialEnabled, nutritionEnabled, premiumEnabled, aiCoachEnabled, leaderboardEnabled,
  } = req.body;

  await prisma.appVersion.updateMany({
    where: { platform },
    data: {
      latestVersion,
      minRequiredVersion,
      storeUrl,
      releaseNotes: releaseNotes || null,
      forceUpdate: forceUpdate === 'on',
      maintenanceMode: maintenanceMode === 'on',
      maintenanceMessage: maintenanceMessage || null,
      socialEnabled: socialEnabled === 'on',
      nutritionEnabled: nutritionEnabled === 'on',
      premiumEnabled: premiumEnabled === 'on',
      aiCoachEnabled: aiCoachEnabled === 'on',
      leaderboardEnabled: leaderboardEnabled === 'on',
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'UPDATE_APP_VERSION',
      targetType: 'app_version',
      payload: { platform, latestVersion, minRequiredVersion, forceUpdate, maintenanceMode },
    },
  });

  res.redirect('/admin/versions?success=1');
});

module.exports = router;
