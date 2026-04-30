require('dotenv').config();
const prisma = require('./lib/prisma');
const { purgeExpiredDisabledAccounts } = require('./lib/accountDeletion');

// Force IPv4 — Render Free ne supporte pas IPv6 mais Supabase y répond par défaut
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const app = require('./app');

const PORT = process.env.PORT || 3000;
const LOG_RETENTION_DAYS = Number.parseInt(process.env.LOG_RETENTION_DAYS || '90', 10);
const LOG_CLEANUP_INTERVAL_HOURS = Number.parseInt(process.env.LOG_CLEANUP_INTERVAL_HOURS || '24', 10);
const LOG_CLEANUP_ENABLED = String(
  process.env.LOG_CLEANUP_ENABLED || (process.env.NODE_ENV === 'production' ? 'true' : 'false'),
).toLowerCase() === 'true';
const ACCOUNT_CLEANUP_INTERVAL_HOURS = Number.parseInt(process.env.ACCOUNT_CLEANUP_INTERVAL_HOURS || '24', 10);

const cleanupSecurityLogs = async () => {
  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    const adminDeleted = await prisma.adminLoginAttempt.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const apiDeleted = await prisma.apiFailureLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (adminDeleted.count > 0 || apiDeleted.count > 0) {
      console.log(
        `[security-logs] cleanup: deleted ${adminDeleted.count} admin attempts + ${apiDeleted.count} API failures older than ${LOG_RETENTION_DAYS} days`,
      );
    }
  } catch (error) {
    console.warn('[security-logs] cleanup failed:', error.message);
  }
};

const cleanupDisabledAccounts = async () => {
  try {
    const deleted = await purgeExpiredDisabledAccounts(prisma);
    if (deleted.count > 0) {
      console.log(`[accounts] cleanup: deleted ${deleted.count} disabled accounts past scheduled deletion`);
    }
  } catch (error) {
    console.warn('[accounts] cleanup failed:', error.message);
  }
};

app.listen(PORT, () => {
  console.log(`FitnessPro API running on port ${PORT} [${process.env.NODE_ENV}]`);

  // Purge automatique des logs de securite anciens.
  // Activee par defaut en production, desactivee en local pour eviter de
  // bloquer le demarrage quand Supabase/pooler n'est pas joignable.
  if (LOG_CLEANUP_ENABLED) {
    cleanupSecurityLogs();
    setInterval(cleanupSecurityLogs, Math.max(1, LOG_CLEANUP_INTERVAL_HOURS) * 60 * 60 * 1000);
  } else {
    console.log('[security-logs] cleanup disabled');
  }

  cleanupDisabledAccounts();
  setInterval(cleanupDisabledAccounts, Math.max(1, ACCOUNT_CLEANUP_INTERVAL_HOURS) * 60 * 60 * 1000);

  if (process.env.NODE_ENV === 'production') {
    const https = require('https');
    setInterval(() => {
      https.get('https://fitnesssapi.onrender.com/ping', (res) => {
        console.log(`[keep-alive] ping → ${res.statusCode}`);
      }).on('error', (e) => console.warn('[keep-alive] ping failed:', e.message));
    }, 14 * 60 * 1000);
  }
});
