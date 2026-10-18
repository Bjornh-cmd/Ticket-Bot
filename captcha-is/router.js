/**
 * Express router: mount inside YOUR website.
 *   const captchaIs = require('./captcha-is/router');
 *   app.use('/captcha-is', captchaIs);
 */
const path = require("path");
const express = require("express");
const {
  getSite,
  createChallenge,
  solveChallenge,
  siteverify,
  hostnameAllowed,
} = require("./lib");

function createRouter() {
  const router = express.Router();
  const publicDir = path.join(__dirname, "public");

  router.use(
    express.static(publicDir, {
      maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
      etag: true,
      index: false,
      setHeaders(res, filePath) {
        if (String(filePath).endsWith("api.js")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );

  router.get("/config", (req, res) => {
    const site = getSite();
    res.json({ success: true, sitekey: site.siteKey, mode: site.mode });
  });

  router.get("/api/config", (req, res) => {
    const site = getSite();
    res.json({ success: true, sitekey: site.siteKey, mode: site.mode });
  });

  router.post("/api/challenge", express.json(), (req, res) => {
    try {
      const site = getSite();
      const origin = req.get("origin") || "";
      let host = null;
      try {
        host = origin ? new URL(origin).hostname : req.hostname;
      } catch {
        host = req.hostname;
      }
      if (origin && !hostnameAllowed(host, site.domains)) {
        return res.status(403).json({ success: false, error: "domain-not-allowed" });
      }
      return res.json(createChallenge());
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "server-error" });
    }
  });

  router.post("/api/solve", express.json(), (req, res) => {
    try {
      const site = getSite();
      const origin = req.get("origin") || "";
      let host = "unknown";
      try {
        host = origin ? new URL(origin).hostname : req.hostname;
      } catch {
        host = req.hostname;
      }
      if (origin && !hostnameAllowed(host, site.domains)) {
        return res.status(403).json({ success: false, error: "domain-not-allowed" });
      }
      const body = req.body || {};
      const result = solveChallenge(body.challenge, body.answers || body.indices, host);
      const status = result.success ? 200 : 400;
      return res.status(status).json(result);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || "server-error" });
    }
  });

  router.post("/api/siteverify", express.json(), express.urlencoded({ extended: true }), (req, res) => {
    try {
      const body = req.body || {};
      const result = siteverify(body.secret || "", body.response || body.token || "");
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        success: false,
        "error-codes": ["internal-error"],
        error: err.message || "server-error",
      });
    }
  });

  // Alias paths matching the widget defaults when API_BASE is /captcha-is
  router.post("/challenge", (req, res, next) => {
    req.url = "/api/challenge";
    next();
  });

  return router;
}

module.exports = createRouter;
module.exports.createRouter = createRouter;
