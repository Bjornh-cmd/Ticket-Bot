const { getDataDir } = require('../utils/runtimeEnv');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const {
  db,
  getGuildSettings,
  updateGuildSettings,
  getTicketTypes,
  addTicketType,
  updateTicketType,
  deleteTicketType,
  getCustomPrefixCommands,
  getCustomPrefixCommand,
  countCustomPrefixCommands,
  addCustomPrefixCommand,
  updateCustomPrefixCommand,
  deleteCustomPrefixCommand,
  createPoll,
  getPoll,
  getPollOptions,
  setPollMessage,
  listGuildPolls,
  createGiveaway,
  getGiveaway,
  deleteGiveaway,
  setGiveawayMessage,
  listGuildGiveaways,
  getGiveawayEntryCount,
  linkGuild,
  unlinkGuild,
  isGuildLinked,
  getLinkedGuild,
  getUserAccount,
  touchUserAccount,
  setUserPlan,
  listUserAccounts,
  searchUserAccounts,
  listLinkedGuildsByUser,
  isValidDiscordUserId,
  countLinkedByUser,
  reclaimOrphanLinkedGuilds,
  listPanelStaff,
  countPanelStaff,
  isPanelStaff,
  addPanelStaff,
  removePanelStaff,
  listGuildsForPanelUser,
  listLinkedGuilds,
  getRolePermissionMap,
  setRolePermissions,
  listRolePermissions,
  listPlanDefinitions,
  savePlanDefinition,
  getPlanDefinition,
  getLinkLoginConfig,
  saveLinkLoginConfig,
  verifyLinkLoginPassword,
  getGuildLinkLogin,
  getGuildLinkLoginBySlug,
  saveGuildLinkLogin,
  verifyGuildLinkLoginPassword,
  deleteGuildLinkLogin,
  listGuildDisabledCommands,
  setGuildCommandDisabled,
  listUserDisabledCommands,
  setUserCommandDisabled,
  listUsersWithCommandOverrides,
  getGuildHealthStats,
  createSupportThread,
  addSupportMessage,
  getSupportThread,
  listSupportMessages,
  listSupportThreadsForUser,
  listOpenSupportThreads,
  listRecentSupportThreads,
  searchSupportThreads,
  setSupportThreadStatus,
  deleteSupportThread,
  countOpenSupportThreads,
  getLevelProfile,
  setLevelBackground,
} = require('../database/db');
const {
  isOwner,
  isPlatformAdmin,
  isGuildAllowed,
  botInviteUrl,
  botCanPostInChannel,
  oauthHasGuildOwnerPower,
  memberHasGuildOwnerPower,
} = require('../utils/helpers');
const { buildTicketPanelPayload } = require('../tickets/panel');
const { closeTicketChannel } = require('../tickets/handlers');
const { sendNativePoll } = require('../utils/polls');
const { flashFromDiscordError } = require('../utils/discordErrors');
const { ensureTicketCategoryPermissions } = require('../utils/botRoleSetup');
const {
  buildGiveawayEmbed,
  buildGiveawayButtons,
  finishGiveaway,
} = require('../utils/giveaways');
const { deployGuildCommands, clearGuildCommands } = require('../utils/deployCommands');
const { assertSafeAvatar, MAX_AVATAR_BYTES } = require('../utils/safeAvatar');
const { levelsEnabledForGuild, levelProgress } = require('../utils/levels');
const {
  getSessionSecret,
  safeInternalPath,
  jsonForScript,
  createOauthState,
  originGuard,
  isProductionLike,
} = require('../utils/security');
const { buildErrorView, verifyPayload, sendErrorWebhook } = require('../utils/errorPage');
const {
  initCaptcha,
  isCaptchaConfigured,
  isCaptchaIsConfigured,
  getCaptchaIsSitekey,
  verifyCaptchaToken,
  markHuman,
  isHumanVerified,
  getCaptchaStatus,
} = require('../utils/captcha');
const captchaIsRouter = require('../../captcha-is/router');
const { SqliteSessionStore } = require('../utils/sqliteSessionStore');
const { LOCALES, normalizeLocale, defaultLocale, td, getDashboardStrings } = require('../i18n');
const {
  BOT_MAP_OPTIONS,
  DEFAULT_BLUEPRINT,
  LAYOUT_TEMPLATE,
  TICKET_CATEGORY,
  flattenSlots,
  parseLayout,
  parseBlueprint,
  blueprintFromFormBody,
  settingsPatchFromLayout,
  createServerLayout,
} = require('../utils/serverLayout');
const {
  PLANS,
  ESTATE_PACKS,
  FEATURE_ROWS,
  FEATURE_KEYS,
  resolvePlan,
  hasFeature,
  clampEstateServers,
  estatePriceForServers,
  maxPanelStaffForPlan,
  maxCustomPrefixCommands,
} = require('../utils/plans');
const { normalizeTrigger } = require('../utils/customPrefixCommands');
const {
  ROLE_FUNCTIONS,
  exceedsServerLimit,
  atServerLimit,
} = require('../utils/permissions');

/** Avoid hammering Discord GUILD_MEMBERS (opcode 8) on every dashboard reload. */
const memberFetchState = new Map(); // guildId -> { at, blockedUntil }

async function ensureGuildMembers(guild, { force = false } = {}) {
  if (!guild) return;
  const now = Date.now();
  const state = memberFetchState.get(guild.id) || { at: 0, blockedUntil: 0 };
  if (now < state.blockedUntil) return;

  const cacheSize = guild.members.cache.size;
  const COOLDOWN_MS = 5 * 60 * 1000;

  if (!force) {
    if (state.at && now - state.at < COOLDOWN_MS) return;
    // Cache already usable (gateway chunks) → don't full-fetch on each Aan/Uit reload
    if (cacheSize > 1) {
      memberFetchState.set(guild.id, { at: now, blockedUntil: 0 });
      return;
    }
  }

  try {
    await guild.members.fetch();
    memberFetchState.set(guild.id, { at: Date.now(), blockedUntil: 0 });
  } catch (err) {
    const retry = /Retry after (\d+)/i.exec(err.message || '');
    const waitMs = ((retry ? Number(retry[1]) : 30) + 5) * 1000;
    memberFetchState.set(guild.id, {
      at: state.at,
      blockedUntil: now + waitMs,
    });
    console.warn(`Members fetch failed (${guild.name || guild.id}): ${err.message}`);
  }
}

function membersListFromGuild(guild) {
  if (!guild) return [];
  return [...guild.members.cache.values()]
    .filter((m) => !m.user.bot)
    .map((m) => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName || m.user.globalName || m.user.username,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'nl'));
}

