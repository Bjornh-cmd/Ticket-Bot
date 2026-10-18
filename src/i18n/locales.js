/** Supported bot languages. Default: English (overridable per guild). */

const LOCALES = [
  { id: 'en', label: 'English', native: 'English', discord: 'en-US' },
  { id: 'nl', label: 'Dutch', native: 'Nederlands', discord: 'nl' },
  { id: 'de', label: 'German', native: 'Deutsch', discord: 'de' },
  { id: 'fr', label: 'French', native: 'Français', discord: 'fr' },
  { id: 'es', label: 'Spanish', native: 'Español', discord: 'es-ES' },
];

const LOCALE_IDS = LOCALES.map((l) => l.id);
const DEFAULT_LOCALE = String(process.env.DEFAULT_LOCALE || 'en').toLowerCase();

function normalizeLocale(raw) {
  const id = String(raw || '').toLowerCase().trim().slice(0, 8);
  if (LOCALE_IDS.includes(id)) return id;
  if (id.startsWith('en')) return 'en';
  if (id.startsWith('nl')) return 'nl';
  if (id.startsWith('de')) return 'de';
  if (id.startsWith('fr')) return 'fr';
  if (id.startsWith('es')) return 'es';
  return LOCALE_IDS.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : 'en';
}

function defaultLocale() {
  return normalizeLocale(DEFAULT_LOCALE);
}

module.exports = {
  LOCALES,
  LOCALE_IDS,
  DEFAULT_LOCALE,
  normalizeLocale,
  defaultLocale,
};
