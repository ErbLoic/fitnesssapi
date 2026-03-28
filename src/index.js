require('dotenv').config();

// Force IPv4 — Render Free ne supporte pas IPv6 mais Supabase y répond par défaut
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`FitnessPro API running on port ${PORT} [${process.env.NODE_ENV}]`);
});
