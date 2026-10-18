/** Reedhall plan matrix — Lobby is free & limited; Desk/Estate unlock more. */

const PLANS = {
  lobby: {
    id: 'lobby',
    name: 'Lobby',
    priceLabel: 'Gratis',
    monthlyPrice: 0,
    maxServers: 1,
    maxPanelStaff: 0,
    features: {
      tickets: true,
      basicMod: true,
      dashboard: true,
      polls: false,
      welcome: false,
      autoRole: false,
      suggestions: false,
      announce: false,
      botSay: false,
      branding: false,
      advancedMod: false,
      inviteMods: false,
      giveaways: false,
      ticketQuestionnaires: false,
      ticketAdvanced: false,
      linkLogin: false,
      commandOverrides: false,
      serverSetup: false,
      analytics: false,
      levels: false,
      levelCardImage: false,
      xpMultiplier: false,
      customBotStatus: false,
      autoModAI: false,
      customPrefixCommands: false,
    },
  },
  desk: {
    id: 'desk',
    name: 'Desk',
    priceLabel: '€5/mo (1 server) · €8/mo (5 servers)',
    monthlyPrice: 5,
    maxServers: 5,
    maxPanelStaff: 5,
    features: {
      tickets: true,
      basicMod: true,
      dashboard: true,
      polls: true,
      welcome: true,
      autoRole: true,
      suggestions: true,
      announce: true,
      botSay: true,
      branding: true,
      advancedMod: true,
      inviteMods: true,
      giveaways: true,
      ticketQuestionnaires: true,
      ticketAdvanced: true,
      linkLogin: true,
      commandOverrides: true,
      serverSetup: true,
      analytics: true,
      levels: true,
      // Estate-exclusive features — Desk does not have these
      levelCardImage: false,
      xpMultiplier: false,
      customBotStatus: false,
      autoModAI: false,
      customPrefixCommands: true,
    },
  },
  estate: {
    id: 'estate',
    name: 'Estate',
    priceLabel: 'Vanaf €24/mo',
    monthlyPrice: 24,
    maxServers: null,
    maxPanelStaff: null, // unlimited
    features: {
      tickets: true,
      basicMod: true,
      dashboard: true,
      polls: true,
      welcome: true,
      autoRole: true,
      suggestions: true,
      announce: true,
      botSay: true,
      branding: true,
      advancedMod: true,
      inviteMods: true,
      giveaways: true,
      ticketQuestionnaires: true,
      ticketAdvanced: true,
      linkLogin: true,
      commandOverrides: true,
      serverSetup: true,
      analytics: true,
      levels: true,
      // Estate-exclusive extras
      levelCardImage: true,   // Real generated rank card image (like MEE6)
      xpMultiplier: true,     // Custom XP multiplier per server (1x–5x)
      customBotStatus: true,  // Set custom bot status text per server
      autoModAI: true,        // AI-powered auto-moderation (spam / toxicity filter)
      customPrefixCommands: true,
    },
  },
};

const ESTATE_PACKS = [
  { servers: 10, price: 24 },
  { servers: 25, price: 42 },
  { servers: 50, price: 75 },
  { servers: 100, price: 129 },
];

const TICKET_ADVANCED_SUBS = ['move', 'notes', 'priority', 'requestclose', 'transcript', 'reopen'];

const FEATURE_KEYS = [
  { key: 'tickets', label: 'Tickets & panel' },
  { key: 'basicMod', label: 'Basis moderatie' },
  { key: 'advancedMod', label: 'Advanced moderatie' },
  { key: 'polls', label: 'Polls' },
  { key: 'welcome', label: 'Welkom / leave' },
  { key: 'autoRole', label: 'Auto-rol' },
  { key: 'suggestions', label: 'Suggesties' },
  { key: 'announce', label: 'Aankondigingen' },
  { key: 'botSay', label: 'Bot-berichten (dashboard)' },
  { key: 'customPrefixCommands', label: 'Custom !-commands (Desk: 5 · Estate: onbeperkt)' },
  { key: 'ticketQuestionnaires', label: 'Vragenlijst per ticket-categorie' },
  { key: 'ticketAdvanced', label: 'Advanced ticket commands' },
  { key: 'branding', label: 'Bot branding per server' },
  { key: 'linkLogin', label: 'Wachtwoord link-login per server' },
  { key: 'commandOverrides', label: 'Commands uitzetten per server/lid' },
  { key: 'serverSetup', label: 'Server setup wizard' },
  { key: 'analytics', label: 'Analytics & server status' },
  { key: 'levels', label: 'Level systeem + rank card' },
  { key: 'levelCardImage', label: 'Gegenereerde rank card afbeelding' },
  { key: 'xpMultiplier', label: 'Aangepaste XP-vermenigvuldiger (1x–5x)' },
  { key: 'customBotStatus', label: 'Eigen bot-status tekst per server' },
  { key: 'autoModAI', label: 'AI auto-moderatie (spam / toxiciteitsfilter)' },
  { key: 'giveaways', label: 'Giveaways' },
  { key: 'inviteMods', label: 'Panel-mods uitnodigen' },
  { key: 'dashboard', label: 'Dashboard toegang' },
];

