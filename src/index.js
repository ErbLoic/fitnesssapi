require('dotenv').config();
const prisma = require('./lib/prisma');

// Force IPv4 — Render Free ne supporte pas IPv6 mais Supabase y répond par défaut
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const app = require('./app');

const PORT = process.env.PORT || 3000;
const LOG_RETENTION_DAYS = Number.parseInt(process.env.LOG_RETENTION_DAYS || '90', 10);
const LOG_CLEANUP_INTERVAL_HOURS = Number.parseInt(process.env.LOG_CLEANUP_INTERVAL_HOURS || '24', 10);

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

app.listen(PORT, () => {
  console.log(`FitnessPro API running on port ${PORT} [${process.env.NODE_ENV}]`);

  // Purge automatique des logs de securite anciens (retention 90 jours par defaut)
  cleanupSecurityLogs();
  setInterval(cleanupSecurityLogs, Math.max(1, LOG_CLEANUP_INTERVAL_HOURS) * 60 * 60 * 1000);

  if (process.env.NODE_ENV === 'production') {
    const https = require('https');
    setInterval(() => {
      https.get('https://fitnesssapi.onrender.com/ping', (res) => {
        console.log(`[keep-alive] ping → ${res.statusCode}`);
      }).on('error', (e) => console.warn('[keep-alive] ping failed:', e.message));
    }, 14 * 60 * 1000);
  }
});
