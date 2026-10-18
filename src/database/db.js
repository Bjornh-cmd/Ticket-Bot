const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { getDataDir } = require('../utils/runtimeEnv');

const dataDir = getDataDir();
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'bot.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    ticket_category_id TEXT,
    ticket_log_channel_id TEXT,
    mod_log_channel_id TEXT,
    mute_role_id TEXT,
    support_role_id TEXT,
    mod_role_id TEXT,
    ticket_panel_title TEXT DEFAULT 'Support Tickets',
    ticket_panel_description TEXT DEFAULT 'Kies hieronder een categorie om een ticket te openen. Ons team helpt je zo snel mogelijk.',
    ticket_panel_style TEXT DEFAULT 'select',
    max_open_tickets INTEGER DEFAULT 1,
    ticket_counter INTEGER NOT NULL DEFAULT 0,
    welcome_message TEXT DEFAULT 'Bedankt voor je ticket! Een stafflid helpt je zo snel mogelijk.',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ticket_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🎫',
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    opener_id TEXT NOT NULL,
    claimed_by TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    subject TEXT,
    ticket_number INTEGER NOT NULL,
    closed_by TEXT,
    closed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mod_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    duration_ms INTEGER,
    expires_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS temp_punishments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    reason TEXT,
    moderator_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    question TEXT NOT NULL,
    ends_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    allow_multi INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS poll_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    emoji TEXT DEFAULT '▪️',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id INTEGER NOT NULL,
    option_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (poll_id, option_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id, status);
  CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings(guild_id, user_id, active);
  CREATE INDEX IF NOT EXISTS idx_mod_actions_guild ON mod_actions(guild_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_temp_active ON temp_punishments(active, expires_at);
  CREATE INDEX IF NOT EXISTS idx_ticket_types_guild ON ticket_types(guild_id);
  CREATE INDEX IF NOT EXISTS idx_polls_active ON polls(status, ends_at);

  CREATE TABLE IF NOT EXISTS linked_guilds (
    guild_id TEXT PRIMARY KEY,
    guild_name TEXT,
    linked_by TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    linked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function prepare(sql) {
  const stmt = db.prepare(sql);
  return {
    run(...params) {
      const result = stmt.run(...params);
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid),
      };
    },
    get(...params) {
      return stmt.get(...params);
    },
    all(...params) {
      return stmt.all(...params);
    },
  };
}