const FEATURE_ROWS = [
  { key: 'maxServers', label: 'Gekoppelde servers', lobby: '1', desk: '5', estate: 'Zelf typen (1–500)' },
  { key: 'maxPanelStaff', label: 'Extra panel-mods uitnodigen', lobby: '0 (alleen owner)', desk: '5', estate: 'Onbeperkt' },
  ...FEATURE_KEYS.map((f) => ({
    key: f.key,
    label: f.label,
    lobby: PLANS.lobby.features[f.key],
    desk: PLANS.desk.features[f.key],
    estate: PLANS.estate.features[f.key],
  })),
];

const COMMAND_FEATURES = {
  poll: 'polls',
  suggest: 'suggestions',
  announce: 'announce',
  giveaway: 'giveaways',
  level: 'levels',
  timeout: 'advancedMod',
  softban: 'advancedMod',
  addrole: 'advancedMod',
  removerole: 'advancedMod',
};

function clampEstateServers(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 10;
  return Math.min(500, Math.max(1, Math.round(v)));
}

/** Prijs voor Estate op basis van zelf gekozen server-aantal. */
function estatePriceForServers(servers) {
  const n = clampEstateServers(servers);
  const pack = ESTATE_PACKS.find((p) => p.servers === n);
  if (pack) return pack.price;
  return Math.max(24, Math.round(12 + n * 1.8));
}

function getEstatePack(servers) {
  const n = clampEstateServers(servers);
  const pack = ESTATE_PACKS.find((p) => p.servers === n);
  if (pack) return pack;
  return { servers: n, price: estatePriceForServers(n) };
}

function estatePrice(servers) {
  return estatePriceForServers(servers);
}

function resolvePlan(account) {
  let getPlanDefinition;
  try {
    ({ getPlanDefinition } = require('../database/db'));
  } catch {
    getPlanDefinition = null;
  }

  const raw = String(account?.plan || 'lobby').toLowerCase().trim();
  const planId = PLANS[raw] ? raw : 'lobby';
  const def = getPlanDefinition ? getPlanDefinition(planId) : { ...PLANS[planId], features: { ...PLANS[planId].features } };

  if (planId !== 'estate') {
    return {
      ...PLANS[planId],
      ...def,
      id: planId,
      features: { ...PLANS[planId].features, ...def.features },
      maxServers: def.maxServers ?? PLANS[planId].maxServers,
      maxPanelStaff: def.maxPanelStaff ?? PLANS[planId].maxPanelStaff,
    };
  }

  const pack = getEstatePack(account?.estate_servers || 10);
  return {
    ...PLANS.estate,
    ...def,
    id: 'estate',
    maxServers: pack.servers,
    maxPanelStaff: def.maxPanelStaff == null ? null : def.maxPanelStaff,
    monthlyPrice: pack.price,
    priceLabel: `€${pack.price}/mo · ${pack.servers} servers`,
    features: { ...PLANS.estate.features, ...def.features },
  };
}

function hasFeature(plan, featureKey) {
  if (!plan?.features) return false;
  return Boolean(plan.features[featureKey]);
}

function planLabel(plan) {
  return plan?.name || 'Lobby';
}

function maxPanelStaffForPlan(plan) {
  if (!plan) return 0;
  if (plan.maxPanelStaff === null || plan.maxPanelStaff === undefined) return Infinity;
  return Number(plan.maxPanelStaff);
}

/** Lobby: 0 · Desk: 5 · Estate: unlimited */
function maxCustomPrefixCommands(plan) {
  if (!plan || !hasFeature(plan, 'customPrefixCommands')) return 0;
  if (plan.id === 'estate') return Infinity;
  if (plan.id === 'desk') return 5;
  return 0;
}

module.exports = {
  PLANS,
  ESTATE_PACKS,
  TICKET_ADVANCED_SUBS,
  FEATURE_KEYS,
  FEATURE_ROWS,
  COMMAND_FEATURES,
  clampEstateServers,
  getEstatePack,
  estatePrice,
  estatePriceForServers,
  resolvePlan,
  hasFeature,
  planLabel,
  maxPanelStaffForPlan,
  maxCustomPrefixCommands,
};
