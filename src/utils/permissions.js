/** Functies die je per Discord-rol kunt toewijzen in /admin */

const ROLE_FUNCTIONS = [
  { id: 'mod.basic', label: 'Basis moderatie', description: 'kick, warn, mute, unmute, nickname' },
  { id: 'mod.advanced', label: 'Advanced moderatie', description: 'ban, tempban, softban, timeout, unban' },
  { id: 'mod.channel', label: 'Kanaalbeheer', description: 'purge, lock, unlock, slowmode' },
  { id: 'mod.roles', label: 'Rollen beheren', description: 'addrole, removerole' },
  { id: 'tickets.manage', label: 'Tickets', description: 'claim, close, add/remove, panel' },
  { id: 'polls.manage', label: 'Polls', description: 'polls maken en sluiten' },
  { id: 'giveaways.manage', label: 'Giveaways', description: 'giveaways starten en beheren' },
  { id: 'announce', label: 'Berichten', description: 'announce, bot-berichten' },
  { id: 'community', label: 'Community', description: 'suggest-kanaal, welkom-instellingen' },
  { id: 'panel.access', label: 'Dashboard panel', description: 'web dashboard + /dashboard' },
  { id: 'settings.edit', label: 'Server-instellingen', description: 'rollen/kanalen in dashboard wijzigen' },
  { id: 'branding', label: 'Bot branding', description: 'naam & avatar per server' },
];

const COMMAND_TO_FUNCTION = {
  kick: 'mod.basic',
  warn: 'mod.basic',
  warnings: 'mod.basic',
  delwarn: 'mod.basic',
  mute: 'mod.basic',
  unmute: 'mod.basic',
  nickname: 'mod.basic',
  ban: 'mod.advanced',
  tempban: 'mod.advanced',
  softban: 'mod.advanced',
  timeout: 'mod.advanced',
  unban: 'mod.advanced',
  purge: 'mod.channel',
  lock: 'mod.channel',
  unlock: 'mod.channel',
  slowmode: 'mod.channel',
  addrole: 'mod.roles',
  removerole: 'mod.roles',
  ticket: 'tickets.manage',
  poll: 'polls.manage',
  giveaway: 'giveaways.manage',
  announce: 'announce',
  mod: 'mod.basic',
  dashboard: 'panel.access',
};

function exceedsServerLimit(used, maxServers) {
  if (maxServers == null || maxServers === Infinity) return false;
  const max = Number(maxServers);
  if (!Number.isFinite(max)) return false;
  return Number(used) > max;
}

function atServerLimit(used, maxServers) {
  if (maxServers == null || maxServers === Infinity) return false;
  const max = Number(maxServers);
  if (!Number.isFinite(max)) return false;
  return Number(used) >= max;
}

module.exports = {
  ROLE_FUNCTIONS,
  COMMAND_TO_FUNCTION,
  exceedsServerLimit,
  atServerLimit,
};
