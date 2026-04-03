const router = require('express').Router();
const semver = require('semver');
const prisma = require('../lib/prisma');

// GET /app/config?platform=android&version=1.0.0
router.get('/config', async (req, res) => {
  const platform = req.query.platform || 'android';
  const currentVersion = req.query.version || '0.0.0';

  const config = await prisma.appVersion.findFirst({ where: { platform } });
  if (!config) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Plateforme inconnue' });
  }

  const updateRequired = semver.lt(currentVersion, config.minRequiredVersion);

  res.json({
    latestVersion: config.latestVersion,
    minRequiredVersion: config.minRequiredVersion,
    currentVersion,
    updateRequired,
    forceUpdate: config.forceUpdate,
    storeUrl: config.storeUrl,
    maintenanceMode: config.maintenanceMode,
    maintenanceMessage: config.maintenanceMessage,
    releaseNotes: config.releaseNotes,
    featureFlags: {
      socialEnabled: config.socialEnabled,
      nutritionEnabled: config.nutritionEnabled,
      premiumEnabled: config.premiumEnabled,
      aiCoachEnabled: config.aiCoachEnabled,
      leaderboardEnabled: config.leaderboardEnabled,
    },
  });
});

module.exports = router;
