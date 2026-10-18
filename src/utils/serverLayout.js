/**
 * Customizable Discord server layout blueprint.
 * Default matches a community template; owners edit names/slots in the dashboard.
 */

const { ChannelType, PermissionFlagsBits } = require('discord.js');

const BOT_MAP_OPTIONS = [
  { value: '', label: '— Geen bot-koppeling —' },
  { value: 'join_channel_id', label: 'Welkom / join' },
  { value: 'leave_channel_id', label: 'Leave / nieuwe leden' },
  { value: 'announce_channel_id', label: 'Aankondigingen' },
  { value: 'mod_log_channel_id', label: 'Mod-log' },
  { value: 'ticket_log_channel_id', label: 'Ticket-log' },
  { value: 'ticket_panel_channel_id', label: 'Ticket-panel' },
  { value: 'suggestion_channel_id', label: 'Suggesties / vragen' },
];

const OLD_DEFAULT_CATEGORY_IDS = new Set(['knowledge', 'community', 'help']);

const DEFAULT_BLUEPRINT = {
  categories: [],
  ticketCategory: {
    id: 'tickets_live',
    name: '🎫 TICKETS',
    mapsTo: 'ticket_category_id',
    hidden: true,
  },
};

function isLegacyDefaultTemplate(raw) {
  if (!raw || !Array.isArray(raw.categories) || !raw.categories.length) return false;
  return raw.categories.every((cat) => OLD_DEFAULT_CATEGORY_IDS.has(String(cat?.id || '')));
}

function slugId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloneDefaultBlueprint() {
  return JSON.parse(JSON.stringify(DEFAULT_BLUEPRINT));
}

function parseBlueprint(settings) {
  try {
    if (settings?.layout_blueprint_json) {
      const raw = JSON.parse(settings.layout_blueprint_json);
      if (isLegacyDefaultTemplate(raw)) return cloneDefaultBlueprint();
      return normalizeBlueprint(raw);
    }
  } catch {
    // ignore
  }
  return cloneDefaultBlueprint();
}

function normalizeBlueprint(raw) {
  const base = cloneDefaultBlueprint();
  if (!raw || typeof raw !== 'object') return base;

  const categories = Array.isArray(raw.categories) ? raw.categories : base.categories;
  const normalizedCats = categories
    .map((cat, i) => {
      if (!cat || typeof cat !== 'object') return null;
      const id = String(cat.id || slugId(`cat${i}`)).slice(0, 40);
      const name = String(cat.name || `Categorie ${i + 1}`).trim().slice(0, 100) || `Categorie ${i + 1}`;
      const channels = Array.isArray(cat.channels) ? cat.channels : [];
      const normalizedChannels = channels
        .map((ch, j) => {
          if (!ch || typeof ch !== 'object') return null;
          const chId = String(ch.id || slugId(`ch${j}`)).slice(0, 40);
          const chName = String(ch.name || `kanaal-${j + 1}`).trim().slice(0, 100);
          if (!chName) return null;
          const mapsTo = String(ch.mapsTo || '').trim();
          const allowed = BOT_MAP_OPTIONS.some((o) => o.value === mapsTo);
          return {
            id: chId,
            name: chName,
            topic: String(ch.topic || '').slice(0, 200),
            mapsTo: allowed ? mapsTo : '',
          };
        })
        .filter(Boolean)
        .slice(0, 50);
      return { id, name, channels: normalizedChannels };
    })
    .filter(Boolean)
    .slice(0, 20);

  const tc = raw.ticketCategory && typeof raw.ticketCategory === 'object' ? raw.ticketCategory : base.ticketCategory;
  const ticketCategory = {
    id: String(tc.id || 'tickets_live').slice(0, 40),
    name: String(tc.name || '🎫 TICKETS').trim().slice(0, 100) || '🎫 TICKETS',
    mapsTo: 'ticket_category_id',
    hidden: true,
  };

  return {
    categories: normalizedCats,
    ticketCategory,
  };
}