function createDashboard(client) {
  const app = express();
  const port = Number(process.env.PORT || process.env.DASHBOARD_PORT || 3000);
  const dashboardUrl = process.env.DASHBOARD_URL || `http://localhost:${port}`;
  const dataDir = getDataDir();
  const avatarUploadDir = path.join(dataDir, 'uploads', 'guild-avatars');
  const levelBgDir = path.join(dataDir, 'uploads', 'level-bg');
  fs.mkdirSync(avatarUploadDir, { recursive: true });
  fs.mkdirSync(levelBgDir, { recursive: true });

  const helmet = require('helmet');
  const rateLimit = require('express-rate-limit');
  const sessionSecret = getSessionSecret();
  // Secure cookies only on HTTPS — NODE_ENV=production + http://localhost breaks OAuth sessions
  const secureCookies = String(dashboardUrl).startsWith('https://') || process.env.COOKIE_SECURE === '1';

  if (secureCookies || isProductionLike()) {
    app.set('trust proxy', 1);
  }

  const uploadAvatar = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    fileFilter(req, file, cb) {
      const name = String(file.originalname || '').toLowerCase();
      const mime = String(file.mimetype || '').toLowerCase();
      const extOk =
        name.endsWith('.png') ||
        name.endsWith('.ico') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.gif') ||
        name.endsWith('.webp');
      if (!extOk) return cb(new Error('Only image files allowed'));
      const mimeOk =
        !mime ||
        mime === 'image/png' ||
        mime === 'image/jpeg' ||
        mime === 'image/gif' ||
        mime === 'image/webp' ||
        mime === 'image/x-icon' ||
        mime === 'image/vnd.microsoft.icon' ||
        mime === 'application/octet-stream';
      if (!mimeOk) return cb(new Error('Unsupported image type'));
      cb(null, true);
    },
  }).single('avatar_file');

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, service: 'reedhall' });
  });

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  if (!isProductionLike()) {
    app.set('view cache', false);
  }
  const crypto = require('crypto');

  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  // form-action disabled: Cursor/embedded inspectors often block 'self' form posts to localhost.
  // CSRF is still covered by SameSite cookies + originGuard.
  const formActionOrigins = null;

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": [
            "'self'",
            (req, res) => `'nonce-${res.locals.cspNonce}'`,
            "'wasm-unsafe-eval'",
          ],
          "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          "font-src": ["'self'", 'https://fonts.gstatic.com', 'data:'],
          "img-src": ["'self'", 'data:', 'https://cdn.discordapp.com', 'https://i.imgur.com'],
          "connect-src": ["'self'"],
          "worker-src": ["'self'", 'blob:'],
          "child-src": ["'self'", 'blob:'],
          "object-src": ["'none'"],
          "base-uri": ["'self'"],
          // Cursor/embedded browsers can treat form posts as cross-origin vs plain 'self'
          "form-action": formActionOrigins,
          "frame-ancestors": ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));
  // Uploaded level backgrounds
  app.use('/level-bg', express.static(levelBgDir, { maxAge: '7d', etag: true }));
  app.use(
    '/level-bg',
    express.static(path.join(__dirname, 'public', 'level-bg'), { maxAge: '7d', etag: true })
  );

  // Ensure Captcha is accepts this dashboard host (plus localhost).
  try {
    const dashHost = new URL(dashboardUrl).hostname.toLowerCase();
    const domainSet = new Set(
      String(process.env.CAPTCHA_IS_DOMAINS || 'localhost,127.0.0.1')
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    );
    domainSet.add('localhost');
    domainSet.add('127.0.0.1');
    if (dashHost) domainSet.add(dashHost);
    process.env.CAPTCHA_IS_DOMAINS = [...domainSet].join(',');
  } catch {
    /* ignore */
  }
  app.use('/captcha-is', captchaIsRouter());

  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(
    session({
      name: 'reedhall.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new SqliteSessionStore({
        dbPath: path.join(dataDir, 'sessions.sqlite'),
      }),
      cookie: {
        httpOnly: true,
        secure: secureCookies,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );
  app.use(originGuard(dashboardUrl));

  const isLocalClient = (req) => {
    const ip = String(req.ip || '');
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1' ||
      ip.endsWith('127.0.0.1')
    );
  };

  const authPageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalClient,
    message: 'Too many requests. Try again later.',
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalClient,
    message: 'Too many login attempts. Try again later.',
  });
  const linkLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isLocalClient,
    message: 'Too many login attempts. Try again later.',
  });
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many uploads. Try again later.',
  });

  /** Fix orphan linked_by rows (recovery / env) for guilds this user owns, then return plan usage. */
  async function syncUsedServers(req) {
    const userId = String(req.session.user.id);
    try {
      const oauthGuilds = await fetchUserGuilds(req);
      const reclaimIds = new Set(oauthGuilds.filter((g) => Boolean(g.owner)).map((g) => g.id));
      for (const g of oauthGuilds) {
        const botGuild = client.guilds.cache.get(g.id);
        if (botGuild && String(botGuild.ownerId) === userId) reclaimIds.add(g.id);
      }
      reclaimOrphanLinkedGuilds(userId, [...reclaimIds]);
    } catch (err) {
      console.warn('reclaim orphan links:', err.message);
    }
    return countLinkedByUser(userId);
  }

  function statsForGuildIds(guildIds) {
    const ids = (guildIds || []).map(String).filter(Boolean);
    if (!ids.length) {
      return {
        ticketsOpen: 0,
        ticketsTotal: 0,
        warns: 0,
        actions: 0,
        recentTickets: [],
      };
    }
    const ph = ids.map(() => '?').join(',');
    return {
      ticketsOpen: db
        .prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'open' AND guild_id IN (${ph})`)
        .get(...ids).c,
      ticketsTotal: db
        .prepare(`SELECT COUNT(*) AS c FROM tickets WHERE guild_id IN (${ph})`)
        .get(...ids).c,
      warns: db
        .prepare(`SELECT COUNT(*) AS c FROM warnings WHERE active = 1 AND guild_id IN (${ph})`)
        .get(...ids).c,
      actions: db
        .prepare(`SELECT COUNT(*) AS c FROM mod_actions WHERE guild_id IN (${ph})`)
        .get(...ids).c,
      recentTickets: db
        .prepare(
          `SELECT id, guild_id, subject, status, ticket_number, opener_id, created_at
           FROM tickets WHERE guild_id IN (${ph})
           ORDER BY datetime(created_at) DESC LIMIT 8`
        )
        .all(...ids),
    };
  }

  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.bot = client.user;
    res.locals.isAdmin = Boolean(req.session.user && isPlatformAdmin(req.session.user));
    res.locals.jsonForScript = jsonForScript;
    res.locals.captchaReady = isCaptchaConfigured();
    res.locals.capReady = isCaptchaConfigured();
    res.locals.altchaReady = isCaptchaConfigured();
    res.locals.captchaIsReady = isCaptchaIsConfigured();
    res.locals.captchaIsSitekey = getCaptchaIsSitekey();
    const link = getLinkLoginConfig();
    res.locals.linkLogin = {
      enabled: link.enabled,
      pathSlug: link.pathSlug,
      // never expose password/hash to templates
    };
    res.locals.originalUrl = safeInternalPath(req.originalUrl || req.url || '/', '/');
    next();
  });

  function renderError(req, res, opts = {}) {
    const view = buildErrorView({
      ...opts,
      path: opts.path || req.originalUrl || req.url || '/',
    });
    return res.status(view.status).render('error', {
      ...view,
      user: res.locals.user || null,
      capReady: isCaptchaConfigured(),
      captchaReady: isCaptchaConfigured(),
      captchaIsReady: isCaptchaIsConfigured(),
      captchaIsSitekey: getCaptchaIsSitekey(),
    });
  }

  function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
  }

  function guildAllowed(guildId) {
    return isGuildAllowed(guildId);
  }

  function botGuildMeta(guild) {
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      owner: true,
    };
  }

  async function refreshAccessToken(req) {
    const refresh = req.session.user?.refreshToken;
    if (!refresh) return false;
    try {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refresh,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return false;
      req.session.user.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) req.session.user.refreshToken = tokenData.refresh_token;
      return true;
    } catch {
      return false;
    }
  }

  async function fetchUserGuilds(req) {
    const cached = req.session.oauthGuildsCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.guilds;
    }

    let accessToken = req.session.user.accessToken;
    if (!accessToken) return [];

    async function run(token) {
      return fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    let response = await run(accessToken);
    if (!response.ok && response.status === 401) {
      if (await refreshAccessToken(req)) {
        accessToken = req.session.user.accessToken;
        response = await run(accessToken);
      }
    }
    if (!response.ok) return cached?.guilds || [];

    const guilds = await response.json();
    req.session.oauthGuildsCache = {
      guilds,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    return guilds;
  }

  function canManageOauthGuild(g, userId) {
    return oauthHasGuildOwnerPower(g) || isOwner(userId);
  }

  /** Servers die de user mag beheren in Reedhall (gekoppeld + bot erin + toegang). */
  async function getManagedGuilds(req) {
    const user = req.session.user;
    if (user?.viaLink && user.linkGuildId) {
      const gid = String(user.linkGuildId);
      if (!guildAllowed(gid)) return [];
      const guild = client.guilds.cache.get(gid);
      if (!guild) return [];
      return [{ ...botGuildMeta(guild), access: 'staff', viaLink: true }];
    }

    const userId = String(user.id);
    const map = new Map();
    const staffGuildIds = new Set(listGuildsForPanelUser(userId));
    const admin = isPlatformAdmin(req.session.user);

    for (const guild of client.guilds.cache.values()) {
      if (!guildAllowed(guild.id)) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      const ownerPower = memberHasGuildOwnerPower(member, guild);
      const staff = staffGuildIds.has(guild.id);
      if (admin || ownerPower || isOwner(userId) || staff) {
        map.set(guild.id, {
          ...botGuildMeta(guild),
          access: admin || ownerPower || isOwner(userId) ? 'owner' : 'staff',
        });
      }
    }

    const oauthGuilds = await fetchUserGuilds(req);
    for (const g of oauthGuilds) {
      if (!guildAllowed(g.id)) continue;
      if (!client.guilds.cache.has(g.id)) continue;
      if (canManageOauthGuild(g, userId) || staffGuildIds.has(g.id) || admin) {
        if (!map.has(g.id)) {
          map.set(g.id, {
            id: g.id,
            name: g.name,
            icon: g.icon,
            owner: Boolean(g.owner),
            access: oauthHasGuildOwnerPower(g) || admin ? 'owner' : 'staff',
          });
        }
      }
    }

    return [...map.values()];
  }

  /** Alle servers van de user (owner/admin) om te koppelen — geen handmatige IDs. */
  async function getConnectableGuilds(req) {
    const userId = req.session.user.id;
    const oauthGuilds = await fetchUserGuilds(req);
    return oauthGuilds
      .filter((g) => canManageOauthGuild(g, userId))
      .map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: Boolean(g.owner),
        linked: isGuildLinked(g.id),
        botIn: client.guilds.cache.has(g.id),
        inviteUrl: botInviteUrl(g.id),
      }));
  }

  async function requireGuildAccess(req, res) {
    const guildId = req.params.id;
    if (!guildAllowed(guildId)) {
      renderError(req, res, {
        status: 403,
        code: 'guild_not_linked',
        title: 'Server not linked',
        message: 'This server is not linked yet. Open Servers and click Connect.',
      });
      return null;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      renderError(req, res, {
        status: 403,
        code: 'bot_not_in_guild',
        title: 'Bot not in server',
        message: 'Reedhall is not in this server yet. Invite the bot first, then try again.',
      });
      return null;
    }

    const user = req.session.user;
    const userId = String(user.id);

    // Password link-login: locked to one guild only
    if (user?.viaLink && user.linkGuildId) {
      if (String(user.linkGuildId) !== String(guildId)) {
        renderError(req, res, {
          status: 403,
          code: 'link_guild_only',
          title: 'Access denied',
          message: 'This link-login session can only open its assigned server.',
        });
        return null;
      }
      return { ...botGuildMeta(guild), isGuildOwner: false, isStaff: true, viaLink: true };
    }

    // Platform admins / BOT_OWNER_IDS
    if (isPlatformAdmin(req.session.user) || isOwner(userId)) {
      return { ...botGuildMeta(guild), isGuildOwner: true };
    }

    // Discord owner / Administrator / Manage Server — automatic, no ID lists
    const member = await guild.members.fetch(userId).catch(() => null);
    if (memberHasGuildOwnerPower(member, guild)) {
      return { ...botGuildMeta(guild), isGuildOwner: true };
    }

    if (isPanelStaff(guildId, userId)) {
      return { ...botGuildMeta(guild), isGuildOwner: false, isStaff: true };
    }

    // OAuth fallback (same Discord roles, no manual IDs)
    const oauthGuilds = await fetchUserGuilds(req);
    const oauth = oauthGuilds.find((g) => g.id === guildId);
    if (oauth && oauthHasGuildOwnerPower(oauth)) {
      return {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: Boolean(oauth.owner),
        isGuildOwner: true,
      };
    }

    renderError(req, res, {
      status: 403,
      code: 'panel_access_denied',
      title: 'Access denied',
      message:
        'No panel access. You need Discord Owner, Administrator, or Manage Server — or a panel invite from the owner.',
    });
    return null;
  }

  function planForUser(userId) {
    return resolvePlan(getUserAccount(String(userId)));
  }

  function planForGuild(guildId) {
    const guild = client.guilds.cache.get(guildId);
    // Plan volgt de Discord server-owner (klant), niet per se wie koppelde
    if (guild?.ownerId) {
      return planForUser(guild.ownerId);
    }
    const linked = getLinkedGuild(guildId);
    if (!linked?.linked_by) return resolvePlan(null);
    return planForUser(linked.linked_by);
  }

  function requirePlatformAdmin(req, res, next) {
    if (!req.session.user) return res.redirect('/login?next=/admin');
    if (req.session.user.viaLink || !isPlatformAdmin(req.session.user)) {
      return renderError(req, res, {
        status: 404,
        code: 'not_found',
        title: 'Page not found',
        message: 'This page does not exist or was moved.',
      });
    }
    next();
  }

  app.get('/', (req, res) => {
    res.render('home', {
      title: 'Reedhall',
      loggedIn: Boolean(req.session.user),
      estatePacks: ESTATE_PACKS,
      featureRows: FEATURE_ROWS,
      plans: PLANS,
    });
  });

  app.get('/login', authPageLimiter, (req, res) => {
    if (req.query.next) req.session.afterLogin = safeInternalPath(req.query.next);
    const link = getLinkLoginConfig();
    // Discord OAuth only after CAPTCHA POST (/login/discord)
    if (req.query.discord === '1') {
      if (!isHumanVerified(req)) {
        return res.redirect('/login?flash=captcha');
      }
      const state = createOauthState();
      req.session.oauthState = state;
      return req.session.save((err) => {
        if (err) {
          console.error('Session save before OAuth failed:', err.message);
          return res.redirect('/login?flash=oauth_failed');
        }
        const params = new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          redirect_uri: `${dashboardUrl}/auth/callback`,
          response_type: 'code',
          scope: 'identify guilds',
          state,
        });
        return res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
      });
    }
    res.render('login', {
      title: 'Log in',
      linkLogin: { enabled: link.enabled, pathSlug: link.pathSlug },
      flash: req.query.flash || null,
      linkUrl: `${dashboardUrl}/l/${link.pathSlug}`,
      capReady: isCaptchaConfigured(),
    });
  });

  app.post('/login/discord', authLimiter, async (req, res) => {
    const ok = verifyCaptchaToken(req);
    if (!ok) {
      console.warn(
        '[captcha] login rejected; keys=',
        Object.keys(req.body || {}),
        'tokenLen=',
        String(req.body?.captcha_token || req.body?.['captcha-is-response'] || '').length
      );
      return res.redirect('/login?flash=captcha');
    }
    markHuman(req);
    const state = createOauthState();
    req.session.oauthState = state;
    return req.session.save((err) => {
      if (err) {
        console.error('Session save before OAuth failed:', err.message);
        return res.redirect('/login?flash=oauth_failed');
      }
      const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        redirect_uri: `${dashboardUrl}/auth/callback`,
        response_type: 'code',
        scope: 'identify guilds',
        state,
      });
      return res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
    });
  });

  app.get('/l/:slug', linkLoginLimiter, (req, res) => {
    const slug = String(req.params.slug || '');
    const guildLink = getGuildLinkLoginBySlug(slug);
    if (guildLink) {
      const guild = client.guilds.cache.get(guildLink.guildId);
      return res.render('login-link', {
        title: 'Link login',
        slug: guildLink.pathSlug,
        guildName: guild?.name || 'Reedhall server',
        flash: req.query.flash || null,
        capReady: isCaptchaConfigured(),
      });
    }

    const link = getLinkLoginConfig();
    if (!link.enabled || req.params.slug !== link.pathSlug) {
      return renderError(req, res, {
        status: 404,
        code: 'link_not_found',
        title: 'Link not found',
        message: 'This login link does not exist or was disabled.',
      });
    }
    res.render('login-link', {
      title: 'Link login',
      slug: link.pathSlug,
      guildName: null,
      flash: req.query.flash || null,
      capReady: isCaptchaConfigured(),
    });
  });

  app.post('/l/:slug', linkLoginLimiter, async (req, res) => {
    const slug = String(req.params.slug || '');
    const guildLink = getGuildLinkLoginBySlug(slug);

    if (guildLink) {
      const ok = verifyCaptchaToken(req);
      if (!ok) {
        return res.redirect(`/l/${guildLink.pathSlug}?flash=captcha`);
      }
      if (!guildLink.hasPassword || !verifyGuildLinkLoginPassword(guildLink.guildId, req.body.password)) {
        return res.redirect(`/l/${guildLink.pathSlug}?flash=bad_password`);
      }
      if (!guildAllowed(guildLink.guildId) || !client.guilds.cache.has(guildLink.guildId)) {
        return res.redirect(`/l/${guildLink.pathSlug}?flash=bad_config`);
      }

      const guild = client.guilds.cache.get(guildLink.guildId);
      const ownerId = guild?.ownerId || '0';
      markHuman(req);
      req.session.user = {
        id: String(ownerId),
        username: 'link-login',
        global_name: `${guild?.name || 'Server'} link`,
        avatar: null,
        accessToken: null,
        refreshToken: null,
        viaLink: true,
        linkGuildId: String(guildLink.guildId),
      };
      touchUserAccount(ownerId, 'link-login');
      return res.redirect(`/guild/${guildLink.guildId}`);
    }

    const link = getLinkLoginConfig();
    if (!link.enabled || req.params.slug !== link.pathSlug) {
      return renderError(req, res, {
        status: 404,
        code: 'link_not_found',
        title: 'Link not found',
        message: 'This login link does not exist or was disabled.',
      });
    }
    const ok = verifyCaptchaToken(req);
    if (!ok) {
      return res.redirect(`/l/${link.pathSlug}?flash=captcha`);
    }
    if (!link.hasPassword || !verifyLinkLoginPassword(req.body.password)) {
      return res.redirect(`/l/${link.pathSlug}?flash=bad_password`);
    }
    if (!isValidDiscordUserId(link.userId)) {
      return res.redirect(`/l/${link.pathSlug}?flash=bad_config`);
    }

    markHuman(req);
    const account = getUserAccount(link.userId);
    req.session.user = {
      id: String(link.userId),
      username: account.username || 'link-login',
      global_name: account.username || 'Link login',
      avatar: null,
      accessToken: null,
      refreshToken: null,
      viaLink: true,
      linkGuildId: null,
    };
    touchUserAccount(link.userId, account.username || 'link-login');
    res.redirect('/dashboard');
  });

  app.get('/auth/callback', authLimiter, async (req, res) => {
    const code = req.query.code;
    const state = String(req.query.state || '');
    const expected = String(req.session.oauthState || '');
    delete req.session.oauthState;
    if (!code || !expected || state !== expected) {
      return res.redirect('/login?flash=oauth_failed');
    }

    try {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: String(code),
          redirect_uri: `${dashboardUrl}/auth/callback`,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        console.error('OAuth token exchange failed');
        return res.redirect('/login?flash=oauth_failed');
      }

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const user = await userRes.json();
      if (!user?.id) {
        return res.redirect('/login?flash=oauth_failed');
      }

      req.session.user = {
        id: String(user.id),
        username: user.username,
        global_name: user.global_name,
        avatar: user.avatar,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        viaLink: false,
      };
      touchUserAccount(user.id, user.username);
      delete req.session.oauthGuildsCache;
      const next = safeInternalPath(req.session.afterLogin, '/servers');
      delete req.session.afterLogin;
      res.redirect(next);
    } catch (err) {
      console.error('OAuth callback error:', err.message);
      res.redirect('/login?flash=oauth_failed');
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });

  app.get('/dashboard', requireAuth, async (req, res) => {
    if (req.session.user?.viaLink && req.session.user.linkGuildId) {
      return res.redirect(`/guild/${req.session.user.linkGuildId}`);
    }
    const usedServers = await syncUsedServers(req);
    const guilds = await getManagedGuilds(req);
    const plan = planForUser(req.session.user.id);
    const stats = statsForGuildIds(guilds.map((g) => g.id));
    const guildNameById = Object.fromEntries(guilds.map((g) => [String(g.id), g.name]));
    res.render('dashboard', {
      title: 'Dashboard',
      guilds,
      stats,
      plan,
      usedServers,
      guildNameById,
      recentTickets: stats.recentTickets,
    });
  });

  app.get('/account', requireAuth, async (req, res) => {
    const usedServers = await syncUsedServers(req);
    const account = getUserAccount(req.session.user.id);
    const plan = planForUser(req.session.user.id);
    const linkedMine = listLinkedGuildsByUser(req.session.user.id);
    res.render('account', {
      title: 'Plan',
      account,
      plan,
      estatePacks: ESTATE_PACKS,
      estatePricePreview: estatePriceForServers(account.estate_servers || 10),
      usedServers,
      linkedMine,
      flash: req.query.flash || null,
    });
  });

  app.post('/account/plan', requireAuth, (req, res) => {
    // Public self-service upgrades disabled — plans are set by platform admins only.
    return res.redirect('/account?flash=plan_locked');
  });

  app.get('/leden/levels/:id', requireAuth, async (req, res) => {
    const access = await requireGuildAccess(req, res);
    if (!access) return;
    const guildId = String(req.params.id);
    const guild = client.guilds.cache.get(guildId);
    const member =
      guild?.members?.cache?.get(req.session.user.id) ||
      (await guild?.members?.fetch(req.session.user.id).catch(() => null));
    if (!guild || !member) {
      return renderError(req, res, {
        status: 404,
        code: 'guild_not_found',
        title: 'Server not found',
        message: 'Open this page from a linked server where you have access.',
      });
    }
    const { enabled, plan } = levelsEnabledForGuild(guildId, client);
    const profile = getLevelProfile(guildId, req.session.user.id);
    const progress = levelProgress(profile);
    const settings = getGuildSettings(guildId);
    const isPaid = plan && (plan.id === 'desk' || plan.id === 'estate');
    const features = {
      xpMultiplier: hasFeature(plan, 'xpMultiplier'),
      customBotStatus: hasFeature(plan, 'customBotStatus'),
      levelCardImage: hasFeature(plan, 'levelCardImage'),
      autoModAI: hasFeature(plan, 'autoModAI'),
    };
    const PRESETS = [
      { label: 'Blauw verloop', value: 'preset:blue', css: 'linear-gradient(135deg,#1e3a8a,#3b82f6)' },
      { label: 'Groen verloop', value: 'preset:green', css: 'linear-gradient(135deg,#14532d,#22c55e)' },
      { label: 'Paars verloop', value: 'preset:purple', css: 'linear-gradient(135deg,#581c87,#a855f7)' },
      { label: 'Donker', value: 'preset:dark', css: 'linear-gradient(135deg,#0f172a,#1e293b)' },
      { label: 'Zonsondergang', value: 'preset:sunset', css: 'linear-gradient(135deg,#7c2d12,#f97316)' },
      { label: 'Oceaan', value: 'preset:ocean', css: 'linear-gradient(135deg,#0c4a6e,#38bdf8)' },
    ];
    res.render('levels', {
      title: `${guild.name} · Levels`,
      guild,
      plan,
      enabled,
      profile,
      progress,
      isPaid,
      features,
      settings,
      presets: PRESETS,
      flash: req.query.flash || null,
    });
  });

  const uploadLevelBg = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, cb) {
      const name = String(file.originalname || '').toLowerCase();
      const mime = String(file.mimetype || '').toLowerCase();
      const ok =
        name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') ||
        name.endsWith('.webp') || name.endsWith('.gif') ||
        mime.startsWith('image/');
      cb(null, ok);
    },
  }).single('background_file');

  app.post('/leden/levels/:id', requireAuth, async (req, res) => {
    const access = await requireGuildAccess(req, res);
    if (!access) return;
    const guildId = String(req.params.id);
    const { enabled } = levelsEnabledForGuild(guildId, client);
    if (!enabled) {
      return res.redirect(`/leden/levels/${guildId}?flash=plan_locked`);
    }

    // File upload — only available if plan supports it (levels = Desk+)
    uploadLevelBg(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.redirect(`/leden/levels/${guildId}?flash=bad_file`);
      }

      // With multipart/form-data body fields are available after multer runs
      const preset = String(req.body.preset || '').trim();
      const bg = String(req.body.background_url || '').trim();

      let finalUrl = '';

      if (req.file) {
        if (!fs.existsSync(levelBgDir)) fs.mkdirSync(levelBgDir, { recursive: true });
        const ext = path.extname(req.file.originalname || '.png').toLowerCase() || '.png';
        const fileName = `${guildId}_${req.session.user.id}_${Date.now()}${ext}`;
        fs.writeFileSync(path.join(levelBgDir, fileName), req.file.buffer);
        const dashUrl = (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
        finalUrl = `${dashUrl}/level-bg/${fileName}`;
      } else if (preset) {
        finalUrl = preset;
      } else if (bg) {
        if (!/^https?:\/\/\S+$/i.test(bg)) {
          return res.redirect(`/leden/levels/${guildId}?flash=bad_url`);
        }
        finalUrl = bg;
      }

      setLevelBackground(guildId, req.session.user.id, finalUrl);
      res.redirect(`/leden/levels/${guildId}?flash=saved`);
    });
  });

  // Estate settings (XP multiplier, bot status)
  app.post('/leden/levels/:id/settings', requireAuth, async (req, res) => {
    const access = await requireGuildAccess(req, res);
    if (!access) return;
    const guildId = String(req.params.id);
    const { enabled, plan } = levelsEnabledForGuild(guildId, client);
    if (!enabled) return res.redirect(`/leden/levels/${guildId}?flash=plan_locked`);

    const patch = {};
    if (hasFeature(plan, 'xpMultiplier') && req.body.xp_multiplier != null) {
      const mult = Math.max(1, Math.min(5, parseFloat(req.body.xp_multiplier) || 1));
      patch.xp_multiplier = mult;
    }
    if (hasFeature(plan, 'customBotStatus') && req.body.bot_status_text != null) {
      patch.bot_status_text = String(req.body.bot_status_text || '').slice(0, 128);
    }
    if (Object.keys(patch).length) updateGuildSettings(guildId, patch);
    res.redirect(`/leden/levels/${guildId}?flash=saved`);
  });

  app.get('/help', (req, res) => {
    res.render('help', {
      title: 'Help',
      loggedIn: Boolean(req.session.user),
    });
  });

  app.get('/privacy', (req, res) => {
    res.render('privacy', {
      title: 'Privacy',
      loggedIn: Boolean(req.session.user),
    });
  });

  app.get('/commands', requireAuth, (req, res) => {
    const cmds = [...client.commands.values()]
      .map((c) => ({
        name: c.data.name,
        description: c.data.description,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.render('commands-page', {
      title: 'Commands',
      cmds,
    });
  });

  app.get('/status', requireAuth, async (req, res) => {
    const guilds = await getManagedGuilds(req);
    if (guilds.length === 1) {
      return res.redirect(`/status/${guilds[0].id}`);
    }
    res.render('status', {
      title: 'Server status',
      mode: 'picker',
      guilds,
      guild: null,
      health: null,
      checks: null,
      botOnline: Boolean(client.user),
      ping: Math.round(client.ws.ping),
    });
  });

  app.get('/status/:id', requireAuth, async (req, res) => {
    const access = await requireGuildAccess(req, res);
    if (!access) return;

    const plan = planForGuild(req.params.id);
    if (!hasFeature(plan, 'analytics')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked#overview`);
    }

    const guild = client.guilds.cache.get(req.params.id);
    const settings = getGuildSettings(req.params.id);
    const health = getGuildHealthStats(req.params.id);
    const checks = [
      {
        ok: Boolean(guild),
        label: 'Bot is in this server',
        detail: guild ? 'Reedhall is connected.' : 'Invite the bot, then refresh.',
      },
      {
        ok: Boolean(settings.mod_role_id),
        label: 'Mod role configured',
        detail: settings.mod_role_id ? 'Mod commands can check the role.' : 'Set a mod role in the guild panel.',
      },
      {
        ok: Boolean(settings.ticket_category_id),
        label: 'Ticket category set',
        detail: settings.ticket_category_id
          ? 'Tickets can be created.'
          : 'Create or pick a ticket category in settings.',
      },
      {
        ok: Boolean(settings.log_channel_id),
        label: 'Mod log channel',
        detail: settings.log_channel_id ? 'Mod actions are logged.' : 'Optional — set a log channel for audits.',
      },
      {
        ok: health.openTickets < 25,
        label: 'Open ticket load',
        detail:
          health.openTickets === 0
            ? 'No open tickets.'
            : `${health.openTickets} open ticket(s).`,
      },
    ];

    res.render('status', {
      title: `${access.name || guild?.name || 'Server'} · Status`,
      mode: 'guild',
      guilds: await getManagedGuilds(req),
      guild: {
        id: access.id,
        name: access.name || guild?.name || 'Server',
        icon: access.icon || guild?.icon || null,
        memberCount: guild?.memberCount ?? null,
        botIn: Boolean(guild),
      },
      health,
      checks,
      botOnline: Boolean(client.user),
      ping: Math.round(client.ws.ping),
    });
  });

  app.get('/admin', requireAuth, requirePlatformAdmin, async (req, res) => {
    const userSearch = String(req.query.q || '').trim();
    const accounts = userSearch ? searchUserAccounts(userSearch, 150) : listUserAccounts();
    const linked = listLinkedGuilds();
    const tab = req.query.tab || 'plans';
    const guildId = req.query.guild || null;

    const guildOptions = [...client.guilds.cache.values()]
      .filter((g) => isGuildLinked(g.id))
      .map((g) => ({ id: g.id, name: g.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    let roles = [];
    let permMap = {};
    let selectedGuild = null;
    if (guildId && client.guilds.cache.has(guildId)) {
      const g = client.guilds.cache.get(guildId);
      selectedGuild = { id: g.id, name: g.name };
      roles = [...g.roles.cache.values()]
        .filter((r) => r.id !== g.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.hexColor }));
      permMap = getRolePermissionMap(guildId);
    }

    const planDefs = listPlanDefinitions();
    const linkLogin = getLinkLoginConfig();

    const stats = {
      accounts: listUserAccounts().length,
      linked: linked.length,
      tickets: db.prepare(`SELECT COUNT(*) AS c FROM tickets`).get().c,
      warns: db.prepare(`SELECT COUNT(*) AS c FROM warnings WHERE active = 1`).get().c,
      polls: db.prepare(`SELECT COUNT(*) AS c FROM polls`).get().c,
      rolePerms: db.prepare(`SELECT COUNT(*) AS c FROM role_permissions`).get().c,
      supportOpen: countOpenSupportThreads(),
    };

    let supportThreads = [];
    let supportActive = null;
    let supportMessages = [];
    let supportUser = null;
    let supportUserPlan = null;
    let supportUserGuilds = [];
    let supportUserLinked = 0;
    let supportSearch = '';
    if (tab === 'support') {
      supportSearch = String(req.query.sq || '').trim();
      supportThreads = supportSearch
        ? searchSupportThreads(supportSearch, 80)
        : listRecentSupportThreads(60);
      const sid = req.query.thread ? Number(req.query.thread) : null;
      if (sid) {
        supportActive = getSupportThread(sid);
        if (supportActive) {
          supportMessages = listSupportMessages(sid);
          supportUser = getUserAccount(supportActive.user_id);
          supportUserPlan = getPlanDefinition(supportUser.plan);
          supportUserGuilds = listLinkedGuildsByUser(supportActive.user_id);
          supportUserLinked = countLinkedByUser(supportActive.user_id);
        }
      }
    }

    res.render('admin', {
      title: 'Admin',
      tab,
      accounts,
      userSearch,
      linked,
      stats,
      plans: PLANS,
      planDefs,
      featureKeys: FEATURE_KEYS,
      guildOptions,
      selectedGuild,
      roles,
      permMap,
      roleFunctions: ROLE_FUNCTIONS,
      linkLogin,
      dashboardUrl,
      flash: req.query.flash || null,
      supportThreads,
      supportActive,
      supportMessages,
      supportUser,
      supportUserPlan,
      supportUserGuilds,
      supportUserLinked,
      supportSearch,
      capReady: isCaptchaConfigured(),
      captchaReady: isCaptchaConfigured(),
      captchaStatus: getCaptchaStatus(),
    });
  });

  app.post('/admin/support/:id/reply', requireAuth, requirePlatformAdmin, (req, res) => {
    const thread = getSupportThread(req.params.id);
    if (!thread) return res.redirect('/admin?tab=support&flash=missing');
    const body = String(req.body.body || '').trim();
    if (!body) return res.redirect(`/admin?tab=support&thread=${thread.id}&flash=empty`);
    addSupportMessage({
      threadId: thread.id,
      senderType: 'admin',
      senderId: req.session.user.id,
      senderName: req.session.user.global_name || req.session.user.username,
      body,
    });
    if (thread.status === 'closed') setSupportThreadStatus(thread.id, 'open');
    res.redirect(`/admin?tab=support&thread=${thread.id}&flash=support_replied`);
  });

  app.post('/admin/support/:id/close', requireAuth, requirePlatformAdmin, (req, res) => {
    const thread = getSupportThread(req.params.id);
    if (!thread) return res.redirect('/admin?tab=support&flash=missing');
    deleteSupportThread(thread.id);
    res.redirect('/admin?tab=support&flash=support_deleted');
  });

  app.post('/admin/support/:id/reopen', requireAuth, requirePlatformAdmin, (req, res) => {
    const thread = getSupportThread(req.params.id);
    if (!thread) return res.redirect('/admin?tab=support&flash=missing');
    setSupportThreadStatus(thread.id, 'open');
    res.redirect(`/admin?tab=support&thread=${thread.id}&flash=support_reopened`);
  });

  app.post('/admin/plan', requireAuth, requirePlatformAdmin, (req, res) => {
    const userId = (req.body.user_id || '').trim();
    const returnTo = String(req.body.return_to || '').trim();
    const safeReturn =
      returnTo.startsWith('/admin?') && !returnTo.includes('\n') ? returnTo : null;
    if (!isValidDiscordUserId(userId)) {
      return res.redirect(safeReturn || '/admin?tab=users&flash=invalid_id');
    }
    try {
      const saved = setUserPlan(userId, req.body.plan || 'lobby', clampEstateServers(req.body.estate_servers || 10));
      if (req.body.username) touchUserAccount(userId, req.body.username);
      console.log(`Admin set plan ${saved.plan} for ${userId}`);
      const sep = (safeReturn || '').includes('?') ? '&' : '?';
      res.redirect(safeReturn ? `${safeReturn}${sep}flash=saved` : '/admin?tab=users&flash=saved');
    } catch (err) {
      console.error(err);
      res.redirect(safeReturn || '/admin?tab=users&flash=invalid_id');
    }
  });

  app.post('/admin/plans', requireAuth, requirePlatformAdmin, (req, res) => {
    for (const planId of ['lobby', 'desk', 'estate']) {
      const features = {};
      for (const f of FEATURE_KEYS) {
        features[f.key] = req.body[`feat_${planId}__${f.key}`] === '1';
      }

      let maxServers = req.body[`max_servers_${planId}`];
      let maxPanelStaff = req.body[`max_staff_${planId}`];
      if (planId === 'estate') {
        maxServers = null;
      } else if (maxServers === '' || maxServers == null) {
        maxServers = PLANS[planId].maxServers;
      } else {
        maxServers = Number(maxServers);
      }

      const staffRaw = String(maxPanelStaff ?? '').trim().toLowerCase();
      if (staffRaw === 'unlimited' || staffRaw === 'null' || staffRaw === '∞') {
        maxPanelStaff = null;
      } else if (staffRaw === '') {
        maxPanelStaff = PLANS[planId].maxPanelStaff;
      } else {
        maxPanelStaff = Number(staffRaw);
        if (!Number.isFinite(maxPanelStaff)) maxPanelStaff = PLANS[planId].maxPanelStaff;
      }

      savePlanDefinition(planId, {
        name: req.body[`name_${planId}`] || PLANS[planId].name,
        maxServers,
        maxPanelStaff,
        monthlyPrice: Number(req.body[`price_${planId}`] ?? PLANS[planId].monthlyPrice),
        priceLabel: req.body[`price_label_${planId}`] || PLANS[planId].priceLabel,
        features,
      });
    }
    res.redirect('/admin?tab=plans&flash=plans_saved');
  });

  app.post('/admin/unlink', requireAuth, requirePlatformAdmin, (req, res) => {
    const guildId = (req.body.guild_id || '').trim();
    if (guildId) unlinkGuild(guildId);
    res.redirect('/admin?tab=guilds&flash=unlinked');
  });

  app.post('/admin/roles', requireAuth, requirePlatformAdmin, (req, res) => {
    const guildId = (req.body.guild_id || '').trim();
    if (!guildId || !client.guilds.cache.has(guildId)) {
      return res.redirect('/admin?tab=roles&flash=bad_guild');
    }

    const roleIds = new Set();
    for (const key of Object.keys(req.body)) {
      const m = key.match(/^perm_(.+?)__(.+)$/);
      if (m) roleIds.add(m[1]);
    }

    const submittedRoles = Array.isArray(req.body.role_id)
      ? req.body.role_id
      : req.body.role_id
        ? [req.body.role_id]
        : [...roleIds];

    for (const roleId of submittedRoles) {
      const perms = [];
      for (const fn of ROLE_FUNCTIONS) {
        const field = `perm_${roleId}__${fn.id}`;
        if (req.body[field] === '1' || req.body[field] === 'on') perms.push(fn.id);
      }
      setRolePermissions(guildId, roleId, perms);
    }

    res.redirect(`/admin?tab=roles&guild=${encodeURIComponent(guildId)}&flash=roles_saved`);
  });

  app.post('/admin/link-login', requireAuth, requirePlatformAdmin, (req, res) => {
    const cfg = saveLinkLoginConfig({
      enabled: req.body.enabled === '1',
      pathSlug: req.body.path_slug,
      password: req.body.password,
      userId: req.body.user_id,
    });
    if (isValidDiscordUserId(cfg.userId) && req.body.username) {
      touchUserAccount(cfg.userId, req.body.username);
    }
    console.log(`Link login: /l/${cfg.pathSlug} enabled=${cfg.enabled}`);
    res.redirect('/admin?tab=link&flash=link_saved');
  });

  app.get('/servers', requireAuth, async (req, res) => {
    if (req.session.user?.viaLink) {
      return res.redirect(req.session.user.linkGuildId ? `/guild/${req.session.user.linkGuildId}` : '/dashboard');
    }
    const usedServers = await syncUsedServers(req);
    const servers = await getConnectableGuilds(req);
    const plan = planForUser(req.session.user.id);
    const linkedRows = listLinkedGuildsByUser(req.session.user.id);
    const linkedByMe = new Set(linkedRows.map((r) => String(r.guild_id)));
    res.render('servers', {
      title: 'Servers koppelen',
      servers: servers.map((s) => ({
        ...s,
        linkedByMe: linkedByMe.has(String(s.id)),
        linkedMeta: getLinkedGuild(s.id),
      })),
      plan,
      usedServers,
      flash: req.query.flash || null,
    });
  });

  app.post('/servers/:id/link', requireAuth, async (req, res) => {
    const servers = await getConnectableGuilds(req);
    const target = servers.find((s) => s.id === req.params.id);
    if (!target) {
      return renderError(req, res, {
        status: 403,
        code: 'link_forbidden',
        title: 'Cannot link server',
        message: 'You can only link servers where you are the owner or an admin.',
      });
    }

    const plan = planForUser(req.session.user.id);
    const already = isGuildLinked(target.id);
    const used = await syncUsedServers(req);
    if (!already && !isOwner(req.session.user.id) && atServerLimit(used, plan.maxServers)) {
      return res.redirect(`/servers?flash=limit&max=${plan.maxServers}`);
    }

    linkGuild({
      guildId: target.id,
      guildName: target.name,
      linkedBy: req.session.user.id,
    });

    if (client.guilds.cache.has(target.id)) {
      try {
        await deployGuildCommands(target.id);
      } catch (err) {
        console.error('Deploy commands failed:', err.message);
      }
      return res.redirect(`/servers?flash=linked`);
    }

    return res.redirect(`/servers?flash=invite&guild=${target.id}`);
  });

  app.post('/servers/:id/unlink', requireAuth, async (req, res) => {
    const servers = await getConnectableGuilds(req);
    const target = servers.find((s) => s.id === req.params.id);
    const linked = getLinkedGuild(req.params.id);
    if (!target && !isOwner(req.session.user.id)) {
      return renderError(req, res, {
        status: 403,
        code: 'forbidden',
        title: 'Access denied',
        message: 'You do not have permission to do that.',
      });
    }
    if (linked && linked.linked_by !== req.session.user.id && !isOwner(req.session.user.id)) {
      // allow discord owner via connectable list
      if (!target) {
        return renderError(req, res, {
          status: 403,
          code: 'unlink_forbidden',
          title: 'Cannot unlink',
          message: 'You do not have permission to unlink this server.',
        });
      }
    }
    unlinkGuild(req.params.id);
    try {
      await clearGuildCommands(req.params.id);
    } catch (err) {
      console.error('Clear guild commands failed:', err.message);
    }
    res.redirect('/servers?flash=unlinked');
  });

  app.get('/guild/:id', requireAuth, async (req, res) => {
    const guildMeta = await requireGuildAccess(req, res);
    if (!guildMeta) return;

    const discordGuild = client.guilds.cache.get(req.params.id);
    const settings = getGuildSettings(req.params.id);
    const ticketTypes = getTicketTypes(req.params.id);
    const customPrefixCommands = getCustomPrefixCommands(req.params.id);
    const maxPrefixCommands = maxCustomPrefixCommands(planForGuild(req.params.id));
    const polls = listGuildPolls(req.params.id, 15);
    const giveaways = listGuildGiveaways(req.params.id, 15);
    const tickets = db
      .prepare(`SELECT * FROM tickets WHERE guild_id = ? ORDER BY id DESC LIMIT 50`)
      .all(req.params.id);
    const actions = db
      .prepare(`SELECT * FROM mod_actions WHERE guild_id = ? ORDER BY id DESC LIMIT 50`)
      .all(req.params.id);
    const warnings = db
      .prepare(`SELECT * FROM warnings WHERE guild_id = ? AND active = 1 ORDER BY id DESC LIMIT 50`)
      .all(req.params.id);

    const categories = [];
    const textChannels = [];
    const roles = [];

    if (discordGuild) {
      await ensureGuildMembers(discordGuild, {
        force: req.query.refresh_members === '1',
      });

      for (const ch of discordGuild.channels.cache.values()) {
        if (ch.type === 4) categories.push({ id: ch.id, name: ch.name });
        if (ch.type === 0 || ch.type === 5) textChannels.push({ id: ch.id, name: ch.name });
      }
      for (const role of discordGuild.roles.cache.values()) {
        if (role.id === discordGuild.id) continue;
        if (role.managed) continue;
        roles.push({ id: role.id, name: role.name, memberCount: role.members?.size ?? 0 });
      }
      categories.sort((a, b) => a.name.localeCompare(b.name));
      textChannels.sort((a, b) => a.name.localeCompare(b.name));
      roles.sort((a, b) => a.name.localeCompare(b.name));
    }

    const members = membersListFromGuild(discordGuild);
    const plan = planForGuild(req.params.id);
    const me = discordGuild?.members.me;
    const panelStaff = listPanelStaff(req.params.id);
    const maxStaff = maxPanelStaffForPlan(plan);
    const disabledCommands = listGuildDisabledCommands(req.params.id);
    const commandList = [...client.commands.values()]
      .map((c) => ({ name: c.data.name, description: c.data.description || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const overrideUserId = String(req.query.cmd_user || '').trim();
    const userDisabledCommands =
      isValidDiscordUserId(overrideUserId)
        ? listUserDisabledCommands(req.params.id, overrideUserId)
        : [];
    const overrideUsers = listUsersWithCommandOverrides(req.params.id);

    const guildLocale = normalizeLocale(settings.locale || defaultLocale());
    const d = (key, vars) => td(guildLocale, key, vars);
    const dashJs = getDashboardStrings(guildLocale, { server: guildMeta.name });
    const dashJsJson = jsonForScript(dashJs);
    const botMapOptions = BOT_MAP_OPTIONS.map((o) => ({
      value: o.value,
      label: td(guildLocale, o.value ? `setup.map.${o.value}` : 'setup.map.none'),
    }));

    res.render('guild', {
      title: guildMeta.name,
      guildMeta,
      discordGuild,
      settings,
      tickets,
      actions,
      warnings,
      ticketTypes,
      customPrefixCommands,
      maxPrefixCommands,
      polls,
      giveaways,
      categories,
      textChannels,
      roles,
      members,
      plan,
      features: plan.features,
      panelStaff,
      maxStaff,
      isGuildOwner: Boolean(guildMeta.isGuildOwner),
      guildLinkLogin: getGuildLinkLogin(req.params.id),
      dashboardUrl,
      commandList,
      disabledCommands,
      overrideUserId: isValidDiscordUserId(overrideUserId) ? overrideUserId : '',
      userDisabledCommands,
      overrideUsers,
      locales: LOCALES,
      guildLocale,
      d,
      dashJs,
      dashJsJson,
      layoutTemplate: LAYOUT_TEMPLATE,
      layoutTicketCategory: TICKET_CATEGORY,
      layoutSlots: flattenSlots(parseBlueprint(settings)),
      layout: parseLayout(settings),
      layoutBlueprint: parseBlueprint(settings),
      botMapOptions,
      flash: req.query.flash || null,
      saved: req.query.saved === '1',
      health: getGuildHealthStats(req.params.id),
      overview: {
        members: discordGuild?.memberCount || 0,
        channels: discordGuild?.channels.cache.size || 0,
        openTickets: tickets.filter((t) => t.status === 'open').length,
        activePolls: (polls || []).filter((p) => p.status === 'active').length,
        activeWarns: warnings.length,
        botNick: me?.displayName || 'Reedhall',
        botAvatar: me?.displayAvatarURL({ size: 128 }) || null,
        checklist: {
          modRole: Boolean(settings.mod_role_id),
          supportRole: Boolean(settings.support_role_id),
          ticketCategory: Boolean(settings.ticket_category_id),
          ticketTypes: ticketTypes.length > 0,
          ticketPanel: Boolean(settings.ticket_panel_channel_id),
          panelStaff: (panelStaff || []).length > 0,
          welcome: Boolean(settings.join_channel_id && settings.join_message),
          suggestions: Boolean(settings.suggestion_channel_id),
        },
      },
    });
  });

  app.post('/guild/:id/commands/toggle', requireAuth, async (req, res) => {
    const guildMeta = await requireGuildAccess(req, res);
    if (!guildMeta) return;

    if (!guildMeta.isGuildOwner) {
      return res.redirect(`/guild/${req.params.id}?flash=staff_owner_only#commands`);
    }

    const plan = planForGuild(req.params.id);
    if (!hasFeature(plan, 'commandOverrides')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked#commands`);
    }

    const command = String(req.body.command || '').trim();
    if (!command || !client.commands.has(command)) {
      return res.redirect(`/guild/${req.params.id}?flash=cmd_invalid#commands`);
    }

    const enable = req.body.enabled === '1';
    const scope = req.body.scope === 'user' ? 'user' : 'guild';
    const targetUser = String(req.body.user_id || '').trim();

    if (scope === 'user') {
      if (!isValidDiscordUserId(targetUser)) {
        return res.redirect(`/guild/${req.params.id}?flash=staff_invalid#commands`);
      }
      setUserCommandDisabled(req.params.id, targetUser, command, !enable);
      return res.redirect(
        `/guild/${req.params.id}?flash=cmd_saved&cmd_user=${encodeURIComponent(targetUser)}#commands`
      );
    }

    setGuildCommandDisabled(req.params.id, command, !enable);
    res.redirect(`/guild/${req.params.id}?flash=cmd_saved#commands`);
  });

  app.post('/guild/:id/staff', requireAuth, async (req, res) => {
    const guildMeta = await requireGuildAccess(req, res);
    if (!guildMeta) return;

    const guild = client.guilds.cache.get(req.params.id);
    const userId = String(req.session.user.id);
    if (!guildMeta.isGuildOwner) {
      return res.redirect(`/guild/${req.params.id}?flash=staff_owner_only#access`);
    }

    const plan = planForGuild(req.params.id);
    const maxStaff = maxPanelStaffForPlan(plan);
    if (maxStaff === 0) {
      return res.redirect(`/guild/${req.params.id}?flash=staff_lobby#access`);
    }

    const inviteMode = req.body.invite_mode === 'role' ? 'role' : 'member';
    const candidates = [];

    if (inviteMode === 'role') {
      const roleId = String(req.body.role_id || '').trim();
      if (!guild || !roleId) {
        return res.redirect(`/guild/${req.params.id}?flash=staff_invalid#access`);
      }
      try {
        await ensureGuildMembers(guild, { force: false });
      } catch {
        // use cache
      }
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        return res.redirect(`/guild/${req.params.id}?flash=staff_invalid#access`);
      }
      for (const m of role.members.values()) {
        if (m.user.bot) continue;
        if (m.id === userId || m.id === String(guild.ownerId)) continue;
        candidates.push({
          id: m.id,
          username: m.displayName || m.user.username,
        });
      }
    } else {
      const staffId = String(req.body.user_id || '').trim();
      if (!/^\d{15,22}$/.test(staffId)) {
        return res.redirect(`/guild/${req.params.id}?flash=staff_invalid#access`);
      }
      if (staffId === userId || (guild && staffId === String(guild.ownerId))) {
        return res.redirect(`/guild/${req.params.id}?flash=staff_self#access`);
      }
      let username = (req.body.username || '').trim() || null;
      if (!username && guild) {
        const m = guild.members.cache.get(staffId);
        if (m) username = m.displayName || m.user.username;
      }
      candidates.push({ id: staffId, username });
    }

    if (!candidates.length) {
      return res.redirect(`/guild/${req.params.id}?flash=staff_none#access`);
    }

    let added = 0;
    for (const c of candidates) {
      const current = countPanelStaff(req.params.id);
      if (Number.isFinite(maxStaff) && current >= maxStaff) {
        if (added === 0) {
          return res.redirect(`/guild/${req.params.id}?flash=staff_limit#access`);
        }
        break;
      }
      if (isPanelStaff(req.params.id, c.id)) continue;
      addPanelStaff({
        guildId: req.params.id,
        userId: c.id,
        username: c.username || null,
        addedBy: userId,
      });
      added += 1;
    }

    if (!added) {
      return res.redirect(`/guild/${req.params.id}?flash=staff_exists#access`);
    }
    res.redirect(`/guild/${req.params.id}?flash=staff_added#access`);
  });

  app.post('/guild/:id/staff/:userId/remove', requireAuth, async (req, res) => {
    const guildMeta = await requireGuildAccess(req, res);
    if (!guildMeta) return;
    if (!guildMeta.isGuildOwner) {
      return res.redirect(`/guild/${req.params.id}?flash=staff_owner_only`);
    }
    removePanelStaff(req.params.id, req.params.userId);
    res.redirect(`/guild/${req.params.id}?flash=staff_removed`);
  });

  app.post('/guild/:id/link-login', requireAuth, async (req, res) => {
    const guildMeta = await requireGuildAccess(req, res);
    if (!guildMeta) return;
    if (!guildMeta.isGuildOwner) {
      return res.redirect(`/guild/${req.params.id}?flash=link_owner_only#access`);
    }
    const plan = planForGuild(req.params.id);
    if (!hasFeature(plan, 'linkLogin')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked#access`);
    }
    try {
      saveGuildLinkLogin(req.params.id, {
        enabled: req.body.enabled === '1' || req.body.enabled === 'on',
        pathSlug: req.body.path_slug,
        password: req.body.password,
      });
      return res.redirect(`/guild/${req.params.id}?flash=link_saved#access`);
    } catch (err) {
      const flash =
        err.code === 'slug_taken'
          ? 'link_slug_taken'
          : err.code === 'password_required'
            ? 'link_password_required'
            : 'link_failed';
      return res.redirect(`/guild/${req.params.id}?flash=${flash}#access`);
    }
  });

  app.post('/guild/:id/settings', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;

    const plan = planForGuild(req.params.id);
    const body = req.body;
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const val = (key) => (body[key] ? body[key] : null);

    const patch = {};
    const keys = [
      'ticket_category_id',
      'ticket_log_channel_id',
      'mod_log_channel_id',
      'mute_role_id',
      'support_role_id',
      'mod_role_id',
      'welcome_message',
      'ticket_panel_title',
      'ticket_panel_description',
      'embed_color',
      'locale',
    ];
    if (hasFeature(plan, 'welcome')) {
      keys.push('join_channel_id', 'join_message', 'leave_channel_id', 'leave_message');
    }
    if (hasFeature(plan, 'autoRole')) keys.push('auto_role_id');
    if (hasFeature(plan, 'suggestions')) keys.push('suggestion_channel_id');

    for (const key of keys) {
      if (has(key)) {
        if (key === 'locale') {
          patch.locale = normalizeLocale(body.locale || defaultLocale());
        } else {
          patch[key] = val(key);
        }
      }
    }
    if (has('ticket_panel_style')) {
      patch.ticket_panel_style = body.ticket_panel_style === 'buttons' ? 'buttons' : 'select';
    }
    if (has('max_open_tickets')) {
      patch.max_open_tickets = Math.min(10, Math.max(1, Number(body.max_open_tickets) || 1));
    }
    if (!Object.keys(patch).length) {
      return res.redirect(`/guild/${req.params.id}?saved=1`);
    }

    updateGuildSettings(req.params.id, patch);

    if (patch.ticket_category_id) {
      const guild = client.guilds.cache.get(req.params.id);
      if (guild) {
        ensureTicketCategoryPermissions(guild, patch.ticket_category_id).catch((err) => {
          console.error('[botRole] ticket category setup on save:', err.message);
        });
      }
    }

    const tab = String(req.body.return_tab || '').trim();
    const hash = ['tickets', 'settings'].includes(tab) ? `#${tab}` : '';
    res.redirect(`/guild/${req.params.id}?saved=1${hash}`);
  });

  function parseTicketQuestionsFromBody(body) {
    const questions = [];
    for (let i = 1; i <= 5; i += 1) {
      const label = String(body[`q${i}_label`] || '').trim();
      if (!label) continue;
      questions.push({
        id: `q${questions.length + 1}`,
        label: label.slice(0, 45),
        style: body[`q${i}_style`] === 'short' ? 'short' : 'paragraph',
        required: body[`q${i}_required`] === '1' || body[`q${i}_required`] === 'on',
        placeholder: String(body[`q${i}_placeholder`] || '').trim().slice(0, 100),
      });
    }
    return questions;
  }

  app.post('/guild/:id/ticket-types', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const plan = planForGuild(req.params.id);
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect(`/guild/${req.params.id}?flash=type_missing#tickets`);
    const questions = hasFeature(plan, 'ticketQuestionnaires')
      ? parseTicketQuestionsFromBody(req.body)
      : [];
    addTicketType(
      req.params.id,
      name,
      (req.body.emoji || '🎫').trim(),
      (req.body.description || '').trim(),
      questions
    );
    res.redirect(`/guild/${req.params.id}?flash=type_added#tickets`);
  });

  app.post('/guild/:id/ticket-types/:typeId', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const plan = planForGuild(req.params.id);
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect(`/guild/${req.params.id}?flash=type_missing#tickets`);
    const questions = hasFeature(plan, 'ticketQuestionnaires')
      ? parseTicketQuestionsFromBody(req.body)
      : [];
    updateTicketType(Number(req.params.typeId), req.params.id, {
      name,
      emoji: (req.body.emoji || '🎫').trim(),
      description: (req.body.description || '').trim(),
      questions,
    });
    res.redirect(`/guild/${req.params.id}?flash=type_saved#tickets`);
  });

  app.post('/guild/:id/ticket-types/:typeId/delete', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    deleteTicketType(Number(req.params.typeId), req.params.id);
    res.redirect(`/guild/${req.params.id}?flash=type_deleted#tickets`);
  });

  app.post('/guild/:id/prefix-commands', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const plan = planForGuild(req.params.id);
    if (!hasFeature(plan, 'customPrefixCommands')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked#messages`);
    }

    const trigger = normalizeTrigger(req.body.trigger);
    const response = String(req.body.response || '').trim();
    const channelId = String(req.body.channel_id || '').trim() || null;

    if (!trigger) {
      return res.redirect(`/guild/${req.params.id}?flash=prefix_missing#messages`);
    }
    if (!response) {
      return res.redirect(`/guild/${req.params.id}?flash=prefix_empty#messages`);
    }

    const max = maxCustomPrefixCommands(plan);
    const count = countCustomPrefixCommands(req.params.id);
    if (count >= max) {
      return res.redirect(`/guild/${req.params.id}?flash=prefix_limit#messages`);
    }

    const existing = getCustomPrefixCommands(req.params.id).find((c) => c.trigger === trigger);
    if (existing) {
      return res.redirect(`/guild/${req.params.id}?flash=prefix_exists#messages`);
    }

    try {
      addCustomPrefixCommand(req.params.id, trigger, response.slice(0, 2000), channelId);
    } catch (err) {
      console.error('Add prefix command error:', err);
      return res.redirect(`/guild/${req.params.id}?flash=prefix_invalid#messages`);
    }
    res.redirect(`/guild/${req.params.id}?flash=prefix_added#messages`);
  });

  app.post('/guild/:id/prefix-commands/:cmdId', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const plan = planForGuild(req.params.id);
    if (!hasFeature(plan, 'customPrefixCommands')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked#messages`);
    }

    const trigger = normalizeTrigger(req.body.trigger);
    const response = String(req.body.response || '').trim();
    const channelId = String(req.body.channel_id || '').trim() || null;

    if (!trigger) {
      return res.redirect(`/guild/${req.params.id}?flash=prefix_missing#messages`);
    }
    if (!response) {
      return res.redirect(`/guild/${req.params.id}?flash=prefix_empty#messages`);
    }

    const duplicate = getCustomPrefixCommands(req.params.id).find(
      (c) => c.trigger === trigger && Number(c.id) !== Number(req.params.cmdId)
    );
    if (duplicate) {
      return res.redirect(`/guild/${req.params.id}?flash=prefix_exists#messages`);
    }

    const updated = updateCustomPrefixCommand(Number(req.params.cmdId), req.params.id, {
      trigger,
      response: response.slice(0, 2000),
      channel_id: channelId,
    });
    if (!updated) {
      return res.redirect(`/guild/${req.params.id}?flash=prefix_missing#messages`);
    }
    res.redirect(`/guild/${req.params.id}?flash=prefix_saved#messages`);
  });

  app.post('/guild/:id/prefix-commands/:cmdId/delete', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    deleteCustomPrefixCommand(Number(req.params.cmdId), req.params.id);
    res.redirect(`/guild/${req.params.id}?flash=prefix_deleted#messages`);
  });

  app.post('/guild/:id/panel', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) {
      return renderError(req, res, {
        status: 400,
        code: 'bot_not_in_guild',
        title: 'Bot not in server',
        message: 'Reedhall is not in this server right now.',
      });
    }

    const settings = getGuildSettings(req.params.id);
    if (!settings.ticket_category_id) {
      return res.redirect(`/guild/${req.params.id}?flash=need_category`);
    }

    const channelId = req.body.channel_id;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return res.redirect(`/guild/${req.params.id}?flash=bad_channel`);
    }

    if (req.body.ticket_panel_title || req.body.ticket_panel_description) {
      updateGuildSettings(req.params.id, {
        ticket_panel_title: req.body.ticket_panel_title || settings.ticket_panel_title,
        ticket_panel_description: req.body.ticket_panel_description || settings.ticket_panel_description,
      });
    }

    const payload = buildTicketPanelPayload(req.params.id);
    payload.embeds[0].setFooter({ text: guild.name });
    try {
      await channel.send(payload);
    } catch (err) {
      console.error('Ticket panel send error:', err);
      return res.redirect(`/guild/${req.params.id}?flash=${flashFromDiscordError(err, 'discord_perms')}`);
    }

    res.redirect(`/guild/${req.params.id}?flash=panel_sent`);
  });

  app.post('/guild/:id/tickets/:ticketId/close', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const ticket = db
      .prepare(`SELECT * FROM tickets WHERE id = ? AND guild_id = ? AND status = 'open'`)
      .get(Number(req.params.ticketId), req.params.id);
    if (!ticket) return res.redirect(`/guild/${req.params.id}?flash=ticket_missing`);

    const guild = client.guilds.cache.get(req.params.id);
    const channel = guild ? await guild.channels.fetch(ticket.channel_id).catch(() => null) : null;
    if (channel) {
      await closeTicketChannel(channel, ticket, req.session.user.id, 'Gesloten via dashboard');
    } else {
      db.prepare(
        `UPDATE tickets SET status = 'closed', closed_by = ?, closed_at = datetime('now') WHERE id = ?`
      ).run(req.session.user.id, ticket.id);
    }
    res.redirect(`/guild/${req.params.id}?flash=ticket_closed`);
  });

  app.post('/guild/:id/warnings/:warnId/delete', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    db.prepare(`UPDATE warnings SET active = 0 WHERE id = ? AND guild_id = ?`).run(
      Number(req.params.warnId),
      req.params.id
    );
    res.redirect(`/guild/${req.params.id}?flash=warn_deleted`);
  });

  app.post('/guild/:id/say', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    if (!hasFeature(planForGuild(req.params.id), 'botSay')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked`);
    }

    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.redirect(`/guild/${req.params.id}?flash=bad_channel`);

    const channel = await guild.channels.fetch(req.body.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      return res.redirect(`/guild/${req.params.id}?flash=bad_channel`);
    }

    const content = (req.body.content || '').trim();
    const embedTitle = (req.body.embed_title || '').trim();
    const embedDescription = (req.body.embed_description || '').trim();
    const useEmbed = req.body.as_embed === '1' || embedTitle || embedDescription;

    if (!content && !embedTitle && !embedDescription) {
      return res.redirect(`/guild/${req.params.id}?flash=say_empty`);
    }

    try {
      const payload = {};
      if (content && !useEmbed) payload.content = content.slice(0, 2000);
      if (useEmbed) {
        const { EmbedBuilder } = require('discord.js');
        const colorRaw = (req.body.embed_color || '#3d8bfd').replace('#', '');
        const color = Number.parseInt(colorRaw, 16);
        const embed = new EmbedBuilder()
          .setColor(Number.isFinite(color) ? color : 0x3d8bfd)
          .setTimestamp();
        if (embedTitle) embed.setTitle(embedTitle.slice(0, 256));
        if (embedDescription || content) {
          embed.setDescription((embedDescription || content).slice(0, 4000));
        }
        embed.setFooter({
          text: `Verzonden via dashboard · ${req.session.user.global_name || req.session.user.username}`,
        });
        payload.embeds = [embed];
        if (content && embedDescription) payload.content = content.slice(0, 2000);
      }

      await channel.send(payload);
      res.redirect(`/guild/${req.params.id}?flash=say_sent`);
    } catch (err) {
      console.error('Dashboard say error:', err);
      res.redirect(`/guild/${req.params.id}?flash=${flashFromDiscordError(err, 'say_failed')}`);
    }
  });

  app.post('/guild/:id/polls', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    if (!hasFeature(planForGuild(req.params.id), 'polls')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked`);
    }

    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.redirect(`/guild/${req.params.id}?flash=bad_channel`);

    const channel = await guild.channels.fetch(req.body.channel_id).catch(() => null);
    if (!channel?.isTextBased()) {
      return res.redirect(`/guild/${req.params.id}?flash=bad_channel`);
    }

    const question = (req.body.question || '').trim();
    const endsRaw = req.body.ends_at;
    const endsAt = endsRaw ? new Date(endsRaw).getTime() : NaN;
    const allowMulti = req.body.allow_multi === '1';
    const voteOnce = allowMulti ? false : req.body.vote_once === '1';

    const options = [];
    const labels = [].concat(req.body.option_label || []).filter((v) => String(v || '').trim());
    if (labels.length) {
      const emojis = [].concat(req.body.option_emoji || []);
      const goods = new Set([].concat(req.body.option_good || []).map(String));
      labels.slice(0, 10).forEach((label, i) => {
        options.push({
          label: String(label).trim().slice(0, 80),
          emoji: String(emojis[i] || '').trim() || '▪️',
          isGood: goods.has(String(i)),
        });
      });
    } else {
      for (let i = 1; i <= 10; i++) {
        const label = (req.body[`option_${i}`] || '').trim();
        if (!label) continue;
        options.push({
          label: label.slice(0, 80),
          emoji: (req.body[`emoji_${i}`] || '').trim() || '▪️',
          isGood: req.body[`good_${i}`] === '1',
        });
      }
    }

    if (!question || options.length < 2) {
      return res.redirect(`/guild/${req.params.id}?flash=poll_invalid`);
    }
    if (!Number.isFinite(endsAt) || endsAt <= Date.now() + 60_000) {
      return res.redirect(`/guild/${req.params.id}?flash=poll_date`);
    }

    try {
      const pollId = createPoll({
        guildId: req.params.id,
        channelId: channel.id,
        question: question.slice(0, 256),
        endsAt,
        createdBy: req.session.user.id,
        allowMulti,
        voteOnce,
        options,
      });

      const message = await sendNativePoll(channel, {
        question: question.slice(0, 300),
        options,
        endsAt,
        allowMulti,
      });
      setPollMessage(pollId, message.id);

      res.redirect(`/guild/${req.params.id}?flash=poll_sent`);
    } catch (err) {
      console.error('Poll create error:', err);
      res.redirect(`/guild/${req.params.id}?flash=${flashFromDiscordError(err, 'poll_failed')}`);
    }
  });

  app.post('/guild/:id/polls/:pollId/end', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const poll = getPoll(Number(req.params.pollId));
    if (!poll || poll.guild_id !== req.params.id) {
      return res.redirect(`/guild/${req.params.id}?flash=poll_missing`);
    }
    db.prepare(`UPDATE polls SET status = 'ended' WHERE id = ?`).run(poll.id);
    const { refreshPollMessage } = require('../utils/polls');
    await refreshPollMessage(client, poll.id).catch(() => null);
    res.redirect(`/guild/${req.params.id}?flash=poll_ended`);
  });

  app.post('/guild/:id/giveaways', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    if (!hasFeature(planForGuild(req.params.id), 'giveaways')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked#giveaways`);
    }

    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.redirect(`/guild/${req.params.id}?flash=bad_channel#giveaways`);

    const channel = await guild.channels.fetch(req.body.channel_id).catch(() => null);
    if (!channel?.isTextBased()) {
      return res.redirect(`/guild/${req.params.id}?flash=bad_channel#giveaways`);
    }

    const canPost = await botCanPostInChannel(channel);
    if (!canPost.ok) {
      return res.redirect(`/guild/${req.params.id}?flash=giveaway_perms#giveaways`);
    }

    const title = (req.body.title || '').trim();
    const prize = (req.body.prize || '').trim();
    const prizeDm = (req.body.prize_dm || '').trim();
    const description = (req.body.description || '').trim();
    const imageUrl = (req.body.image_url || '').trim();
    const winnersCount = Math.max(1, Math.min(20, Number(req.body.winners_count) || 1));
    const endsRaw = req.body.ends_at;
    const endsAt = endsRaw ? new Date(endsRaw).getTime() : NaN;
    const requiredRoleId = (req.body.required_role_id || '').trim() || null;

    if (!title || !prize || !Number.isFinite(endsAt) || endsAt <= Date.now()) {
      return res.redirect(`/guild/${req.params.id}?flash=giveaway_invalid#giveaways`);
    }
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
      return res.redirect(`/guild/${req.params.id}?flash=giveaway_image#giveaways`);
    }

    let giveawayId = null;
    try {
      giveawayId = createGiveaway({
        guildId: req.params.id,
        channelId: channel.id,
        title,
        prize,
        prizeDm: prizeDm || null,
        description: description || null,
        imageUrl: imageUrl || null,
        winnersCount,
        endsAt,
        requiredRoleId,
        hostId: req.session.user.id,
      });
      const giveaway = getGiveaway(giveawayId);
      const msg = await channel.send({
        embeds: [buildGiveawayEmbed(giveaway, 0, false)],
        components: buildGiveawayButtons(giveaway, 0, false),
      });
      setGiveawayMessage(giveawayId, msg.id);
      res.redirect(`/guild/${req.params.id}?flash=giveaway_sent#giveaways`);
    } catch (err) {
      console.error('Giveaway create error:', err);
      if (giveawayId) {
        try { deleteGiveaway(giveawayId); } catch { /* ignore */ }
      }
      const flash = flashFromDiscordError(err, err.code === 50013 ? 'giveaway_perms' : 'giveaway_failed');
      res.redirect(`/guild/${req.params.id}?flash=${flash}#giveaways`);
    }
  });

  app.post('/guild/:id/giveaways/:giveawayId/end', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const g = getGiveaway(Number(req.params.giveawayId));
    if (!g || g.guild_id !== req.params.id) {
      return res.redirect(`/guild/${req.params.id}?flash=giveaway_failed#giveaways`);
    }
    if (g.status === 'active') {
      await finishGiveaway(client, g.id).catch(() => null);
    }
    res.redirect(`/guild/${req.params.id}?flash=giveaway_ended#giveaways`);
  });

  app.post('/guild/:id/giveaways/:giveawayId/reroll', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const g = getGiveaway(Number(req.params.giveawayId));
    if (!g || g.guild_id !== req.params.id) {
      return res.redirect(`/guild/${req.params.id}?flash=giveaway_failed#giveaways`);
    }
    if (g.status === 'active') {
      return res.redirect(`/guild/${req.params.id}?flash=giveaway_active#giveaways`);
    }
    if (!getGiveawayEntryCount(g.id)) {
      return res.redirect(`/guild/${req.params.id}?flash=giveaway_empty#giveaways`);
    }
    await finishGiveaway(client, g.id, { reroll: true }).catch(() => null);
    res.redirect(`/guild/${req.params.id}?flash=giveaway_reroll#giveaways`);
  });

  app.post('/guild/:id/setup/blueprint', requireAuth, async (req, res) => {
    const guildMeta = await requireGuildAccess(req, res);
    if (!guildMeta) return;
    if (!guildMeta.isGuildOwner) {
      return res.redirect(`/guild/${req.params.id}?flash=setup_owner_only#setup`);
    }
    const plan = planForGuild(req.params.id);
    if (!hasFeature(plan, 'serverSetup')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked#overview`);
    }
    const blueprint = blueprintFromFormBody(req.body);
    updateGuildSettings(req.params.id, {
      layout_blueprint_json: JSON.stringify(blueprint),
    });
    res.redirect(`/guild/${req.params.id}?flash=setup_blueprint#setup`);
  });

  app.post('/guild/:id/setup/create', requireAuth, async (req, res) => {
    const guildMeta = await requireGuildAccess(req, res);
    if (!guildMeta) return;
    if (!guildMeta.isGuildOwner) {
      return res.redirect(`/guild/${req.params.id}?flash=setup_owner_only#setup`);
    }
    const plan = planForGuild(req.params.id);
    if (!hasFeature(plan, 'serverSetup')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked#overview`);
    }

    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) {
      return res.redirect(`/guild/${req.params.id}?flash=setup_failed#setup`);
    }

    try {
      const blueprint = Object.prototype.hasOwnProperty.call(req.body, 'bp_cat_id')
        ? blueprintFromFormBody(req.body)
        : parseBlueprint(getGuildSettings(req.params.id));

      const layout = await createServerLayout(guild, blueprint, {
        reason: `Server setup via dashboard · ${req.session.user.username}`,
      });
      const patch = {
        layout_json: JSON.stringify(layout),
        layout_blueprint_json: JSON.stringify(blueprint),
        ...settingsPatchFromLayout(layout, blueprint),
      };
      updateGuildSettings(req.params.id, patch);
      res.redirect(`/guild/${req.params.id}?flash=setup_created#setup`);
    } catch (err) {
      console.error('Setup create error:', err);
      res.redirect(`/guild/${req.params.id}?flash=${flashFromDiscordError(err, 'setup_failed')}#setup`);
    }
  });

  app.post('/guild/:id/setup/save', requireAuth, async (req, res) => {
    const guildMeta = await requireGuildAccess(req, res);
    if (!guildMeta) return;
    if (!guildMeta.isGuildOwner) {
      return res.redirect(`/guild/${req.params.id}?flash=setup_owner_only#setup`);
    }
    const plan = planForGuild(req.params.id);
    if (!hasFeature(plan, 'serverSetup')) {
      return res.redirect(`/guild/${req.params.id}?flash=plan_locked#overview`);
    }

    const guild = client.guilds.cache.get(req.params.id);
    const settings = getGuildSettings(req.params.id);
    const blueprint = parseBlueprint(settings);
    const current = parseLayout(settings);
    const layout = {
      categories: { ...current.categories },
      channels: { ...current.channels },
    };

    for (const slot of flattenSlots(blueprint)) {
      const raw = String(req.body[`ch_${slot.id}`] || '').trim();
      if (!raw) {
        delete layout.channels[slot.id];
        continue;
      }
      if (guild && !guild.channels.cache.has(raw)) {
        return res.redirect(`/guild/${req.params.id}?flash=setup_bad_channel#setup`);
      }
      layout.channels[slot.id] = raw;
    }

    const ticketKey = blueprint.ticketCategory.id;
    const ticketCat = String(req.body.cat_tickets_live || '').trim();
    if (ticketCat) {
      if (guild && !guild.channels.cache.has(ticketCat)) {
        return res.redirect(`/guild/${req.params.id}?flash=setup_bad_channel#setup`);
      }
      layout.categories[ticketKey] = ticketCat;
    } else {
      delete layout.categories[ticketKey];
    }

    for (const cat of blueprint.categories) {
      const raw = String(req.body[`cat_${cat.id}`] || '').trim();
      if (raw) layout.categories[cat.id] = raw;
      else delete layout.categories[cat.id];
    }

    const patch = {
      layout_json: JSON.stringify(layout),
      ...settingsPatchFromLayout(layout, blueprint),
    };
    updateGuildSettings(req.params.id, patch);
    res.redirect(`/guild/${req.params.id}?flash=setup_saved#setup`);
  });

  app.post('/guild/:id/branding', requireAuth, uploadLimiter, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    const plan = planForGuild(req.params.id);
    if (!hasFeature(plan, 'branding')) {
      return res.redirect(`/guild/${req.params.id}?flash=branding_locked#branding`);
    }

    uploadAvatar(req, res, async (uploadErr) => {
      if (uploadErr) {
        console.error('Avatar upload error:', uploadErr.message);
        const flash =
          uploadErr.code === 'LIMIT_FILE_SIZE' ? 'branding_size' : 'branding_png';
        return res.redirect(`/guild/${req.params.id}?flash=${flash}#branding`);
      }

      const guild = client.guilds.cache.get(req.params.id);
      if (!guild) {
        return res.redirect(`/guild/${req.params.id}?flash=branding_failed#branding`);
      }

      const nick = (req.body.bot_nick || '').trim().slice(0, 32);
      const resetAvatar = req.body.reset_avatar === '1';

      try {
        const edit = {};
        if (Object.prototype.hasOwnProperty.call(req.body, 'bot_nick')) {
          edit.nick = nick || null;
        }

        let avatarPath = getGuildSettings(req.params.id).bot_avatar_path || null;

        if (resetAvatar) {
          edit.avatar = null;
          avatarPath = null;
          await fs.promises
            .unlink(path.join(avatarUploadDir, `${req.params.id}.png`))
            .catch(() => null);
        } else if (req.file) {
          const safe = assertSafeAvatar(req.file.buffer, req.file.originalname);
          const dest = path.join(avatarUploadDir, `${req.params.id}.png`);
          const resolved = path.resolve(dest);
          if (!resolved.startsWith(path.resolve(avatarUploadDir) + path.sep)) {
            throw new Error('Invalid storage path');
          }
          await fs.promises.writeFile(resolved, safe, { flag: 'w' });
          await fs.promises.chmod(resolved, 0o600).catch(() => null);
          edit.avatar = safe;
          avatarPath = resolved;
        }

        if (Object.keys(edit).length) {
          await guild.members.editMe({
            ...edit,
            reason: `Branding via dashboard · ${req.session.user.username}`,
          });
        }

        updateGuildSettings(req.params.id, {
          bot_nick: nick || null,
          bot_avatar_url: null,
          bot_avatar_path: resetAvatar ? null : avatarPath,
        });

        res.redirect(`/guild/${req.params.id}?flash=branding_saved#branding`);
      } catch (e) {
        console.error('Branding error:', e.message);
        const flash = /png|ico|jpg|jpeg|gif|webp|image|file|avatar|structure/i.test(e.message)
          ? 'branding_png'
          : 'branding_failed';
        res.redirect(`/guild/${req.params.id}?flash=${flash}#branding`);
      }
    });
  });

  app.post('/guild/:id/purge', requireAuth, async (req, res) => {
    if (!(await requireGuildAccess(req, res))) return;
    if (!hasFeature(planForGuild(req.params.id), 'botSay') && !hasFeature(planForGuild(req.params.id), 'advancedMod')) {
      // allow purge if they have basic mod via being on desk+ or tickets - use advancedMod or botSay
      const plan = planForGuild(req.params.id);
      if (!plan.features.advancedMod && !plan.features.basicMod) {
        return res.redirect(`/guild/${req.params.id}?flash=plan_locked`);
      }
    }

    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.redirect(`/guild/${req.params.id}?flash=bad_channel`);

    const channel = await guild.channels.fetch(req.body.channel_id).catch(() => null);
    if (!channel?.isTextBased?.() || !channel.bulkDelete) {
      return res.redirect(`/guild/${req.params.id}?flash=bad_channel`);
    }

    const amount = Math.min(100, Math.max(1, Number(req.body.amount) || 1));
    const onlyBot = req.body.only_bot === '1';
    const messageId = (req.body.message_id || '').trim();

    try {
      if (messageId) {
        const idMatch = messageId.match(/(\d{15,22})$/);
        const mid = idMatch ? idMatch[1] : messageId;
        const msg = await channel.messages.fetch(mid);
        await msg.delete();
        return res.redirect(`/guild/${req.params.id}?flash=purge_one`);
      }

      if (onlyBot) {
        const fetched = await channel.messages.fetch({ limit: Math.min(100, amount) });
        const mine = fetched.filter((m) => m.author.id === client.user.id);
        if (mine.size) await channel.bulkDelete(mine, true);
      } else {
        await channel.bulkDelete(amount, true);
      }
      res.redirect(`/guild/${req.params.id}?flash=purge_done`);
    } catch (err) {
      console.error('Purge error:', err);
      res.redirect(`/guild/${req.params.id}?flash=${flashFromDiscordError(err, 'purge_failed')}`);
    }
  });

  app.get('/support', requireAuth, (req, res) => {
    const threads = listSupportThreadsForUser(req.session.user.id);
    res.render('support', {
      title: 'Support',
      threads,
      activeThread: null,
      messages: [],
      flash: req.query.flash || null,
    });
  });

  app.get('/support/:id', requireAuth, (req, res) => {
    const thread = getSupportThread(req.params.id);
    if (!thread || String(thread.user_id) !== String(req.session.user.id)) {
      return renderError(req, res, {
        status: 404,
        code: 'not_found',
        title: 'Chat not found',
        message: 'This support conversation does not exist.',
      });
    }
    res.render('support', {
      title: 'Support',
      threads: listSupportThreadsForUser(req.session.user.id),
      activeThread: thread,
      messages: listSupportMessages(thread.id),
      flash: req.query.flash || null,
    });
  });

  app.post('/support', requireAuth, (req, res) => {
    const thread = createSupportThread({
      userId: req.session.user.id,
      username: req.session.user.global_name || req.session.user.username,
      subject: req.body.subject,
      body: req.body.body,
    });
    if (!thread) return res.redirect('/support?flash=empty');
    sendErrorWebhook({
      context: {
        status: 200,
        code: 'support_new',
        title: 'New support chat',
        message: String(req.body.subject || 'Support').slice(0, 200),
        path: `/admin?tab=support&thread=${thread.id}`,
      },
      note: String(req.body.body || '').slice(0, 500),
      user: req.session.user,
      reqMeta: { ip: req.ip, ua: req.get('user-agent') },
    }).catch(() => null);
    res.redirect(`/support/${thread.id}?flash=sent`);
  });

  app.post('/support/:id/reply', requireAuth, (req, res) => {
    const thread = getSupportThread(req.params.id);
    if (!thread || String(thread.user_id) !== String(req.session.user.id)) {
      return renderError(req, res, {
        status: 404,
        code: 'not_found',
        title: 'Chat not found',
        message: 'This support conversation does not exist.',
      });
    }
    if (thread.status !== 'open') return res.redirect(`/support/${thread.id}`);
    const ok = addSupportMessage({
      threadId: thread.id,
      senderType: 'user',
      senderId: req.session.user.id,
      senderName: req.session.user.global_name || req.session.user.username,
      body: req.body.body,
    });
    if (!ok) return res.redirect(`/support/${thread.id}?flash=empty`);
    res.redirect(`/support/${thread.id}?flash=sent`);
  });

  const reportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many reports. Try again later.',
  });

  app.post('/error/report', reportLimiter, async (req, res) => {
    const token = String(req.body.token || '');
    const context = verifyPayload(token);
    if (!context) {
      return renderError(req, res, {
        status: 400,
        code: 'report_expired',
        title: 'Report expired',
        message: 'This error report link expired. Open the original error page again and retry.',
      });
    }

    const ok = verifyCaptchaToken(req);
    if (!ok) {
      const view = buildErrorView({
        status: context.status || 500,
        code: context.code,
        title: context.title,
        message: context.message,
        path: context.path,
        reported: true,
        reportOk: false,
        reportError: 'CAPTCHA failed. Complete Captcha is and try again.',
      });
      return res.status(view.status).render('error', {
        ...view,
        user: res.locals.user || null,
        capReady: isCaptchaConfigured(),
        captchaReady: isCaptchaConfigured(),
        captchaIsReady: isCaptchaIsConfigured(),
        captchaIsSitekey: getCaptchaIsSitekey(),
      });
    }

    const result = await sendErrorWebhook({
      context,
      note: req.body.note,
      user: req.session.user || null,
      reqMeta: {
        ip: req.ip,
        ua: req.get('user-agent'),
      },
    });

    const view = buildErrorView({
      status: context.status || 500,
      code: context.code,
      title: context.title,
      message: context.message,
      path: context.path,
      reported: true,
      reportOk: result.ok,
      reportError: result.ok
        ? null
        : result.reason === 'webhook_unset'
          ? 'Reporting is not configured yet. Please contact the Reedhall owner.'
          : 'Could not send the report. Please try again in a moment.',
    });

    return res.status(view.status).render('error', {
      ...view,
      user: res.locals.user || null,
      capReady: isCaptchaConfigured(),
      captchaReady: isCaptchaConfigured(),
      captchaIsReady: isCaptchaIsConfigured(),
      captchaIsSitekey: getCaptchaIsSitekey(),
    });
  });

  app.use((req, res) => {
    renderError(req, res, {
      status: 404,
      code: 'not_found',
      title: 'Page not found',
      message: 'This page does not exist or was moved.',
    });
  });

  app.use((err, req, res, next) => {
    console.error('Dashboard error:', err);
    if (res.headersSent) return next(err);
    renderError(req, res, {
      status: 500,
      code: 'server_error',
      title: 'Something went wrong',
      message: 'Reedhall hit an unexpected error. You can report it so we can fix it.',
    });
  });

  app.listen(port, '0.0.0.0', async () => {
    try {
      initCaptcha();
      const status = getCaptchaStatus();
      if (status.provider === 'captcha-is') {
        console.log(`Captcha is (stoplichten): ready · sitekey=${status.sitekey}`);
      } else if (status.configured) {
        console.log('Reedhall Guard: ready (Captcha is not configured)');
      } else {
        console.log('CAPTCHA: missing CAPTCHA_IS_* or CAPTCHA_SECRET');
      }
    } catch (err) {
      console.error('CAPTCHA init failed:', err.message);
    }
    console.log(`Dashboard: ${dashboardUrl}`);
  });

  return app;
}

module.exports = { createDashboard };
