const { LOCALES, LOCALE_IDS, normalizeLocale, defaultLocale } = require('./locales');
const en = require('./messages/en');
const nl = require('./messages/nl');
const de = require('./messages/de');
const fr = require('./messages/fr');
const es = require('./messages/es');
const dashEn = require('./dashboard/en');
const dashNl = require('./dashboard/nl');

const CATALOG = { en, nl, de, fr, es };

/**
 * Dashboard UI catalog. Only English & Dutch are maintained for the guild
 * dashboard page — every other bot language falls back to English there.
 */
const DASH = { en: dashEn, nl: dashNl };

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interpolate(str, vars = {}, { escape = true } = {}) {
  return String(str).replace(/\{(\w+)\}/g, (_, key) => {
    if (vars[key] == null) return `{${key}}`;
    const value = String(vars[key]);
    return escape ? escapeHtml(value) : value;
  });
}

/** Translate a key for a locale (falls back to English). */
function t(locale, key, vars = {}) {
  const loc = normalizeLocale(locale);
  const raw =
    getByPath(CATALOG[loc], key) ??
    getByPath(CATALOG.en, key) ??
    key;
  if (typeof raw !== 'string') return String(key);
  return interpolate(raw, vars, { escape: false });
}

function getGuildLocale(guildId) {
  try {
    const { getGuildSettings } = require('../database/db');
    const settings = getGuildSettings(guildId);
    return normalizeLocale(settings?.locale || defaultLocale());
  } catch {
    return defaultLocale();
  }
}

function tg(guildId, key, vars = {}) {
  return t(getGuildLocale(guildId), key, vars);
}

/**
 * Translate a dashboard UI key for the guild dashboard page.
 * Only `en` and `nl` catalogs exist; every other locale falls back to English.
 */
function td(locale, key, vars = {}) {
  const loc = normalizeLocale(locale);
  const catalog = DASH[loc] || DASH.en;
  const raw = getByPath(catalog, key) ?? getByPath(DASH.en, key) ?? key;
  if (typeof raw !== 'string') return String(key);
  return interpolate(raw, vars, { escape: true });
}

/** Small set of dashboard strings needed by client-side JS (app.js) for a locale. */
function getDashboardStrings(locale, vars = {}) {
  return {
    pollAnswer: td(locale, 'js.pollAnswer'),
    pollGood: td(locale, 'js.pollGood'),
    addAnswer: td(locale, 'js.addAnswer'),
    removeAria: td(locale, 'js.removeAria'),
    channelNamePlaceholder: td(locale, 'js.channelNamePlaceholder'),
    categoryLabel: td(locale, 'js.categoryLabel'),
    categoryNamePlaceholder: td(locale, 'js.categoryNamePlaceholder'),
    removeCategory: td(locale, 'js.removeCategory'),
    addCategory: td(locale, 'js.addCategory'),
    addChannel: td(locale, 'js.addChannel'),
    confirmCreate: td(locale, 'js.confirmCreateStructure'),
    inviteHintMember: td(locale, 'js.inviteHintMember', { server: vars.server || '' }),
    inviteHintRole: td(locale, 'js.inviteHintRole'),
    ticketQuestion: td(locale, 'js.ticketQuestion'),
    ticketQuestionStyle: td(locale, 'js.ticketQuestionStyle'),
    ticketStyleParagraph: td(locale, 'js.ticketStyleParagraph'),
    ticketStyleShort: td(locale, 'js.ticketStyleShort'),
    ticketQuestionRequired: td(locale, 'js.ticketQuestionRequired'),
    ticketQuestionPlaceholder: td(locale, 'js.ticketQuestionPlaceholder'),
    ticketFieldPlaceholder: td(locale, 'js.ticketFieldPlaceholder'),
    ticketFieldPlaceholderExample: td(locale, 'js.ticketFieldPlaceholderExample'),
  };
}

/**
 * Force English slash metadata for Discord (no locale overrides).
 * Discord otherwise shows NL/DE/… from description_localizations when the client language differs.
 */
function applySlashLocalizations(commandJson) {
  const name = commandJson?.name;
  if (!name) return commandJson;

  const enCmd = getByPath(CATALOG.en, `commands.${name}`);
  if (enCmd?.description) {
    commandJson.description = enCmd.description;
  }
  delete commandJson.description_localizations;
  delete commandJson.name_localizations;

  if (Array.isArray(commandJson.options)) {
    commandJson.options = commandJson.options.map((opt) => localizeOption(opt));
  }

  return commandJson;
}

const OPTION_ALIASES = {
  gebruiker: 'user',
  user: 'user',
  reden: 'reason',
  reason: 'reason',
  duur: 'duration',
  duration: 'duration',
  rol: 'role',
  role: 'role',
  kanaal: 'channel',
  channel: 'channel',
  titel: 'title',
  title: 'title',
  tekst: 'text',
  text: 'text',
  aantal: 'amount',
  amount: 'amount',
  seconden: 'seconds',
  seconds: 'seconds',
  naam: 'name',
  name: 'name',
  id: 'id',
  verwijder_dagen: 'delete_days',
  delete_days: 'delete_days',
  gebruiker_id: 'user_id',
  user_id: 'user_id',
  vraag: 'question',
  question: 'question',
  opties: 'choices',
  choices: 'choices',
  uren: 'hours',
  hours: 'hours',
  eenmaal: 'once',
  once: 'once',
  goed: 'correct',
  correct: 'correct',
  idee: 'idea',
  idea: 'idea',
  beschrijving: 'description',
  description: 'description',
  prijs: 'prize',
  prize: 'prize',
  winnaars: 'winners',
  winners: 'winners',
  afbeelding: 'image',
  image: 'image',
  prijs_dm: 'prize_dm',
  prize_dm: 'prize_dm',
};

function localizeOption(opt) {
  const out = { ...opt };
  const alias = OPTION_ALIASES[opt.name];

  if (alias) {
    const enOpt = getByPath(CATALOG.en, `options.${alias}`);
    if (enOpt?.description) out.description = enOpt.description;
    if (enOpt?.name && /^[a-z0-9_]{1,32}$/.test(enOpt.name)) {
      out.name = enOpt.name;
    } else if (alias !== opt.name && /^[a-z0-9_]{1,32}$/.test(alias)) {
      out.name = alias;
    }
  }

  delete out.description_localizations;
  delete out.name_localizations;

  if (Array.isArray(out.options)) {
    out.options = out.options.map((child) => localizeOption(child));
  }

  return out;
}

module.exports = {
  LOCALES,
  LOCALE_IDS,
  normalizeLocale,
  defaultLocale,
  t,
  tg,
  td,
  getDashboardStrings,
  getGuildLocale,
  applySlashLocalizations,
  CATALOG,
  DASH,
};
