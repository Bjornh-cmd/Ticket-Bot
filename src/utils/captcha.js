const path = require('path');

let captchaIs = null;
try {
  captchaIs = require(path.join(__dirname, '..', '..', 'captcha-is', 'lib'));
} catch {
  captchaIs = null;
}

function isCaptchaIsConfigured() {
  if (!captchaIs) return false;
  const signing = String(process.env.CAPTCHA_IS_SIGNING_SECRET || process.env.CAPTCHA_SIGNING_SECRET || '').trim();
  const secret = String(process.env.CAPTCHA_IS_SECRET || '').trim();
  if (signing.length < 16 || !secret) return false;
  try {
    return Boolean(captchaIs.ensureChallengesExist());
  } catch {
    return false;
  }
}

function getCaptchaIsSitekey() {
  if (!captchaIs) return 'pk_image';
  try {
    return captchaIs.getSite().siteKey || 'pk_image';
  } catch {
    return process.env.CAPTCHA_IS_SITEKEY || 'pk_image';
  }
}

function isCaptchaConfigured() {
  return isCaptchaIsConfigured();
}

function initCaptcha() {
  return isCaptchaConfigured();
}

function pickToken(body) {
  if (!body || typeof body !== 'object') return null;
  let token =
    body.captcha_token ??
    body['captcha-is-response'] ??
    body.captchaIsResponse ??
    null;
  if (Array.isArray(token)) {
    token = token.find((t) => typeof t === 'string' && String(t).trim()) || null;
  }
  if (typeof token !== 'string') return null;
  token = token.trim().replace(/ /g, '+');
  return token || null;
}

/**
 * Verify form captcha (Captcha is / stoplichten).
 * @param {import('express').Request | Record<string, unknown> | string} reqOrBody
 */
function verifyCaptchaToken(reqOrBody) {
  if (!isCaptchaIsConfigured()) return false;

  let token = null;
  if (typeof reqOrBody === 'string') {
    token = reqOrBody.trim().replace(/ /g, '+');
  } else if (reqOrBody && typeof reqOrBody === 'object') {
    const body =
      reqOrBody.body && typeof reqOrBody.body === 'object' ? reqOrBody.body : reqOrBody;
    token = pickToken(body);
  }
  if (!token) return false;

  try {
    const check = captchaIs.siteverify(process.env.CAPTCHA_IS_SECRET, token);
    return Boolean(check && check.success);
  } catch (err) {
    console.warn('[captcha] siteverify error:', err.message);
    return false;
  }
}

function markHuman(req) {
  req.session.humanVerifiedAt = Date.now();
}

function isHumanVerified(req, maxAgeMs = 30 * 60 * 1000) {
  const at = Number(req.session.humanVerifiedAt || 0);
  return Boolean(at && Date.now() - at < maxAgeMs);
}

function getCaptchaStatus() {
  return {
    provider: isCaptchaIsConfigured() ? 'captcha-is' : 'none',
    configured: isCaptchaConfigured(),
    captchaIs: isCaptchaIsConfigured(),
    sitekey: getCaptchaIsSitekey(),
  };
}

module.exports = {
  initCaptcha,
  isCaptchaConfigured,
  isCaptchaIsConfigured,
  getCaptchaIsSitekey,
  verifyCaptchaToken,
  markHuman,
  isHumanVerified,
  getCaptchaStatus,
};
