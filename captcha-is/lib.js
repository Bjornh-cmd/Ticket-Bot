/**
 * Stoplichten image captcha — CommonJS core for Express websites.
 * No captcha.snubstad.nl — runs inside YOUR server.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const OBJECTS = ["stoplicht", "auto", "fiets", "oversteek", "bushalte"];
const IMAGES_PER_CATEGORY = 4;

const PROMPTS = {
  stoplicht: "Select all tiles with a traffic light",
  auto: "Select all tiles with a car",
  fiets: "Select all tiles with a bicycle",
  oversteek: "Select all tiles with a crosswalk",
  bushalte: "Select all tiles with a bus stop",
};

function getSigningSecret() {
  const s = process.env.CAPTCHA_IS_SIGNING_SECRET || process.env.CAPTCHA_SIGNING_SECRET || "";
  if (!s || s.length < 16) {
    throw new Error("Set CAPTCHA_IS_SIGNING_SECRET (min 16 chars) in .env");
  }
  return s;
}

function getSite() {
  const siteKey = process.env.CAPTCHA_IS_SITEKEY || "pk_image";
  const secret = process.env.CAPTCHA_IS_SECRET || "sk_image_change_me";
  const domains = String(process.env.CAPTCHA_IS_DOMAINS || "localhost,127.0.0.1")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return { siteKey, secret, domains, mode: "image" };
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}

function signPayload(payload) {
  const body = b64urlJson(payload);
  const sig = crypto.createHmac("sha256", getSigningSecret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return { ok: false, error: "invalid-token" };
  const [body, sigB64] = parts;
  const expected = crypto.createHmac("sha256", getSigningSecret()).update(body).digest();
  const got = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((sigB64.length % 4) || 4), "base64");
  // robust b64url decode:
  const pad = sigB64.length % 4 === 0 ? "" : "=".repeat(4 - (sigB64.length % 4));
  const gotBuf = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
  if (expected.length !== gotBuf.length || !crypto.timingSafeEqual(expected, gotBuf)) {
    return { ok: false, error: "bad-signature" };
  }
  let payload;
  try {
    const json = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/") + (body.length % 4 ? "=".repeat(4 - (body.length % 4)) : ""), "base64").toString("utf8");
    payload = JSON.parse(json);
  } catch {
    return { ok: false, error: "bad-payload" };
  }
  if (!payload.exp || Date.now() / 1000 > payload.exp) return { ok: false, error: "expired" };
  return { ok: true, payload };
}

function randomId(bytes = 16) {
  return b64url(crypto.randomBytes(bytes));
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedToInt(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function answerHashFor(seed, indices) {
  const sorted = [...indices].sort((a, b) => a - b).join(",");
  return sha256Hex(`${seed}:${sorted}`);
}

function generateImageChallenge(seed) {
  const rng = mulberry32(seedToInt(seed));
  const target = OBJECTS[Math.floor(rng() * OBJECTS.length)];
  const matchCount = 2 + Math.floor(rng() * 3);
  const answerSet = new Set();
  while (answerSet.size < matchCount) answerSet.add(Math.floor(rng() * 9));

  const used = new Set();
  const tiles = [];
  for (let i = 0; i < 9; i++) {
    let shape;
    if (answerSet.has(i)) shape = target;
    else {
      const others = OBJECTS.filter((s) => s !== target);
      shape = others[Math.floor(rng() * others.length)];
    }
    let n = 1 + Math.floor(rng() * IMAGES_PER_CATEGORY);
    let url = `/challenges/${shape}/${n}.jpg`;
    let tries = 0;
    while (used.has(url) && tries < 12) {
      n = 1 + Math.floor(rng() * IMAGES_PER_CATEGORY);
      url = `/challenges/${shape}/${n}.jpg`;
      tries++;
    }
    used.add(url);
    tiles.push({ i, url });
  }

  const answerIndices = [...answerSet].sort((a, b) => a - b);
  return {
    seed,
    target,
    prompt: PROMPTS[target],
    tiles,
    answerIndices,
    answerHash: answerHashFor(seed, answerIndices),
  };
}

function hostnameAllowed(hostname, domains) {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  return domains.some((d) => d === "*" || d === host || (d.startsWith("*.") && host.endsWith(d.slice(1))));
}

function createChallenge() {
  const site = getSite();
  const seed = randomId(12);
  const challenge = generateImageChallenge(seed);
  const now = Math.floor(Date.now() / 1000);
  const token = signPayload({
    typ: "image",
    sk: site.siteKey,
    seed: challenge.seed,
    ah: challenge.answerHash,
    target: challenge.target,
    exp: now + 120,
    jti: randomId(10),
  });
  return {
    success: true,
    type: "image",
    mode: "image",
    challenge: token,
    prompt: challenge.prompt,
    tiles: challenge.tiles,
    expires_in: 120,
  };
}

function solveChallenge(challengeToken, answers, hostname) {
  const site = getSite();
  const verified = verifyToken(challengeToken);
  if (!verified.ok) return { success: false, error: verified.error };
  const payload = verified.payload;
  if (payload.typ !== "image" || payload.sk !== site.siteKey) {
    return { success: false, error: "bad-challenge" };
  }
  let indices = answers;
  if (typeof answers === "string") {
    try {
      indices = JSON.parse(answers);
    } catch {
      return { success: false, error: "bad-answers" };
    }
  }
  if (!Array.isArray(indices)) return { success: false, error: "bad-answers" };
  const hash = answerHashFor(payload.seed, indices.map(Number));
  if (hash !== payload.ah) return { success: false, error: "image-failed" };

  const now = Math.floor(Date.now() / 1000);
  const response = signPayload({
    typ: "response",
    sk: site.siteKey,
    hn: hostname || "unknown",
    ts: new Date().toISOString(),
    exp: now + 300,
    jti: randomId(12),
  });
  return { success: true, response, expires_in: 300 };
}

function siteverify(secret, responseToken) {
  const site = getSite();
  if (secret !== site.secret) {
    return { success: false, "error-codes": ["invalid-input-secret"] };
  }
  const verified = verifyToken(responseToken);
  if (!verified.ok) {
    return {
      success: false,
      "error-codes": [verified.error === "expired" ? "timeout-or-duplicate" : "invalid-input-response"],
    };
  }
  const payload = verified.payload;
  if (payload.typ !== "response" || payload.sk !== site.siteKey) {
    return { success: false, "error-codes": ["invalid-input-response"] };
  }
  return {
    success: true,
    challenge_ts: payload.ts,
    hostname: payload.hn,
  };
}

function challengesDir() {
  return path.join(__dirname, "public", "challenges");
}

function ensureChallengesExist() {
  return fs.existsSync(path.join(challengesDir(), "stoplicht", "1.jpg"));
}

module.exports = {
  getSite,
  createChallenge,
  solveChallenge,
  siteverify,
  hostnameAllowed,
  challengesDir,
  ensureChallengesExist,
  verifyToken,
};
