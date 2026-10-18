const path = require('path');

function firstCoolifyUrl() {
  const direct = String(process.env.COOLIFY_URL || '').trim();
  if (direct) return direct.replace(/\/$/, '');

  const fqdn = String(process.env.COOLIFY_FQDN || '')
    .split(',')[0]
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  if (fqdn) return `https://${fqdn}`;
  return '';
}

/**
 * Normalize PORT, DASHBOARD_URL and DATA_DIR before the bot and dashboard start.
 * Coolify injects COOLIFY_URL / COOLIFY_FQDN when a domain is attached.
 */
function applyRuntimeEnv() {
  const port = String(process.env.PORT || process.env.DASHBOARD_PORT || '3000').trim() || '3000';
  process.env.PORT = port;
  if (!process.env.DASHBOARD_PORT) process.env.DASHBOARD_PORT = port;

  const explicit = String(process.env.DASHBOARD_URL || '').trim();
  const resolved = (explicit || firstCoolifyUrl()).replace(/\/$/, '');
  if (resolved) {
    process.env.DASHBOARD_URL = resolved;
  } else if (process.env.NODE_ENV === 'production') {
    console.error(
      '[runtime] DASHBOARD_URL ontbreekt. Zet de publieke https-URL (je Coolify-domein), bijvoorbeeld https://desk.example.com'
    );
    process.exit(1);
  }

  process.env.DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '..', '..', 'data');
}

function getDataDir() {
  if (!process.env.DATA_DIR) applyRuntimeEnv();
  return process.env.DATA_DIR;
}

module.exports = { applyRuntimeEnv, getDataDir };
