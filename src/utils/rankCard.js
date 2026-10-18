'use strict';

/**
 * Generates a MEE6-style rank card image as a Buffer (PNG).
 * Only called for Estate plan users (levelCardImage feature).
 */

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const https = require('https');
const http = require('http');

// Preset gradient definitions (same keys as in server.js / levels.ejs)
const PRESET_GRADIENTS = {
  'preset:blue':   [[30, 58, 138], [59, 130, 246]],
  'preset:green':  [[20, 83, 45],  [34, 197, 94]],
  'preset:purple': [[88, 28, 135], [168, 85, 247]],
  'preset:dark':   [[15, 23, 42],  [30, 41, 59]],
  'preset:sunset': [[124, 45, 18], [249, 115, 22]],
  'preset:ocean':  [[12, 74, 110], [56, 189, 248]],
};

const DEFAULT_GRADIENT = [[17, 24, 39], [55, 65, 81]]; // dark slate fallback

async function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function rgbStr(r, g, b, a = 1) {
  if (a < 1) return `rgba(${r},${g},${b},${a})`;
  return `rgb(${r},${g},${b})`;
}

/**
 * Draw a rounded rectangle path.
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.discriminator  e.g. "0" or "1234"
 * @param {string} opts.avatarUrl
 * @param {number} opts.level
 * @param {number} opts.rank
 * @param {number} opts.currentXp      XP into current level
 * @param {number} opts.neededXp       XP needed for next level
 * @param {number} opts.totalXp
 * @param {string} [opts.backgroundUrl]  preset key or image URL
 * @param {string} [opts.accentColor]    hex color e.g. "#3b82f6"
 */
async function buildRankCardBuffer(opts) {
  const W = 934;
  const H = 282;
  const AVATAR_SIZE = 180;
  const AVATAR_X = 30;
  const AVATAR_Y = (H - AVATAR_SIZE) / 2;
  const PADDING_LEFT = AVATAR_X + AVATAR_SIZE + 30;
  const ACCENT = opts.accentColor || '#60a5fa';

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Background ───────────────────────────────────────────────────────────
  const bgUrl = opts.backgroundUrl || '';
  const presetColors = PRESET_GRADIENTS[bgUrl] || null;

  if (bgUrl && !bgUrl.startsWith('preset:')) {
    // Custom image background
    try {
      const imgBuf = await fetchBuffer(bgUrl);
      const img = await loadImage(imgBuf);
      ctx.drawImage(img, 0, 0, W, H);
      // Darken overlay so text stays readable
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
    } catch {
      drawGradientBg(ctx, W, H, DEFAULT_GRADIENT);
    }
  } else {
    const colors = presetColors || DEFAULT_GRADIENT;
    drawGradientBg(ctx, W, H, colors);
  }

  // ── Card glass panel ────────────────────────────────────────────────────
  ctx.save();
  roundRect(ctx, 16, 16, W - 32, H - 32, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  ctx.restore();

  // ── Avatar circle ────────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVATAR_X + AVATAR_SIZE / 2, H / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#1e293b';
  ctx.fill();

  // Avatar image
  if (opts.avatarUrl) {
    try {
      const avBuf = await fetchBuffer(opts.avatarUrl);
      const avImg = await loadImage(avBuf);
      ctx.save();
      ctx.beginPath();
      ctx.arc(AVATAR_X + AVATAR_SIZE / 2, H / 2, AVATAR_SIZE / 2 - 3, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avImg, AVATAR_X + 3, AVATAR_Y + 3, AVATAR_SIZE - 6, AVATAR_SIZE - 6);
      ctx.restore();
    } catch { /* keep placeholder */ }
  }

  // Avatar border
  ctx.beginPath();
  ctx.arc(AVATAR_X + AVATAR_SIZE / 2, H / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();

  // ── Username ─────────────────────────────────────────────────────────────
  const name = String(opts.username || 'User');
  const disc = opts.discriminator && opts.discriminator !== '0' ? `#${opts.discriminator}` : '';

  ctx.save();
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, PADDING_LEFT, 72);

  if (disc) {
    const nameW = ctx.measureText(name).width;
    ctx.font = '28px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(disc, PADDING_LEFT + nameW + 6, 72);
  }
  ctx.restore();

  // ── Rank & Level labels (top right) ─────────────────────────────────────
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`RANK`, W - 32, 62);
  ctx.font = 'bold 46px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`#${opts.rank}`, W - 32, 104);

  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`LEVEL`, W - 150, 62);
  ctx.font = 'bold 46px sans-serif';
  ctx.fillStyle = ACCENT;
  ctx.fillText(`${opts.level}`, W - 150, 104);
  ctx.restore();

  // ── XP text ──────────────────────────────────────────────────────────────
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '22px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`${opts.currentXp.toLocaleString()} / ${opts.neededXp.toLocaleString()} XP`, W - 32, 178);
  ctx.restore();

  // ── Progress bar ─────────────────────────────────────────────────────────
  const BAR_X = PADDING_LEFT;
  const BAR_Y = 190;
  const BAR_W = W - PADDING_LEFT - 32;
  const BAR_H = 28;
  const BAR_R = BAR_H / 2;
  const progress = opts.neededXp > 0 ? Math.max(0, Math.min(1, opts.currentXp / opts.neededXp)) : 0;

  // Track
  ctx.save();
  roundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, BAR_R);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();

  // Fill
  if (progress > 0) {
    const fillW = Math.max(BAR_H, progress * BAR_W);
    const grad = ctx.createLinearGradient(BAR_X, 0, BAR_X + fillW, 0);
    grad.addColorStop(0, ACCENT);
    grad.addColorStop(1, lighten(ACCENT, 0.3));
    roundRect(ctx, BAR_X, BAR_Y, fillW, BAR_H, BAR_R);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Glow on the fill edge
  if (progress > 0.02) {
    const cx2 = BAR_X + Math.max(BAR_H, progress * BAR_W);
    const glow = ctx.createRadialGradient(cx2, BAR_Y + BAR_H / 2, 0, cx2, BAR_Y + BAR_H / 2, BAR_H);
    glow.addColorStop(0, 'rgba(255,255,255,0.35)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx2 - BAR_H, BAR_Y, BAR_H * 2, BAR_H);
  }
  ctx.restore();

  // ── Total XP footer ──────────────────────────────────────────────────────
  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = '18px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(`Totaal: ${opts.totalXp.toLocaleString()} XP`, PADDING_LEFT, H - 22);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

function drawGradientBg(ctx, W, H, colors) {
  const [[r1, g1, b1], [r2, g2, b2]] = colors;
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, rgbStr(r1, g1, b1));
  grad.addColorStop(1, rgbStr(r2, g2, b2));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

/** Lighten a hex color by mixing toward white. */
function lighten(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const nr = lerp(r, 255, amount);
  const ng = lerp(g, 255, amount);
  const nb = lerp(b, 255, amount);
  return `rgb(${nr},${ng},${nb})`;
}

module.exports = { buildRankCardBuffer };
