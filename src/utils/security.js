const crypto = require('crypto');
const { PermissionFlagsBits } = require('discord.js');

/** Discord invite bitfield — least privilege for Reedhall features (not Administrator). */
const BOT_INVITE_PERMISSIONS = (
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.AttachFiles |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.AddReactions |
  PermissionFlagsBits.UseExternalEmojis |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageNicknames |
  PermissionFlagsBits.ChangeNickname |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.ModerateMembers |
  PermissionFlagsBits.CreatePublicThreads |
  PermissionFlagsBits.CreatePrivateThreads |
  PermissionFlagsBits.ManageThreads
).toString();

function isProductionLike() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.PUBLIC_RELEASE === '1' ||
    String(process.env.DASHBOARD_URL || '').startsWith('https://')
  );
}

/**
 * Require a strong SESSION_SECRET. Local-only escape: ALLOW_INSECURE_DEV=1.
 */
function getSessionSecret() {
  const s = String(process.env.SESSION_SECRET || '').trim();
  const weak =
    !s ||
    s.length < 32 ||
    s === 'dev-secret' ||
    s === 'change_this_to_a_long_random_string';

  if (!weak) return s;

  if (process.env.ALLOW_INSECURE_DEV === '1') {
    console.warn(
      '[security] ALLOW_INSECURE_DEV=1 — ephemeral SESSION_SECRET (sessions reset on restart). Do not use publicly.'
    );
    return crypto.randomBytes(48).toString('hex');
  }

  console.error(
    '[security] Set SESSION_SECRET in .env to a random string of at least 32 characters.\n' +
      '  For local testing only you may set ALLOW_INSECURE_DEV=1.'
  );
  process.exit(1);
}

/** Safe internal redirect path only (blocks //evil.com open redirects). */
function safeInternalPath(raw, fallback = '/dashboard') {
  const next = String(raw || '').trim();
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//')) return fallback;
  if (next.includes('\\')) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(next)) return fallback;
  if (!/^\/[A-Za-z0-9/_?&=#.%+-]*$/.test(next)) return fallback;
  return next.slice(0, 512) || fallback;
}

/** JSON safe to embed inside a <script> tag. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const pwd = String(password || '');
  const saved = String(stored || '');
  if (!pwd || !saved) return { ok: false, needsRehash: false };

  if (saved.startsWith('scrypt$')) {
    const parts = saved.split('$');
    if (parts.length !== 3) return { ok: false, needsRehash: false };
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (!salt.length || expected.length !== 64) return { ok: false, needsRehash: false };
    const actual = crypto.scryptSync(pwd, salt, 64);
    try {
      return { ok: crypto.timingSafeEqual(actual, expected), needsRehash: false };
    } catch {
      return { ok: false, needsRehash: false };
    }
  }

  // Legacy plaintext — constant-time-ish compare, then migrate.
  const a = Buffer.from(pwd);
  const b = Buffer.from(saved);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return { ok: false, needsRehash: false };
  }
  const ok = crypto.timingSafeEqual(a, b);
  return { ok, needsRehash: ok };
}

function createOauthState() {
  return crypto.randomBytes(24).toString('hex');
}

/** localhost ↔ 127.0.0.1 ↔ [::1] with the same port (common local dashboard URLs). */
function expandLocalHostAliases(host) {
  if (!host) return [];
  const m = String(host).match(/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i);
  if (!m) return [host];
  const port = m[2] || '';
  return [`localhost${port}`, `127.0.0.1${port}`, `[::1]${port}`];
}

function buildAllowedHosts(requestHost, expectedHost) {
  const allowed = new Set();
  for (const h of [requestHost, expectedHost].filter(Boolean)) {
    for (const alias of expandLocalHostAliases(h)) allowed.add(alias.toLowerCase());
  }
  return allowed;
}

/**
 * Reject cross-site form POSTs (Origin / Referer). Complements SameSite cookies.
 * Allows the request Host and DASHBOARD_URL (plus localhost aliases).
 */
function originGuard(dashboardUrl) {
  let expectedHost = null;
  try {
    expectedHost = new URL(dashboardUrl).host;
  } catch {
    expectedHost = null;
  }

  return function originGuardMiddleware(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // Browsers (and some embeds) send the literal header Origin: null — truthy but not a URL.
    const rawOrigin = req.get('origin');
    const origin =
      !rawOrigin || String(rawOrigin).toLowerCase() === 'null' ? null : rawOrigin;
    const referer = req.get('referer');
    const host = req.get('host');
    const allowed = buildAllowedHosts(host, expectedHost);
    const dashboardHosts = buildAllowedHosts(null, expectedHost);

    const check = (urlStr) => {
      try {
        const h = new URL(urlStr).host.toLowerCase();
        return allowed.has(h);
      } catch {
        return false;
      }
    };

    if (origin) {
      return check(origin) ? next() : res.status(403).send('Forbidden');
    }

    if (referer) {
      return check(referer) ? next() : res.status(403).send('Forbidden');
    }

    // No usable Origin/Referer (incl. Origin: null). Allow when Host is our dashboard;
    // SameSite session cookies still block classic cross-site CSRF.
    if (host && dashboardHosts.size > 0 && dashboardHosts.has(String(host).toLowerCase())) {
      return next();
    }

    if (!isProductionLike()) return next();
    return res.status(403).send('Forbidden');
  };
}

module.exports = {
  BOT_INVITE_PERMISSIONS,
  isProductionLike,
  getSessionSecret,
  safeInternalPath,
  jsonForScript,
  hashPassword,
  verifyPassword,
  createOauthState,
  originGuard,
};
