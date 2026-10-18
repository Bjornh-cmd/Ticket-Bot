'use strict';

const { t } = require('../i18n');

/**
 * Map Discord API / app errors to a dashboard flash key and a user-facing fix.
 */
function discordErrorKind(err) {
  const code = Number(err?.code ?? err?.rawError?.code);
  const msg = String(err?.message || err?.rawError?.message || '');
  if (code === 50013 || /missing permissions/i.test(msg)) return 'perms';
  if (code === 50001 || /missing access/i.test(msg)) return 'access';
  if (code === 10003 || /unknown channel/i.test(msg)) return 'unknown_channel';
  if (code === 30013 || /maximum number of channels/i.test(msg)) return 'category_full';
  if (code === 50007 || /cannot send messages to this user/i.test(msg)) return 'cannot_dm';
  if (code === 50035 || /invalid form body/i.test(msg)) return 'invalid';
  return 'generic';
}

function flashFromDiscordError(err, fallback = 'failed') {
  const kind = discordErrorKind(err);
  const map = {
    perms: 'discord_perms',
    access: 'discord_access',
    unknown_channel: 'discord_unknown_channel',
    category_full: 'discord_category_full',
    cannot_dm: 'discord_cannot_dm',
    invalid: 'discord_invalid',
  };
  return map[kind] || fallback;
}

function formatDiscordFix(err, locale = 'en') {
  const kind = discordErrorKind(err);
  const key = {
    perms: 'common.fixPerms',
    access: 'common.fixAccess',
    unknown_channel: 'common.fixUnknownChannel',
    category_full: 'common.fixCategoryFull',
    cannot_dm: 'common.fixCannotDm',
    invalid: 'common.fixInvalid',
    generic: 'common.fixGeneric',
  }[kind];
  return t(locale, key, { reason: err?.message || 'Unknown error' });
}

module.exports = {
  discordErrorKind,
  flashFromDiscordError,
  formatDiscordFix,
};
