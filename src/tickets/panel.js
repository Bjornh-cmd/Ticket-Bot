const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { getGuildSettings, getTicketTypes } = require('../database/db');

function buildTicketPanelPayload(guildId, overrides = {}) {
  const settings = getGuildSettings(guildId);
  const types = getTicketTypes(guildId);
  const style = overrides.style || settings.ticket_panel_style || 'select';

  const title = overrides.title || settings.ticket_panel_title || 'Support Tickets';
  const description =
    overrides.description ||
    settings.ticket_panel_description ||
    'Kies hieronder een categorie om een ticket te openen. Ons team helpt je zo snel mogelijk.';

  const embed = new EmbedBuilder()
    .setColor(0x0f766e)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (!types.length) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_open')
        .setLabel('Ticket openen')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫')
    );
    return { embeds: [embed], components: [row] };
  }

  embed.addFields({
    name: 'Categorieën',
    value: types
      .map((t) => `${t.emoji || '🎫'} **${t.name}**${t.description ? ` — ${t.description}` : ''}`)
      .join('\n'),
  });

  if (style === 'buttons') {
    const components = [];
    const chunk = types.slice(0, 25);
    for (let i = 0; i < chunk.length; i += 5) {
      const row = new ActionRowBuilder();
      for (const t of chunk.slice(i, i + 5)) {
        const btn = new ButtonBuilder()
          .setCustomId(`ticket_type_btn_${t.id}`)
          .setLabel(t.name.slice(0, 80))
          .setStyle(ButtonStyle.Primary);
        const emoji = (t.emoji || '🎫').trim();
        if (emoji) {
          try {
            btn.setEmoji(emoji);
          } catch {
            // ignore
          }
        }
        row.addComponents(btn);
      }
      components.push(row);
    }
    return { embeds: [embed], components };
  }

  // select menu (default)
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_type_select')
    .setPlaceholder('🎫 Kies een categorie…');

  for (const t of types.slice(0, 25)) {
    const opt = {
      label: t.name.slice(0, 100),
      value: String(t.id),
      description: (t.description || 'Open een ticket').slice(0, 100),
    };
    const emoji = (t.emoji || '🎫').trim();
    if (emoji && emoji.length <= 8) opt.emoji = emoji;
    select.addOptions(opt);
  }

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  };
}

module.exports = { buildTicketPanelPayload };
