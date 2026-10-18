const {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { getGuildSettings, isGuildLinked, listLinkedGuilds } = require('../database/db');

const MOD_COMMANDS = new Set([
  'kick',
  'ban',
  'tempban',
  'unban',
  'mute',
  'unmute',
  'warn',
  'warnings',
  'delwarn',
  'purge',
  'lock',
  'unlock',
  'slowmode',
  'nickname',
  'timeout',
  'softban',
  'addrole',
  'removerole',
  'poll',
  'announce',
  'giveaway',
]);

/** Discord permission bits from OAuth guild objects */
const OAUTH_ADMINISTRATOR = 0x8n;
const OAUTH_MANAGE_GUILD = 0x20n;

function parseAllowedGuilds() {
  return (process.env.ALLOWED_GUILDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function isGuildAllowed(guildId) {
  if (isGuildLinked(guildId)) return true;
  return parseAllowedGuilds().includes(guildId);
}

function getLinkedGuildIds() {
  const ids = new Set(listLinkedGuilds().map((g) => g.guild_id));
  for (const id of parseAllowedGuilds()) ids.add(id);
  return [...ids];
}

function isOwner(userId) {
  return (process.env.BOT_OWNER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(String(userId));
}

/** Platform-admin voor /admin — alleen Discord snowflake IDs (+ optionele usernames, geen default). */
function isPlatformAdmin(user) {
  if (!user || typeof user !== 'object') return false;
  if (isOwner(user.id)) return true;

  const idAllow = (process.env.PLATFORM_ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (idAllow.includes(String(user.id))) return true;

  const username = String(user.username || '')
    .toLowerCase()
    .trim();
  if (!username) return false;
  const allowed = (process.env.PLATFORM_ADMIN_USERNAMES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(username);
}

/**
 * OAuth guild: Discord owner, Administrator, or Manage Server
 * → Reedhall guild-owner rights (no manual user IDs).
 */
function oauthHasGuildOwnerPower(oauthGuild) {
  if (!oauthGuild) return false;
  if (oauthGuild.owner) return true;
  try {
    const p = BigInt(oauthGuild.permissions || '0');
    return (
      (p & OAUTH_ADMINISTRATOR) === OAUTH_ADMINISTRATOR ||
      (p & OAUTH_MANAGE_GUILD) === OAUTH_MANAGE_GUILD
    );
  } catch {
    return false;
  }
}

/**
 * Live Discord member: server owner, Administrator, or Manage Server.
 */
function memberHasGuildOwnerPower(member, guild) {
  if (!guild) return false;
  const uid = member?.id || member?.user?.id;
  if (uid && String(guild.ownerId) === String(uid)) return true;
  if (!member?.permissions) return false;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

function hasModRole(member, settings = null) {
  if (!member) return false;
  if (isOwner(member.id)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === member.guild.ownerId) return true;

  const { guildHasCustomPermissions, memberHasPermission } = require('../database/db');
  if (guildHasCustomPermissions(member.guild.id)) {
    return (
      memberHasPermission(member.guild.id, member, 'mod.basic') ||
      memberHasPermission(member.guild.id, member, 'mod.advanced') ||
      memberHasPermission(member.guild.id, member, 'mod.channel') ||
      memberHasPermission(member.guild.id, member, 'mod.roles')
    );
  }

  const cfg = settings || getGuildSettings(member.guild.id);
  if (!cfg.mod_role_id) return false;
  return member.roles.cache.has(cfg.mod_role_id);
}

function hasBotFunction(member, functionId, settings = null) {
  if (!member || !functionId) return false;
  if (isOwner(member.id)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.id === member.guild.ownerId) return true;

  const { guildHasCustomPermissions, memberHasPermission } = require('../database/db');
  if (guildHasCustomPermissions(member.guild.id)) {
    return memberHasPermission(member.guild.id, member, functionId);
  }

  // Fallback: oude mod-rol dekt de meeste staff-functies
  if (functionId.startsWith('mod.') || functionId === 'tickets.manage' || functionId === 'polls.manage' || functionId === 'giveaways.manage' || functionId === 'announce') {
    return hasModRole(member, settings);
  }
  if (functionId === 'panel.access') {
    return hasModRole(member, settings) || memberHasGuildOwnerPower(member, member.guild);
  }
  return hasModRole(member, settings);
}

function hasSupportAccess(member, settings = null) {
  if (!member) return false;
  const cfg = settings || getGuildSettings(member.guild.id);
  if (hasModRole(member, cfg)) return true;
  if (cfg.support_role_id && member.roles.cache.has(cfg.support_role_id)) return true;
  return false;
}

function hasModPerms(member) {
  return hasModRole(member);
}

function canModerate(moderator, target) {
  if (!moderator || !target) return { ok: false, reason: 'Lid niet gevonden.' };
  if (moderator.id === target.id) return { ok: false, reason: 'Je kunt dit niet op jezelf toepassen.' };
  if (target.id === moderator.client.user.id) return { ok: false, reason: 'Ik kan niet mezelf modereren.' };
  if (isOwner(target.id)) return { ok: false, reason: 'Je kunt de bot-eigenaar niet modereren.' };
  if (target.id === target.guild.ownerId) return { ok: false, reason: 'Je kunt de server-eigenaar niet modereren.' };
  if (moderator.id !== target.guild.ownerId && moderator.roles.highest.position <= target.roles.highest.position) {
    return { ok: false, reason: 'Dit lid heeft een hogere of gelijke rol.' };
  }
  return { ok: true };
}

function baseEmbed(color = 0x0f766e) {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

async function sendModLog(guild, embed) {
  try {
    const settings = getGuildSettings(guild.id);
    if (!settings.mod_log_channel_id) return;
    const channel = await guild.channels.fetch(settings.mod_log_channel_id).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    await channel.send({ embeds: [embed] });
  } catch {
    // ignore
  }
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return 'permanent';
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}u`);
  if (mins) parts.push(`${mins}m`);
  if (!parts.length) parts.push(`${sec % 60}s`);
  return parts.join(' ');
}

function botInviteUrl(guildId = null) {
  const { BOT_INVITE_PERMISSIONS } = require('./security');
  const clientId = process.env.CLIENT_ID;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: BOT_INVITE_PERMISSIONS,
    scope: 'bot applications.commands',
  });
  if (guildId) {
    params.set('guild_id', guildId);
    params.set('disable_guild_select', 'true');
  }
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

async function botCanPostInChannel(channel) {
  if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
    return { ok: false, missing: ['ViewChannel'] };
  }
  const guild = channel.guild;
  if (!guild) return { ok: false, missing: ['ViewChannel'] };
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) return { ok: false, missing: ['ViewChannel'] };
  const perms = channel.permissionsFor(me);
  if (!perms) return { ok: false, missing: ['ViewChannel'] };
  const needed = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ];
  const names = {
    [PermissionFlagsBits.ViewChannel]: 'View Channel',
    [PermissionFlagsBits.SendMessages]: 'Send Messages',
    [PermissionFlagsBits.EmbedLinks]: 'Embed Links',
  };
  const missing = needed.filter((bit) => !perms.has(bit)).map((bit) => names[bit]);
  return { ok: missing.length === 0, missing };
}

module.exports = {
  MOD_COMMANDS,
  parseAllowedGuilds,
  isGuildAllowed,
  getLinkedGuildIds,
  isOwner,
  isPlatformAdmin,
  oauthHasGuildOwnerPower,
  memberHasGuildOwnerPower,
  hasModRole,
  hasBotFunction,
  hasSupportAccess,
  hasModPerms,
  canModerate,
  baseEmbed,
  sendModLog,
  formatDuration,
  botInviteUrl,
  botCanPostInChannel,
};
