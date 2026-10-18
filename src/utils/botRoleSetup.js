'use strict';

const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { BOT_INVITE_PERMISSIONS } = require('./security');
const { getGuildSettings } = require('../database/db');

const ROLE_NAME = 'Reedhall';

const CATEGORY_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.ManageThreads,
];

function categoryAllowBits() {
  return Object.fromEntries(CATEGORY_ALLOW.map((bit) => [bit, true]));
}

/**
 * Create (or reuse) a Reedhall role with chat + bot permissions, assign it to the bot,
 * and move it as high in the hierarchy as Discord allows.
 */
async function ensureBotRole(guild) {
  if (!guild) return { ok: false, reason: 'no_guild' };

  await guild.roles.fetch().catch(() => null);
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) return { ok: false, reason: 'no_member' };

  const canManageRoles =
    me.permissions.has(PermissionFlagsBits.ManageRoles) ||
    me.permissions.has(PermissionFlagsBits.Administrator);
  if (!canManageRoles) {
    console.warn(
      `[botRole] ${guild.name}: missing Manage Roles — invite Reedhall with role management permission.`
    );
    return { ok: false, reason: 'missing_manage_roles' };
  }

  const targetPermissions = BigInt(BOT_INVITE_PERMISSIONS);

  let role = guild.roles.cache.find(
    (r) => !r.managed && r.name.toLowerCase() === ROLE_NAME.toLowerCase()
  );

  if (!role) {
    role = await guild.roles
      .create({
        name: ROLE_NAME,
        permissions: targetPermissions,
        reason: 'Reedhall auto-setup: bot permissions role',
        hoist: false,
        mentionable: false,
      })
      .catch((err) => {
        console.error(`[botRole] create failed in ${guild.name}:`, err.message);
        return null;
      });
  } else {
    const missing = targetPermissions & ~role.permissions.bitfield;
    if (missing > 0n) {
      await role
        .setPermissions(role.permissions.bitfield | missing, 'Reedhall auto-setup: add missing permissions')
        .catch((err) => {
          console.warn(`[botRole] permission update failed in ${guild.name}:`, err.message);
        });
    }
  }

  if (!role) return { ok: false, reason: 'create_failed' };

  if (!me.roles.cache.has(role.id)) {
    await me.roles.add(role, 'Reedhall auto-setup').catch((err) => {
      console.error(`[botRole] assign failed in ${guild.name}:`, err.message);
      return null;
    });
  }

  if (role.editable) {
    const editable = guild.roles.cache.filter(
      (r) => r.editable && !r.managed && r.id !== role.id
    );
    const maxPos = editable.reduce((max, r) => Math.max(max, r.position), 0);
    if (role.position < maxPos) {
      await role.setPosition(maxPos, { reason: 'Reedhall auto-setup: role hierarchy' }).catch(() => null);
    }
  }

  console.log(`[botRole] ${guild.name}: role "${ROLE_NAME}" ready (${role.id})`);
  return { ok: true, roleId: role.id };
}

/** Allow Reedhall on a ticket category (Manage Channels + chat). */
async function ensureTicketCategoryPermissions(guild, categoryId) {
  if (!guild || !categoryId) return { ok: false, reason: 'no_category' };

  const category =
    guild.channels.cache.get(String(categoryId)) ||
    (await guild.channels.fetch(String(categoryId)).catch(() => null));
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { ok: false, reason: 'invalid_category' };
  }

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (
    !me?.permissions.has(PermissionFlagsBits.ManageChannels) &&
    !me?.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return { ok: false, reason: 'missing_manage_channels' };
  }

  const allow = categoryAllowBits();
  const ids = new Set([guild.client.user.id]);
  const reedhallRole = guild.roles.cache.find(
    (r) => !r.managed && r.name.toLowerCase() === ROLE_NAME.toLowerCase()
  );
  if (reedhallRole) ids.add(reedhallRole.id);

  for (const id of ids) {
    await category.permissionOverwrites
      .edit(id, allow, { reason: 'Reedhall auto-setup: ticket category permissions' })
      .catch((err) => {
        console.warn(`[botRole] category overwrite failed (${category.name}):`, err.message);
      });
  }

  console.log(`[botRole] ${guild.name}: ticket category permissions set on ${category.name}`);
  return { ok: true, categoryId: category.id };
}

/** Role + ticket category permissions when configured. */
async function ensureBotGuildSetup(guild) {
  const roleResult = await ensureBotRole(guild);
  const settings = getGuildSettings(guild.id);
  let categoryResult = { ok: false, reason: 'skipped' };
  if (settings.ticket_category_id) {
    categoryResult = await ensureTicketCategoryPermissions(guild, settings.ticket_category_id);
  }
  return { role: roleResult, category: categoryResult };
}

module.exports = {
  ROLE_NAME,
  ensureBotRole,
  ensureTicketCategoryPermissions,
  ensureBotGuildSetup,
};