function ensureColumn(table, column, definition) {
  const cols = prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('guild_settings', 'mod_role_id', 'TEXT');
ensureColumn('guild_settings', 'ticket_panel_title', "TEXT DEFAULT 'Support Tickets'");
ensureColumn(
  'guild_settings',
  'ticket_panel_description',
  "TEXT DEFAULT 'Kies hieronder een categorie om een ticket te openen.'"
);
ensureColumn('guild_settings', 'ticket_panel_style', "TEXT DEFAULT 'select'");
ensureColumn('guild_settings', 'max_open_tickets', 'INTEGER DEFAULT 1');
ensureColumn('guild_settings', 'join_channel_id', 'TEXT');
ensureColumn('guild_settings', 'join_message', "TEXT");
ensureColumn('guild_settings', 'leave_channel_id', 'TEXT');
ensureColumn('guild_settings', 'leave_message', 'TEXT');
ensureColumn('guild_settings', 'embed_color', "TEXT DEFAULT '#0f766e'");
ensureColumn('guild_settings', 'suggestion_channel_id', 'TEXT');
ensureColumn('guild_settings', 'auto_role_id', 'TEXT');
ensureColumn('guild_settings', 'bot_nick', 'TEXT');
ensureColumn('guild_settings', 'bot_avatar_url', 'TEXT');
ensureColumn('guild_settings', 'bot_avatar_path', 'TEXT');
ensureColumn('guild_settings', 'locale', "TEXT DEFAULT 'en'");
ensureColumn('guild_settings', 'layout_json', 'TEXT');
ensureColumn('guild_settings', 'layout_blueprint_json', 'TEXT');
ensureColumn('guild_settings', 'announce_channel_id', 'TEXT');
ensureColumn('guild_settings', 'ticket_panel_channel_id', 'TEXT');
ensureColumn('guild_settings', 'xp_multiplier', 'REAL DEFAULT 1');
ensureColumn('guild_settings', 'bot_status_text', 'TEXT');
ensureColumn('giveaways', 'prize_dm', 'TEXT');
ensureColumn('polls', 'vote_once', 'INTEGER DEFAULT 1');
ensureColumn('polls', 'result_posted', 'INTEGER DEFAULT 0');
ensureColumn('poll_options', 'is_good', 'INTEGER DEFAULT 0');
ensureColumn('ticket_types', 'questions_json', "TEXT DEFAULT '[]'");
ensureColumn('tickets', 'priority', 'TEXT');
ensureColumn('tickets', 'priority_role_id', 'TEXT');
ensureColumn('tickets', 'priority_user_id', 'TEXT');
ensureColumn('tickets', 'notes_thread_id', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS user_accounts (
    user_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'lobby',
    estate_servers INTEGER NOT NULL DEFAULT 10,
    username TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS panel_staff (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT,
    added_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    permission TEXT NOT NULL,
    PRIMARY KEY (guild_id, role_id, permission)
  );

  CREATE TABLE IF NOT EXISTS plan_definitions (
    plan_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    max_servers INTEGER,
    max_panel_staff INTEGER,
    monthly_price INTEGER DEFAULT 0,
    price_label TEXT,
    features_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS guild_disabled_commands (
    guild_id TEXT NOT NULL,
    command_name TEXT NOT NULL,
    PRIMARY KEY (guild_id, command_name)
  );

  CREATE TABLE IF NOT EXISTS user_disabled_commands (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    command_name TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id, command_name)
  );

  CREATE TABLE IF NOT EXISTS ticket_transcripts (
    ticket_id INTEGER PRIMARY KEY,
    guild_id TEXT NOT NULL,
    ticket_number INTEGER,
    subject TEXT,
    opener_id TEXT,
    closer_id TEXT,
    reason TEXT,
    transcript TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ticket_dm_mutes (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    title TEXT NOT NULL,
    prize TEXT NOT NULL,
    prize_dm TEXT,
    description TEXT,
    image_url TEXT,
    winners_count INTEGER NOT NULL DEFAULT 1,
    ends_at INTEGER NOT NULL,
    required_role_id TEXT,
    host_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    winner_ids TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS giveaway_entries (
    giveaway_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    entered_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (giveaway_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(status, ends_at);

  CREATE TABLE IF NOT EXISTS cap_nonces (
    sig TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cap_tokens (
    token_key TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT,
    subject TEXT NOT NULL DEFAULT 'Support',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL,
    sender_id TEXT,
    sender_name TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_support_threads_user ON support_threads(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_support_threads_status ON support_threads(status, updated_at);
  CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON support_messages(thread_id, id);
  CREATE INDEX IF NOT EXISTS idx_cap_nonces_exp ON cap_nonces(expires_at);
  CREATE INDEX IF NOT EXISTS idx_cap_tokens_exp ON cap_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS guild_link_logins (
    guild_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    path_slug TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS level_profiles (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    background_url TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS level_xp_cooldowns (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_earned_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_level_profiles_guild_xp ON level_profiles(guild_id, xp DESC);

  CREATE TABLE IF NOT EXISTS custom_prefix_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    trigger TEXT NOT NULL,
    response TEXT NOT NULL,
    channel_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(guild_id, trigger)
  );
  CREATE INDEX IF NOT EXISTS idx_custom_prefix_guild ON custom_prefix_commands(guild_id);
`);

ensureColumn('user_accounts', 'username', 'TEXT');
ensureColumn('user_accounts', 'passkey_login_enabled', 'INTEGER NOT NULL DEFAULT 0');

prepare(`
  CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports_json TEXT,
    device_type TEXT,
    backed_up INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`).run();
prepare(`CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id)`).run();

function isValidDiscordUserId(userId) {
  return /^\d{15,22}$/.test(String(userId || '').trim());
}

function getUserAccount(userId) {
  const id = String(userId);
  let row = prepare('SELECT * FROM user_accounts WHERE user_id = ?').get(id);
  if (!row) {
    prepare(`INSERT INTO user_accounts (user_id, plan, estate_servers) VALUES (?, 'lobby', 10)`).run(id);
    row = prepare('SELECT * FROM user_accounts WHERE user_id = ?').get(id);
  }
  return row;
}

function touchUserAccount(userId, username = null) {
  if (!isValidDiscordUserId(userId)) return null;
  getUserAccount(userId);
  if (username) {
    prepare(`UPDATE user_accounts SET username = ?, updated_at = datetime('now') WHERE user_id = ?`).run(
      String(username),
      String(userId)
    );
  }
  return getUserAccount(userId);
}

function setUserPlan(userId, plan, estateServers = 10) {
  if (!isValidDiscordUserId(userId)) {
    throw new Error('Ongeldige Discord user ID');
  }
  const { clampEstateServers } = require('../utils/plans');
  const allowed = new Set(['lobby', 'desk', 'estate']);
  const planId = allowed.has(String(plan || '').toLowerCase().trim())
    ? String(plan).toLowerCase().trim()
    : 'lobby';
  const servers = clampEstateServers(estateServers);
  const id = String(userId);
  getUserAccount(id);
  prepare(
    `UPDATE user_accounts SET plan = ?, estate_servers = ?, updated_at = datetime('now') WHERE user_id = ?`
  ).run(planId, servers, id);
  const row = getUserAccount(id);
  if (row.plan !== planId) {
    prepare(
      `INSERT INTO user_accounts (user_id, plan, estate_servers) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, estate_servers = excluded.estate_servers, updated_at = datetime('now')`
    ).run(id, planId, servers);
  }
  return getUserAccount(id);
}

function listUserAccounts() {
  return prepare(
    `SELECT * FROM user_accounts
     WHERE user_id GLOB '[0-9]*' AND length(user_id) >= 15
     ORDER BY updated_at DESC`
  ).all();
}

/** Search accounts by username and/or Discord user ID (partial, case-insensitive). */
function searchUserAccounts(query, limit = 100) {
  const q = String(query || '').trim();
  if (!q) return listUserAccounts();
  const like = `%${q.replace(/[%_]/g, '')}%`;
  return prepare(
    `SELECT * FROM user_accounts
     WHERE user_id GLOB '[0-9]*' AND length(user_id) >= 15
       AND (
         lower(COALESCE(username, '')) LIKE lower(?)
         OR user_id LIKE ?
       )
     ORDER BY
       CASE WHEN lower(COALESCE(username, '')) = lower(?) THEN 0
            WHEN user_id = ? THEN 1
            ELSE 2 END,
       updated_at DESC
     LIMIT ?`
  ).all(like, like, q, q, Math.min(500, Math.max(1, Number(limit) || 100)));
}

function listLinkedGuildsByUser(userId) {
  return prepare(
    `SELECT * FROM linked_guilds WHERE linked_by = ? AND active = 1 ORDER BY linked_at DESC`
  ).all(String(userId));
}

function deleteInvalidUserAccounts() {
  return prepare(
    `DELETE FROM user_accounts
     WHERE user_id NOT GLOB '[0-9]*' OR length(user_id) < 15`
  ).run();
}

deleteInvalidUserAccounts();

function countLinkedByUser(userId) {
  const row = prepare(
    `SELECT COUNT(*) AS c FROM linked_guilds WHERE linked_by = ? AND active = 1`
  ).get(String(userId));
  return Number(row?.c || 0);
}

/**
 * Reassign active linked guilds with an invalid/orphan linked_by (e.g. recovery, env-migrate)
 * to the Discord owner when they visit the dashboard.
 */
function reclaimOrphanLinkedGuilds(userId, ownedGuildIds = []) {
  if (!isValidDiscordUserId(userId)) return 0;
  let fixed = 0;
  for (const guildId of ownedGuildIds) {
    const row = getLinkedGuild(String(guildId));
    if (!row || !row.active) continue;
    if (String(row.linked_by) === String(userId)) continue;
    if (isValidDiscordUserId(row.linked_by)) continue;
    prepare(`UPDATE linked_guilds SET linked_by = ? WHERE guild_id = ?`).run(
      String(userId),
      String(guildId)
    );
    fixed += 1;
  }
  return fixed;
}

function listPanelStaff(guildId) {
  return prepare(
    `SELECT * FROM panel_staff WHERE guild_id = ? ORDER BY created_at ASC`
  ).all(String(guildId));
}

function countPanelStaff(guildId) {
  const row = prepare(`SELECT COUNT(*) AS c FROM panel_staff WHERE guild_id = ?`).get(String(guildId));
  return Number(row?.c || 0);
}

function isPanelStaff(guildId, userId) {
  const row = prepare(
    `SELECT user_id FROM panel_staff WHERE guild_id = ? AND user_id = ?`
  ).get(String(guildId), String(userId));
  return Boolean(row);
}

function addPanelStaff({ guildId, userId, username, addedBy }) {
  prepare(
    `INSERT OR REPLACE INTO panel_staff (guild_id, user_id, username, added_by, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(String(guildId), String(userId), username || null, String(addedBy));
  return listPanelStaff(guildId);
}

function removePanelStaff(guildId, userId) {
  return prepare(`DELETE FROM panel_staff WHERE guild_id = ? AND user_id = ?`).run(
    String(guildId),
    String(userId)
  );
}

function listGuildsForPanelUser(userId) {
  return prepare(
    `SELECT guild_id FROM panel_staff WHERE user_id = ?`
  )
    .all(String(userId))
    .map((r) => r.guild_id);
}

function listRolePermissions(guildId) {
  return prepare(
    `SELECT role_id, permission FROM role_permissions WHERE guild_id = ?`
  ).all(String(guildId));
}

function getRolePermissionMap(guildId) {
  const rows = listRolePermissions(guildId);
  const map = {};
  for (const row of rows) {
    if (!map[row.role_id]) map[row.role_id] = [];
    map[row.role_id].push(row.permission);
  }
  return map;
}

function setRolePermissions(guildId, roleId, permissions) {
  prepare(`DELETE FROM role_permissions WHERE guild_id = ? AND role_id = ?`).run(
    String(guildId),
    String(roleId)
  );
  const insert = prepare(
    `INSERT INTO role_permissions (guild_id, role_id, permission) VALUES (?, ?, ?)`
  );
  for (const perm of permissions) {
    if (!perm) continue;
    insert.run(String(guildId), String(roleId), String(perm));
  }
  return getRolePermissionMap(guildId);
}

function clearGuildRolePermissions(guildId) {
  prepare(`DELETE FROM role_permissions WHERE guild_id = ?`).run(String(guildId));
}

function memberHasPermission(guildId, member, permission) {
  if (!member || !permission) return false;
  const rows = prepare(
    `SELECT role_id FROM role_permissions WHERE guild_id = ? AND permission = ?`
  ).all(String(guildId), String(permission));
  if (!rows.length) return false;
  return rows.some((r) => member.roles.cache.has(r.role_id));
}

function guildHasCustomPermissions(guildId) {
  const row = prepare(
    `SELECT 1 AS ok FROM role_permissions WHERE guild_id = ? LIMIT 1`
  ).get(String(guildId));
  return Boolean(row);
}

function seedPlanDefinitions() {
  const { PLANS } = require('../utils/plans');
  const insert = prepare(
    `INSERT OR IGNORE INTO plan_definitions
     (plan_id, name, max_servers, max_panel_staff, monthly_price, price_label, features_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const plan of Object.values(PLANS)) {
    insert.run(
      plan.id,
      plan.name,
      plan.maxServers == null ? null : plan.maxServers,
      plan.maxPanelStaff == null ? null : plan.maxPanelStaff,
      plan.monthlyPrice || 0,
      plan.priceLabel || '',
      JSON.stringify(plan.features || {})
    );
  }
}

seedPlanDefinitions();

/** Merge any new feature keys from PLANS defaults into existing DB rows without overwriting custom values. */
function mergeMissingPlanFeatures() {
  const { PLANS } = require('../utils/plans');
  for (const plan of Object.values(PLANS)) {
    const row = prepare(`SELECT features_json FROM plan_definitions WHERE plan_id = ?`).get(plan.id);
    if (!row) continue;
    let dbFeatures = {};
    try { dbFeatures = JSON.parse(row.features_json || '{}'); } catch { dbFeatures = {}; }
    let changed = false;
    for (const [k, v] of Object.entries(plan.features)) {
      if (!(k in dbFeatures)) { dbFeatures[k] = v; changed = true; }
    }
    if (changed) {
      prepare(`UPDATE plan_definitions SET features_json = ? WHERE plan_id = ?`)
        .run(JSON.stringify(dbFeatures), plan.id);
    }
  }
}
mergeMissingPlanFeatures();

// Note: plan pricing/features are seeded once via seedPlanDefinitions (INSERT OR IGNORE)
// and are then managed exclusively through the /admin panel. Do NOT auto-sync from
// code defaults here, or admin changes will be lost on every restart.

function getPlanDefinition(planId) {
  const { PLANS } = require('../utils/plans');
  const id = String(planId || 'lobby').toLowerCase();
  const fallback = PLANS[id] || PLANS.lobby;
  const row = prepare(`SELECT * FROM plan_definitions WHERE plan_id = ?`).get(id);
  if (!row) {
    return {
      id: fallback.id,
      name: fallback.name,
      maxServers: fallback.maxServers,
      maxPanelStaff: fallback.maxPanelStaff,
      monthlyPrice: fallback.monthlyPrice,
      priceLabel: fallback.priceLabel,
      features: { ...fallback.features },
    };
  }
  let features = {};
  try {
    features = JSON.parse(row.features_json || '{}');
  } catch {
    features = { ...fallback.features };
  }
  return {
    id: row.plan_id,
    name: row.name || fallback.name,
    maxServers: row.max_servers == null ? null : Number(row.max_servers),
    maxPanelStaff: row.max_panel_staff == null ? null : Number(row.max_panel_staff),
    monthlyPrice: Number(row.monthly_price || 0),
    priceLabel: row.price_label || fallback.priceLabel,
    features: { ...fallback.features, ...features },
  };
}

function listPlanDefinitions() {
  const { PLANS } = require('../utils/plans');
  seedPlanDefinitions();
  return Object.keys(PLANS).map((id) => getPlanDefinition(id));
}

function savePlanDefinition(planId, updates) {
  const current = getPlanDefinition(planId);
  const name = updates.name || current.name;
  const maxServers =
    updates.maxServers === '' || updates.maxServers === undefined
      ? current.maxServers
      : updates.maxServers == null || updates.maxServers === 'null'
        ? null
        : Number(updates.maxServers);
  const maxPanelStaff =
    updates.maxPanelStaff === '' || updates.maxPanelStaff === undefined
      ? current.maxPanelStaff
      : updates.maxPanelStaff == null || updates.maxPanelStaff === 'null'
        ? null
        : Number(updates.maxPanelStaff);
  const monthlyPrice =
    updates.monthlyPrice == null ? current.monthlyPrice : Number(updates.monthlyPrice);
  const priceLabel = updates.priceLabel != null ? updates.priceLabel : current.priceLabel;
  const features = { ...current.features, ...(updates.features || {}) };

  prepare(
    `INSERT INTO plan_definitions
     (plan_id, name, max_servers, max_panel_staff, monthly_price, price_label, features_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(plan_id) DO UPDATE SET
       name = excluded.name,
       max_servers = excluded.max_servers,
       max_panel_staff = excluded.max_panel_staff,
       monthly_price = excluded.monthly_price,
       price_label = excluded.price_label,
       features_json = excluded.features_json,
       updated_at = datetime('now')`
  ).run(
    current.id,
    name,
    maxServers,
    maxPanelStaff,
    monthlyPrice,
    priceLabel,
    JSON.stringify(features)
  );
  return getPlanDefinition(current.id);
}

function getAppSetting(key, fallback = '') {
  const row = prepare(`SELECT value FROM app_settings WHERE key = ?`).get(String(key));
  return row ? String(row.value) : fallback;
}

function setAppSetting(key, value) {
  prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(key), String(value ?? ''));
  return getAppSetting(key);
}

function getLinkLoginConfig() {
  const envEnabled = process.env.LINK_LOGIN_ENABLED === '1' || process.env.LINK_LOGIN_ENABLED === 'true';
  const enabled = getAppSetting('link_login_enabled', envEnabled ? '1' : '0') === '1';
  const pathSlug = (getAppSetting('link_login_path', process.env.LINK_LOGIN_PATH || 'toegang') || 'toegang')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '') || 'toegang';
  const passwordHash = getAppSetting('link_login_password', process.env.LINK_LOGIN_PASSWORD || '');
  const userId = getAppSetting(
    'link_login_user_id',
    process.env.LINK_LOGIN_USER_ID || ''
  );
  return {
    enabled,
    pathSlug,
    userId,
    hasPassword: Boolean(passwordHash),
    // never expose raw password to views
  };
}

function verifyLinkLoginPassword(password) {
  const { verifyPassword, hashPassword } = require('../utils/security');
  const stored = getAppSetting('link_login_password', process.env.LINK_LOGIN_PASSWORD || '');
  const result = verifyPassword(password, stored);
  if (result.ok && result.needsRehash) {
    setAppSetting('link_login_password', hashPassword(password));
  }
  return result.ok;
}

function saveLinkLoginConfig({ enabled, pathSlug, password, userId }) {
  const { hashPassword } = require('../utils/security');
  setAppSetting('link_login_enabled', enabled ? '1' : '0');
  if (pathSlug != null) {
    const clean = String(pathSlug)
      .replace(/^\/+|\/+$/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '') || 'toegang';
    setAppSetting('link_login_path', clean);
  }
  if (password != null && String(password).length) {
    setAppSetting('link_login_password', hashPassword(String(password)));
  }
  if (userId != null) {
    setAppSetting('link_login_user_id', String(userId).trim());
  }
  return getLinkLoginConfig();
}

function cleanLinkSlug(raw, fallback = 'access') {
  const clean = String(raw || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  return clean || fallback;
}

function getGuildLinkLogin(guildId) {
  const row = prepare(`SELECT * FROM guild_link_logins WHERE guild_id = ?`).get(String(guildId));
  if (!row) {
    return {
      guildId: String(guildId),
      enabled: false,
      pathSlug: `server-${String(guildId).slice(-6)}`,
      hasPassword: false,
    };
  }
  return {
    guildId: String(row.guild_id),
    enabled: Boolean(row.enabled),
    pathSlug: String(row.path_slug),
    hasPassword: Boolean(row.password_hash),
  };
}

function getGuildLinkLoginBySlug(slug) {
  const clean = cleanLinkSlug(slug, '');
  if (!clean) return null;
  const row = prepare(
    `SELECT * FROM guild_link_logins WHERE lower(path_slug) = lower(?) AND enabled = 1`
  ).get(clean);
  if (!row) return null;
  return {
    guildId: String(row.guild_id),
    enabled: Boolean(row.enabled),
    pathSlug: String(row.path_slug),
    hasPassword: Boolean(row.password_hash),
    passwordHash: String(row.password_hash || ''),
  };
}

function isLinkSlugTaken(slug, exceptGuildId = null) {
  const clean = cleanLinkSlug(slug, '');
  if (!clean) return true;
  const global = getLinkLoginConfig();
  if (global.enabled && String(global.pathSlug).toLowerCase() === clean.toLowerCase()) {
    return true;
  }
  const row = prepare(
    `SELECT guild_id FROM guild_link_logins WHERE lower(path_slug) = lower(?)`
  ).get(clean);
  if (!row) return false;
  if (exceptGuildId && String(row.guild_id) === String(exceptGuildId)) return false;
  return true;
}

function verifyGuildLinkLoginPassword(guildId, password) {
  const { verifyPassword, hashPassword } = require('../utils/security');
  const row = prepare(`SELECT password_hash FROM guild_link_logins WHERE guild_id = ?`).get(
    String(guildId)
  );
  if (!row?.password_hash) return false;
  const result = verifyPassword(password, row.password_hash);
  if (result.ok && result.needsRehash) {
    prepare(
      `UPDATE guild_link_logins SET password_hash = ?, updated_at = datetime('now') WHERE guild_id = ?`
    ).run(hashPassword(password), String(guildId));
  }
  return result.ok;
}

function saveGuildLinkLogin(guildId, { enabled, pathSlug, password }) {
  const { hashPassword } = require('../utils/security');
  const gid = String(guildId);
  const existing = prepare(`SELECT * FROM guild_link_logins WHERE guild_id = ?`).get(gid);
  const clean = cleanLinkSlug(pathSlug, existing?.path_slug || `server-${gid.slice(-6)}`);
  if (isLinkSlugTaken(clean, gid)) {
    const err = new Error('slug_taken');
    err.code = 'slug_taken';
    throw err;
  }
  let passwordHash = existing?.password_hash || '';
  if (password != null && String(password).length) {
    passwordHash = hashPassword(String(password));
  }
  if (enabled && !passwordHash) {
    const err = new Error('password_required');
    err.code = 'password_required';
    throw err;
  }
  prepare(
    `INSERT INTO guild_link_logins (guild_id, enabled, path_slug, password_hash, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(guild_id) DO UPDATE SET
       enabled = excluded.enabled,
       path_slug = excluded.path_slug,
       password_hash = excluded.password_hash,
       updated_at = datetime('now')`
  ).run(gid, enabled ? 1 : 0, clean, passwordHash);
  return getGuildLinkLogin(gid);
}

function deleteGuildLinkLogin(guildId) {
  prepare(`DELETE FROM guild_link_logins WHERE guild_id = ?`).run(String(guildId));
}

function listGuildDisabledCommands(guildId) {
  return prepare(
    `SELECT command_name FROM guild_disabled_commands WHERE guild_id = ?`
  )
    .all(String(guildId))
    .map((r) => r.command_name);
}

function setGuildCommandDisabled(guildId, commandName, disabled) {
  const g = String(guildId);
  const c = String(commandName);
  if (disabled) {
    prepare(
      `INSERT OR IGNORE INTO guild_disabled_commands (guild_id, command_name) VALUES (?, ?)`
    ).run(g, c);
  } else {
    prepare(
      `DELETE FROM guild_disabled_commands WHERE guild_id = ? AND command_name = ?`
    ).run(g, c);
  }
}

function isGuildCommandDisabled(guildId, commandName) {
  const row = prepare(
    `SELECT 1 AS ok FROM guild_disabled_commands WHERE guild_id = ? AND command_name = ?`
  ).get(String(guildId), String(commandName));
  return Boolean(row);
}

function listUserDisabledCommands(guildId, userId) {
  return prepare(
    `SELECT command_name FROM user_disabled_commands WHERE guild_id = ? AND user_id = ?`
  )
    .all(String(guildId), String(userId))
    .map((r) => r.command_name);
}

function setUserCommandDisabled(guildId, userId, commandName, disabled) {
  const g = String(guildId);
  const u = String(userId);
  const c = String(commandName);
  if (disabled) {
    prepare(
      `INSERT OR IGNORE INTO user_disabled_commands (guild_id, user_id, command_name) VALUES (?, ?, ?)`
    ).run(g, u, c);
  } else {
    prepare(
      `DELETE FROM user_disabled_commands WHERE guild_id = ? AND user_id = ? AND command_name = ?`
    ).run(g, u, c);
  }
}

function isUserCommandDisabled(guildId, userId, commandName) {
  const row = prepare(
    `SELECT 1 AS ok FROM user_disabled_commands WHERE guild_id = ? AND user_id = ? AND command_name = ?`
  ).get(String(guildId), String(userId), String(commandName));
  return Boolean(row);
}

function listUsersWithCommandOverrides(guildId) {
  return prepare(
    `SELECT DISTINCT user_id FROM user_disabled_commands WHERE guild_id = ? ORDER BY user_id`
  )
    .all(String(guildId))
    .map((r) => r.user_id);
}

function saveTicketTranscript({
  ticketId,
  guildId,
  ticketNumber,
  subject,
  openerId,
  closerId,
  reason,
  transcript,
}) {
  prepare(
    `INSERT OR REPLACE INTO ticket_transcripts
      (ticket_id, guild_id, ticket_number, subject, opener_id, closer_id, reason, transcript, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    Number(ticketId),
    String(guildId),
    ticketNumber == null ? null : Number(ticketNumber),
    subject || null,
    openerId ? String(openerId) : null,
    closerId ? String(closerId) : null,
    reason || null,
    String(transcript || '')
  );
}

function getTicketTranscript(ticketId) {
  return prepare(`SELECT * FROM ticket_transcripts WHERE ticket_id = ?`).get(Number(ticketId));
}

function getTicketByChannel(channelId, status = null) {
  if (status) {
    return (
      prepare(`SELECT * FROM tickets WHERE channel_id = ? AND status = ?`).get(
        String(channelId),
        String(status)
      ) || null
    );
  }
  return prepare(`SELECT * FROM tickets WHERE channel_id = ?`).get(String(channelId)) || null;
}

function getTicketByNumber(guildId, ticketNumber) {
  return (
    prepare(
      `SELECT * FROM tickets WHERE guild_id = ? AND ticket_number = ? ORDER BY id DESC LIMIT 1`
    ).get(String(guildId), Number(ticketNumber)) || null
  );
}

function updateTicketFields(ticketId, fields = {}) {
  const allowed = [
    'channel_id',
    'claimed_by',
    'status',
    'subject',
    'closed_by',
    'closed_at',
    'priority',
    'priority_role_id',
    'priority_user_id',
    'notes_thread_id',
  ];
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = ?`);
    values.push(value == null ? null : value);
  }
  if (!sets.length) return getTicketById(ticketId);
  values.push(Number(ticketId));
  prepare(`UPDATE tickets SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getTicketById(ticketId);
}

function getTicketById(id) {
  return prepare(`SELECT * FROM tickets WHERE id = ?`).get(Number(id)) || null;
}

function isTicketDmMuted(guildId, userId) {
  const row = prepare(
    `SELECT 1 AS ok FROM ticket_dm_mutes WHERE guild_id = ? AND user_id = ?`
  ).get(String(guildId), String(userId));
  return Boolean(row);
}

function setTicketDmMuted(guildId, userId, muted) {
  const g = String(guildId);
  const u = String(userId);
  if (muted) {
    prepare(`INSERT OR IGNORE INTO ticket_dm_mutes (guild_id, user_id) VALUES (?, ?)`).run(g, u);
  } else {
    prepare(`DELETE FROM ticket_dm_mutes WHERE guild_id = ? AND user_id = ?`).run(g, u);
  }
}

function getGuildSettings(guildId) {
  let row = prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (!row) {
    prepare('INSERT INTO guild_settings (guild_id) VALUES (?)').run(guildId);
    row = prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  }
  return row;
}

function updateGuildSettings(guildId, updates) {
  getGuildSettings(guildId);
  const allowed = [
    'ticket_category_id',
    'ticket_log_channel_id',
    'mod_log_channel_id',
    'mute_role_id',
    'support_role_id',
    'mod_role_id',
    'welcome_message',
    'ticket_counter',
    'ticket_panel_title',
    'ticket_panel_description',
    'ticket_panel_style',
    'max_open_tickets',
    'join_channel_id',
    'join_message',
    'leave_channel_id',
    'leave_message',
    'embed_color',
    'suggestion_channel_id',
    'auto_role_id',
    'bot_nick',
    'bot_avatar_url',
    'bot_avatar_path',
    'locale',
    'layout_json',
    'layout_blueprint_json',
    'announce_channel_id',
    'ticket_panel_channel_id',
    'xp_multiplier',
    'bot_status_text',
  ];
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!allowed.includes(key)) continue;
    sets.push(`${key} = ?`);
    values.push(value);
  }
  if (!sets.length) return getGuildSettings(guildId);
  sets.push(`updated_at = datetime('now')`);
  values.push(guildId);
  prepare(`UPDATE guild_settings SET ${sets.join(', ')} WHERE guild_id = ?`).run(...values);
  return getGuildSettings(guildId);
}

function nextTicketNumber(guildId) {
  const settings = getGuildSettings(guildId);
  const next = (settings.ticket_counter || 0) + 1;
  updateGuildSettings(guildId, { ticket_counter: next });
  return next;
}

function parseTicketTypeQuestions(raw) {
  let list = [];
  try {
    list = JSON.parse(raw || '[]');
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 5)
    .map((q, i) => {
      const label = String(q?.label || q?.question || '')
        .trim()
        .slice(0, 45);
      if (!label) return null;
      const item = {
        id:
          String(q?.id || `q${i + 1}`)
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .slice(0, 40) || `q${i + 1}`,
        label,
        style: String(q?.style || '').toLowerCase() === 'short' ? 'short' : 'paragraph',
        required: q?.required !== false && q?.required !== 0 && q?.required !== '0',
      };
      const placeholder = String(q?.placeholder || '').trim().slice(0, 100);
      if (placeholder) item.placeholder = placeholder;
      return item;
    })
    .filter(Boolean);
}

function serializeTicketTypeQuestions(input) {
  if (Array.isArray(input)) {
    return JSON.stringify(parseTicketTypeQuestions(JSON.stringify(input)));
  }
  return JSON.stringify(parseTicketTypeQuestions(input));
}

function mapTicketTypeRow(row) {
  if (!row) return null;
  return {
    ...row,
    questions: parseTicketTypeQuestions(row.questions_json),
  };
}

function getTicketTypes(guildId) {
  return prepare(`SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY id ASC`)
    .all(String(guildId))
    .map(mapTicketTypeRow);
}

function getTicketType(id, guildId = null) {
  const row = guildId
    ? prepare(`SELECT * FROM ticket_types WHERE id = ? AND guild_id = ?`).get(
        Number(id),
        String(guildId)
      )
    : prepare(`SELECT * FROM ticket_types WHERE id = ?`).get(Number(id));
  return mapTicketTypeRow(row);
}

function addTicketType(guildId, name, emoji, description, questions = []) {
  return prepare(
    `INSERT INTO ticket_types (guild_id, name, emoji, description, questions_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    String(guildId),
    name,
    emoji || '🎫',
    description || '',
    serializeTicketTypeQuestions(questions)
  );
}

function updateTicketType(id, guildId, { name, emoji, description, questions } = {}) {
  const existing = getTicketType(id, guildId);
  if (!existing) return null;
  prepare(
    `UPDATE ticket_types
     SET name = ?, emoji = ?, description = ?, questions_json = ?
     WHERE id = ? AND guild_id = ?`
  ).run(
    name != null ? String(name).trim() || existing.name : existing.name,
    emoji != null ? String(emoji).trim() || '🎫' : existing.emoji || '🎫',
    description != null ? String(description).trim() : existing.description || '',
    questions !== undefined
      ? serializeTicketTypeQuestions(questions)
      : existing.questions_json || '[]',
    Number(id),
    String(guildId)
  );
  return getTicketType(id, guildId);
}

function deleteTicketType(id, guildId) {
  return prepare(`DELETE FROM ticket_types WHERE id = ? AND guild_id = ?`).run(
    Number(id),
    String(guildId)
  );
}

function getCustomPrefixCommands(guildId) {
  return prepare(
    `SELECT * FROM custom_prefix_commands WHERE guild_id = ? ORDER BY id ASC`
  ).all(String(guildId));
}

function getCustomPrefixCommand(id, guildId = null) {
  const row = guildId
    ? prepare(`SELECT * FROM custom_prefix_commands WHERE id = ? AND guild_id = ?`).get(
        Number(id),
        String(guildId)
      )
    : prepare(`SELECT * FROM custom_prefix_commands WHERE id = ?`).get(Number(id));
  return row || null;
}

function countCustomPrefixCommands(guildId) {
  const row = prepare(
    `SELECT COUNT(*) AS n FROM custom_prefix_commands WHERE guild_id = ?`
  ).get(String(guildId));
  return Number(row?.n || 0);
}

function addCustomPrefixCommand(guildId, trigger, response, channelId = null) {
  return prepare(
    `INSERT INTO custom_prefix_commands (guild_id, trigger, response, channel_id)
     VALUES (?, ?, ?, ?)`
  ).run(String(guildId), trigger, response, channelId || null);
}

function updateCustomPrefixCommand(id, guildId, { trigger, response, channel_id } = {}) {
  const existing = getCustomPrefixCommand(id, guildId);
  if (!existing) return null;
  prepare(
    `UPDATE custom_prefix_commands
     SET trigger = ?, response = ?, channel_id = ?
     WHERE id = ? AND guild_id = ?`
  ).run(
    trigger != null ? String(trigger).trim() : existing.trigger,
    response != null ? String(response) : existing.response,
    channel_id !== undefined ? channel_id || null : existing.channel_id,
    Number(id),
    String(guildId)
  );
  return getCustomPrefixCommand(id, guildId);
}

function deleteCustomPrefixCommand(id, guildId) {
  return prepare(`DELETE FROM custom_prefix_commands WHERE id = ? AND guild_id = ?`).run(
    Number(id),
    String(guildId)
  );
}

function createPoll({ guildId, channelId, question, endsAt, createdBy, allowMulti, voteOnce, options }) {
  const info = prepare(
    `INSERT INTO polls (guild_id, channel_id, question, ends_at, created_by, allow_multi, vote_once)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    guildId,
    channelId,
    question,
    endsAt,
    createdBy,
    allowMulti ? 1 : 0,
    voteOnce === false ? 0 : 1
  );

  const pollId = info.lastInsertRowid;
  const insertOpt = prepare(
    `INSERT INTO poll_options (poll_id, label, emoji, sort_order, is_good) VALUES (?, ?, ?, ?, ?)`
  );
  options.forEach((opt, i) => {
    insertOpt.run(pollId, opt.label, opt.emoji || '▪️', i, opt.isGood ? 1 : 0);
  });
  return pollId;
}

function getPoll(pollId) {
  return prepare(`SELECT * FROM polls WHERE id = ?`).get(pollId);
}

function getPollOptions(pollId) {
  return prepare(`SELECT * FROM poll_options WHERE poll_id = ? ORDER BY sort_order ASC, id ASC`).all(pollId);
}

function getPollVoteCounts(pollId) {
  return prepare(
    `SELECT option_id, COUNT(*) AS votes FROM poll_votes WHERE poll_id = ? GROUP BY option_id`
  ).all(pollId);
}

function setPollMessage(pollId, messageId) {
  prepare(`UPDATE polls SET message_id = ? WHERE id = ?`).run(messageId, pollId);
}

function listGuildPolls(guildId, limit = 20) {
  return prepare(`SELECT * FROM polls WHERE guild_id = ? ORDER BY id DESC LIMIT ?`).all(guildId, limit);
}

function createGiveaway({
  guildId,
  channelId,
  title,
  prize,
  prizeDm,
  description,
  imageUrl,
  winnersCount,
  endsAt,
  requiredRoleId,
  hostId,
}) {
  const info = prepare(
    `INSERT INTO giveaways
      (guild_id, channel_id, title, prize, prize_dm, description, image_url, winners_count, ends_at, required_role_id, host_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(
    String(guildId),
    String(channelId),
    String(title).slice(0, 200),
    String(prize).slice(0, 200),
    prizeDm ? String(prizeDm).slice(0, 1500) : null,
    description ? String(description).slice(0, 1000) : null,
    imageUrl || null,
    Math.max(1, Math.min(20, Number(winnersCount) || 1)),
    Number(endsAt),
    requiredRoleId || null,
    hostId ? String(hostId) : null
  );
  return info.lastInsertRowid;
}

function getGiveaway(id) {
  return prepare(`SELECT * FROM giveaways WHERE id = ?`).get(Number(id));
}

function deleteGiveaway(id) {
  prepare(`DELETE FROM giveaway_entries WHERE giveaway_id = ?`).run(Number(id));
  return prepare(`DELETE FROM giveaways WHERE id = ?`).run(Number(id));
}

function setGiveawayMessage(id, messageId) {
  prepare(`UPDATE giveaways SET message_id = ? WHERE id = ?`).run(String(messageId), Number(id));
}

function listGuildGiveaways(guildId, limit = 20) {
  return prepare(`SELECT * FROM giveaways WHERE guild_id = ? ORDER BY id DESC LIMIT ?`).all(
    String(guildId),
    limit
  );
}

function listExpiredActiveGiveaways() {
  return prepare(
    `SELECT id FROM giveaways WHERE status = 'active' AND ends_at <= ?`
  ).all(Date.now());
}

function endGiveaway(id) {
  prepare(`UPDATE giveaways SET status = 'ended' WHERE id = ?`).run(Number(id));
}

function setGiveawayWinners(id, winnerIds) {
  prepare(`UPDATE giveaways SET winner_ids = ?, status = 'ended' WHERE id = ?`).run(
    JSON.stringify(winnerIds || []),
    Number(id)
  );
}

function addGiveawayEntry(giveawayId, userId) {
  prepare(
    `INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)`
  ).run(Number(giveawayId), String(userId));
}

function hasGiveawayEntry(giveawayId, userId) {
  return Boolean(
    prepare(
      `SELECT 1 AS ok FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?`
    ).get(Number(giveawayId), String(userId))
  );
}

function getGiveawayEntryCount(giveawayId) {
  const row = prepare(
    `SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?`
  ).get(Number(giveawayId));
  return Number(row?.c || 0);
}

function listGiveawayEntries(giveawayId) {
  return prepare(
    `SELECT user_id, entered_at FROM giveaway_entries WHERE giveaway_id = ?`
  ).all(Number(giveawayId));
}

function isGuildLinked(guildId) {
  const row = prepare(`SELECT guild_id FROM linked_guilds WHERE guild_id = ? AND active = 1`).get(guildId);
  return Boolean(row);
}

function listLinkedGuilds() {
  return prepare(`SELECT * FROM linked_guilds WHERE active = 1 ORDER BY linked_at DESC`).all();
}

function getLinkedGuild(guildId) {
  return prepare(`SELECT * FROM linked_guilds WHERE guild_id = ?`).get(guildId);
}

function linkGuild({ guildId, guildName, linkedBy }) {
  const existing = getLinkedGuild(guildId);
  if (existing) {
    prepare(
      `UPDATE linked_guilds SET active = 1, guild_name = ?, linked_by = ?, linked_at = datetime('now') WHERE guild_id = ?`
    ).run(guildName || existing.guild_name, linkedBy, guildId);
  } else {
    prepare(
      `INSERT INTO linked_guilds (guild_id, guild_name, linked_by, active) VALUES (?, ?, ?, 1)`
    ).run(guildId, guildName || null, linkedBy);
  }
  getGuildSettings(guildId);
  return getLinkedGuild(guildId);
}

function unlinkGuild(guildId) {
  prepare(`UPDATE linked_guilds SET active = 0 WHERE guild_id = ?`).run(guildId);
  prepare(`DELETE FROM guild_link_logins WHERE guild_id = ?`).run(String(guildId));
}

function migrateEnvGuilds() {
  const fromEnv = (process.env.ALLOWED_GUILDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  for (const guildId of fromEnv) {
    if (!isGuildLinked(guildId)) {
      linkGuild({ guildId, guildName: null, linkedBy: 'env-migrate' });
    }
  }
}

function getGuildHealthStats(guildId) {
  const gid = String(guildId);
  const openTickets = prepare(
    `SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ? AND status = 'open'`
  ).get(gid).c;
  const closedTickets = prepare(
    `SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ? AND status = 'closed'`
  ).get(gid).c;
  const activeWarnings = prepare(
    `SELECT COUNT(*) AS c FROM warnings WHERE guild_id = ? AND active = 1`
  ).get(gid).c;
  const modActions24h = prepare(
    `SELECT COUNT(*) AS c FROM mod_actions WHERE guild_id = ? AND created_at >= datetime('now', '-1 day')`
  ).get(gid).c;
  const recentActions = prepare(
    `SELECT action, target_id, moderator_id, reason, created_at
     FROM mod_actions WHERE guild_id = ?
     ORDER BY datetime(created_at) DESC LIMIT 12`
  ).all(gid);
  const recentTickets = prepare(
    `SELECT id, channel_id, opener_id, status, subject, ticket_number, created_at, closed_at
     FROM tickets WHERE guild_id = ?
     ORDER BY datetime(created_at) DESC LIMIT 8`
  ).all(gid);
  const activePolls = prepare(
    `SELECT COUNT(*) AS c FROM polls WHERE guild_id = ? AND status = 'active'`
  ).get(gid).c;
  const activeGiveaways = prepare(
    `SELECT COUNT(*) AS c FROM giveaways WHERE guild_id = ? AND status = 'active'`
  ).get(gid).c;
  const disabledCommands = listGuildDisabledCommands(gid).length;

  return {
    openTickets,
    closedTickets,
    activeWarnings,
    modActions24h,
    recentActions,
    recentTickets,
    activePolls,
    activeGiveaways,
    disabledCommands,
  };
}

function capPurgeExpired() {
  const now = Date.now();
  prepare(`DELETE FROM cap_nonces WHERE expires_at < ?`).run(now);
  prepare(`DELETE FROM cap_tokens WHERE expires_at < ?`).run(now);
}

function capConsumeNonce(sigHex, ttlMs) {
  const expiresAt = Date.now() + Math.max(1000, Number(ttlMs) || 600000);
  try {
    const r = prepare(`INSERT INTO cap_nonces (sig, expires_at) VALUES (?, ?)`).run(
      String(sigHex),
      expiresAt
    );
    return r.changes > 0;
  } catch {
    return false;
  }
}

function capStoreRedeemToken(tokenKey, expiresAt) {
  prepare(
    `INSERT OR REPLACE INTO cap_tokens (token_key, expires_at) VALUES (?, ?)`
  ).run(String(tokenKey), Number(expiresAt) || Date.now() + 1_200_000);
}

function capConsumeRedeemToken(tokenKey) {
  const row = prepare(`SELECT expires_at FROM cap_tokens WHERE token_key = ?`).get(
    String(tokenKey)
  );
  if (!row) return false;
  prepare(`DELETE FROM cap_tokens WHERE token_key = ?`).run(String(tokenKey));
  return Number(row.expires_at) >= Date.now();
}

function createSupportThread({ userId, username, subject, body }) {
  const sub = String(subject || 'Support').trim().slice(0, 120) || 'Support';
  const msg = String(body || '').trim().slice(0, 4000);
  if (!msg) return null;
  const t = prepare(
    `INSERT INTO support_threads (user_id, username, subject) VALUES (?, ?, ?)`
  ).run(String(userId), String(username || '').slice(0, 100), sub);
  const threadId = t.lastInsertRowid;
  prepare(
    `INSERT INTO support_messages (thread_id, sender_type, sender_id, sender_name, body)
     VALUES (?, 'user', ?, ?, ?)`
  ).run(threadId, String(userId), String(username || '').slice(0, 100), msg);
  return getSupportThread(threadId);
}

function addSupportMessage({ threadId, senderType, senderId, senderName, body }) {
  const msg = String(body || '').trim().slice(0, 4000);
  if (!msg) return null;
  prepare(
    `INSERT INTO support_messages (thread_id, sender_type, sender_id, sender_name, body)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    Number(threadId),
    String(senderType),
    senderId ? String(senderId) : null,
    String(senderName || '').slice(0, 100),
    msg
  );
  prepare(
    `UPDATE support_threads SET updated_at = datetime('now') WHERE id = ?`
  ).run(Number(threadId));
  return true;
}

function getSupportThread(id) {
  return prepare(`SELECT * FROM support_threads WHERE id = ?`).get(Number(id)) || null;
}

function listSupportMessages(threadId) {
  return prepare(
    `SELECT * FROM support_messages WHERE thread_id = ? ORDER BY id ASC`
  ).all(Number(threadId));
}

function listSupportThreadsForUser(userId) {
  return prepare(
    `SELECT * FROM support_threads WHERE user_id = ? ORDER BY datetime(updated_at) DESC LIMIT 50`
  ).all(String(userId));
}

function listOpenSupportThreads(limit = 80) {
  return prepare(
    `SELECT t.*,
      (SELECT body FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message,
      (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id) AS message_count
     FROM support_threads t
     WHERE t.status = 'open'
     ORDER BY datetime(t.updated_at) DESC
     LIMIT ?`
  ).all(Number(limit) || 80);
}

function listRecentSupportThreads(limit = 40) {
  return prepare(
    `SELECT t.*,
      (SELECT body FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message
     FROM support_threads t
     ORDER BY datetime(t.updated_at) DESC
     LIMIT ?`
  ).all(Number(limit) || 40);
}

function setSupportThreadStatus(id, status) {
  const st = status === 'closed' ? 'closed' : 'open';
  prepare(
    `UPDATE support_threads SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(st, Number(id));
}

/** Permanently remove a support thread and all of its messages. */
function deleteSupportThread(id) {
  const tid = Number(id);
  if (!Number.isFinite(tid) || tid < 1) return false;
  const thread = getSupportThread(tid);
  if (!thread) return false;
  prepare(`DELETE FROM support_messages WHERE thread_id = ?`).run(tid);
  prepare(`DELETE FROM support_threads WHERE id = ?`).run(tid);
  return true;
}

function searchSupportThreads(query, limit = 60) {
  const q = String(query || '').trim();
  if (!q) return listRecentSupportThreads(limit);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  return prepare(
    `SELECT t.*,
      (SELECT body FROM support_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message
     FROM support_threads t
     WHERE lower(COALESCE(t.username, '')) LIKE lower(?)
        OR t.user_id LIKE ?
        OR lower(COALESCE(t.subject, '')) LIKE lower(?)
        OR CAST(t.id AS TEXT) = ?
     ORDER BY datetime(t.updated_at) DESC
     LIMIT ?`
  ).all(like, like, like, q, Math.min(200, Math.max(1, Number(limit) || 60)));
}

function countOpenSupportThreads() {
  return prepare(`SELECT COUNT(*) AS c FROM support_threads WHERE status = 'open'`).get().c;
}

function listPasskeysForUser(userId) {
  return prepare(
    `SELECT id, user_id, credential_id, counter, transports_json, device_type, backed_up, created_at
     FROM webauthn_credentials WHERE user_id = ? ORDER BY id ASC`
  ).all(String(userId));
}

function countPasskeysForUser(userId) {
  return prepare(`SELECT COUNT(*) AS c FROM webauthn_credentials WHERE user_id = ?`).get(
    String(userId)
  ).c;
}

function getPasskeyByCredentialId(credentialId) {
  return (
    prepare(`SELECT * FROM webauthn_credentials WHERE credential_id = ?`).get(String(credentialId)) ||
    null
  );
}

function savePasskey({
  userId,
  credentialId,
  publicKey,
  counter,
  transports,
  deviceType,
  backedUp,
}) {
  const pk =
    typeof publicKey === 'string'
      ? publicKey
      : Buffer.from(publicKey).toString('base64');
  prepare(
    `INSERT INTO webauthn_credentials
     (user_id, credential_id, public_key, counter, transports_json, device_type, backed_up)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    String(userId),
    String(credentialId),
    pk,
    Number(counter) || 0,
    JSON.stringify(transports || []),
    deviceType || null,
    backedUp ? 1 : 0
  );
  return getPasskeyByCredentialId(credentialId);
}

function updatePasskeyCounter(credentialId, counter) {
  prepare(`UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?`).run(
    Number(counter) || 0,
    String(credentialId)
  );
}

function deletePasskey(userId, credentialId) {
  return prepare(`DELETE FROM webauthn_credentials WHERE user_id = ? AND credential_id = ?`).run(
    String(userId),
    String(credentialId)
  );
}

function setPasskeyLoginEnabled(userId, enabled) {
  if (!isValidDiscordUserId(userId)) return null;
  getUserAccount(userId);
  prepare(
    `UPDATE user_accounts SET passkey_login_enabled = ?, updated_at = datetime('now') WHERE user_id = ?`
  ).run(enabled ? 1 : 0, String(userId));
  return getUserAccount(userId);
}

function isPasskeyLoginEnabled(userId) {
  const row = getUserAccount(userId);
  return Boolean(row?.passkey_login_enabled);
}

function levelXpNeededForLevel(level) {
  const lv = Math.max(1, Number(level) || 1);
  return 100 + (lv - 1) * 35;
}

function levelFromXp(xp) {
  let current = Math.max(0, Number(xp) || 0);
  let level = 1;
  while (current >= levelXpNeededForLevel(level)) {
    current -= levelXpNeededForLevel(level);
    level += 1;
  }
  return level;
}

function ensureLevelProfile(guildId, userId) {
  const gid = String(guildId);
  const uid = String(userId);
  prepare(
    `INSERT OR IGNORE INTO level_profiles (guild_id, user_id, xp, level) VALUES (?, ?, 0, 1)`
  ).run(gid, uid);
}

function getLevelProfile(guildId, userId) {
  ensureLevelProfile(guildId, userId);
  return (
    prepare(`SELECT * FROM level_profiles WHERE guild_id = ? AND user_id = ?`).get(
      String(guildId),
      String(userId)
    ) || null
  );
}

function setLevelBackground(guildId, userId, backgroundUrl) {
  ensureLevelProfile(guildId, userId);
  const bg = String(backgroundUrl || '').trim().slice(0, 500);
  prepare(
    `UPDATE level_profiles
     SET background_url = ?, updated_at = datetime('now')
     WHERE guild_id = ? AND user_id = ?`
  ).run(bg || null, String(guildId), String(userId));
  return getLevelProfile(guildId, userId);
}

function getLevelRank(guildId, userId) {
  const row = prepare(
    `SELECT 1 + COUNT(*) AS rank
     FROM level_profiles
     WHERE guild_id = ?
       AND xp > (SELECT xp FROM level_profiles WHERE guild_id = ? AND user_id = ?)`
  ).get(String(guildId), String(guildId), String(userId));
  return Number(row?.rank || 1);
}

function awardLevelXpForMessage(
  guildId,
  userId,
  { nowMs = Date.now(), cooldownMs = 60_000, minXp = 15, maxXp = 25 } = {}
) {
  const gid = String(guildId);
  const uid = String(userId);
  ensureLevelProfile(gid, uid);
  const current = prepare(
    `SELECT last_earned_at FROM level_xp_cooldowns WHERE guild_id = ? AND user_id = ?`
  ).get(gid, uid);
  const last = Number(current?.last_earned_at || 0);
  if (last > 0 && nowMs - last < cooldownMs) {
    return { awarded: false, reason: 'cooldown', profile: getLevelProfile(gid, uid) };
  }

  const settings = getGuildSettings(gid);
  const multiplier = Math.max(1, Math.min(5, Number(settings?.xp_multiplier) || 1));
  const baseGained = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;
  const gained = Math.round(baseGained * multiplier);
  const before = getLevelProfile(gid, uid);
  const totalXp = Number(before?.xp || 0) + gained;
  const level = levelFromXp(totalXp);
  prepare(
    `UPDATE level_profiles SET xp = ?, level = ?, updated_at = datetime('now')
     WHERE guild_id = ? AND user_id = ?`
  ).run(totalXp, level, gid, uid);
  prepare(
    `INSERT INTO level_xp_cooldowns (guild_id, user_id, last_earned_at)
     VALUES (?, ?, ?)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET last_earned_at = excluded.last_earned_at`
  ).run(gid, uid, Number(nowMs));

  const after = getLevelProfile(gid, uid);
  return {
    awarded: true,
    gained,
    leveledUp: Number(after.level || 1) > Number(before?.level || 1),
    profile: after,
  };
}

migrateEnvGuilds();

module.exports = {
  db: { prepare },
  getGuildSettings,
  updateGuildSettings,
  nextTicketNumber,
  getTicketTypes,
  getTicketType,
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
  getPollVoteCounts,
  setPollMessage,
  listGuildPolls,
  createGiveaway,
  getGiveaway,
  deleteGiveaway,
  setGiveawayMessage,
  listGuildGiveaways,
  listExpiredActiveGiveaways,
  endGiveaway,
  setGiveawayWinners,
  addGiveawayEntry,
  hasGiveawayEntry,
  getGiveawayEntryCount,
  listGiveawayEntries,
  isGuildLinked,
  listLinkedGuilds,
  getLinkedGuild,
  linkGuild,
  unlinkGuild,
  getUserAccount,
  touchUserAccount,
  setUserPlan,
  listUserAccounts,
  searchUserAccounts,
  listLinkedGuildsByUser,
  isValidDiscordUserId,
  deleteInvalidUserAccounts,
  countLinkedByUser,
  reclaimOrphanLinkedGuilds,
  listPanelStaff,
  countPanelStaff,
  isPanelStaff,
  addPanelStaff,
  removePanelStaff,
  listGuildsForPanelUser,
  listRolePermissions,
  getRolePermissionMap,
  setRolePermissions,
  clearGuildRolePermissions,
  memberHasPermission,
  guildHasCustomPermissions,
  getPlanDefinition,
  listPlanDefinitions,
  savePlanDefinition,
  getAppSetting,
  setAppSetting,
  getLinkLoginConfig,
  verifyLinkLoginPassword,
  saveLinkLoginConfig,
  getGuildLinkLogin,
  getGuildLinkLoginBySlug,
  saveGuildLinkLogin,
  verifyGuildLinkLoginPassword,
  deleteGuildLinkLogin,
  isLinkSlugTaken,
  listGuildDisabledCommands,
  setGuildCommandDisabled,
  isGuildCommandDisabled,
  listUserDisabledCommands,
  setUserCommandDisabled,
  isUserCommandDisabled,
  listUsersWithCommandOverrides,
  saveTicketTranscript,
  getTicketTranscript,
  getTicketByChannel,
  getTicketByNumber,
  getTicketById,
  updateTicketFields,
  isTicketDmMuted,
  setTicketDmMuted,
  getGuildHealthStats,
  capPurgeExpired,
  capConsumeNonce,
  capStoreRedeemToken,
  capConsumeRedeemToken,
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
  listPasskeysForUser,
  countPasskeysForUser,
  getPasskeyByCredentialId,
  savePasskey,
  updatePasskeyCounter,
  deletePasskey,
  setPasskeyLoginEnabled,
  isPasskeyLoginEnabled,
  getLevelProfile,
  setLevelBackground,
  getLevelRank,
  awardLevelXpForMessage,
};