/** Parse blueprint posted from the editable setup form. */
function blueprintFromFormBody(body) {
  const catIds = [].concat(body.bp_cat_id || []);
  const catNames = [].concat(body.bp_cat_name || []);
  const categories = [];

  for (let i = 0; i < catIds.length; i++) {
    const id = String(catIds[i] || slugId('cat')).slice(0, 40);
    const name = String(catNames[i] || '').trim().slice(0, 100);
    if (!name) continue;

    const chIds = [].concat(body[`bp_ch_id_${id}`] || []);
    const chNames = [].concat(body[`bp_ch_name_${id}`] || []);
    const chMaps = [].concat(body[`bp_ch_map_${id}`] || []);
    const channels = [];
    for (let j = 0; j < Math.max(chIds.length, chNames.length); j++) {
      const chName = String(chNames[j] || '').trim().slice(0, 100);
      if (!chName) continue;
      const mapsTo = String(chMaps[j] || '').trim();
      const allowed = BOT_MAP_OPTIONS.some((o) => o.value === mapsTo);
      channels.push({
        id: String(chIds[j] || slugId('ch')).slice(0, 40),
        name: chName,
        topic: '',
        mapsTo: allowed ? mapsTo : '',
      });
    }
    categories.push({ id, name, channels });
  }

  const ticketName = String(body.bp_ticket_cat_name || '🎫 TICKETS').trim().slice(0, 100);
  return normalizeBlueprint({
    categories,
    ticketCategory: {
      id: 'tickets_live',
      name: ticketName || '🎫 TICKETS',
      mapsTo: 'ticket_category_id',
      hidden: true,
    },
  });
}

function flattenSlots(blueprint) {
  const bp = normalizeBlueprint(blueprint);
  const slots = [];
  for (const cat of bp.categories) {
    for (const ch of cat.channels) {
      slots.push({ ...ch, categoryId: cat.id, categoryName: cat.name });
    }
  }
  return slots;
}

function parseLayout(settings) {
  let layout = { categories: {}, channels: {} };
  try {
    if (settings?.layout_json) {
      layout = JSON.parse(settings.layout_json);
    }
  } catch {
    // ignore
  }
  layout.categories = layout.categories || {};
  layout.channels = layout.channels || {};
  return layout;
}

function settingsPatchFromLayout(layout, blueprint) {
  const bp = normalizeBlueprint(blueprint);
  const patch = {};
  for (const slot of flattenSlots(bp)) {
    if (!slot.mapsTo) continue;
    const channelId = layout.channels?.[slot.id];
    if (channelId) patch[slot.mapsTo] = channelId;
  }
  const ticketKey = bp.ticketCategory.id;
  if (layout.categories?.[ticketKey]) {
    patch[bp.ticketCategory.mapsTo] = layout.categories[ticketKey];
  }
  return patch;
}

async function createServerLayout(guild, blueprint, { reason = 'Reedhall server setup' } = {}) {
  const bp = normalizeBlueprint(blueprint);
  const layout = { categories: {}, channels: {} };
  const me = guild.members.me;

  for (const cat of bp.categories) {
    const category = await guild.channels.create({
      name: cat.name.slice(0, 100),
      type: ChannelType.GuildCategory,
      reason,
    });
    layout.categories[cat.id] = category.id;

    for (const ch of cat.channels) {
      const channel = await guild.channels.create({
        name: ch.name.slice(0, 100),
        type: ChannelType.GuildText,
        parent: category.id,
        topic: ch.topic || undefined,
        reason,
      });
      layout.channels[ch.id] = channel.id;
    }
  }

  const ticketCat = await guild.channels.create({
    name: bp.ticketCategory.name.slice(0, 100),
    type: ChannelType.GuildCategory,
    reason,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...(me
        ? [
            {
              id: me.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ]
        : []),
    ],
  });
  layout.categories[bp.ticketCategory.id] = ticketCat.id;

  return layout;
}

/** @deprecated alias — default template shape */
const LAYOUT_TEMPLATE = DEFAULT_BLUEPRINT.categories;
const TICKET_CATEGORY = DEFAULT_BLUEPRINT.ticketCategory;

module.exports = {
  BOT_MAP_OPTIONS,
  DEFAULT_BLUEPRINT,
  LAYOUT_TEMPLATE,
  TICKET_CATEGORY,
  cloneDefaultBlueprint,
  parseBlueprint,
  normalizeBlueprint,
  blueprintFromFormBody,
  flattenSlots,
  parseLayout,
  settingsPatchFromLayout,
  createServerLayout,
};
