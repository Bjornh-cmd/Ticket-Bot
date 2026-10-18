const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const {
  getGiveaway,
  getGiveawayEntryCount,
  listGiveawayEntries,
  addGiveawayEntry,
  hasGiveawayEntry,
  setGiveawayMessage,
  endGiveaway,
  setGiveawayWinners,
  listExpiredActiveGiveaways,
} = require('../database/db');
const { tg, getGuildLocale, t } = require('../i18n');

function formatEndedLabel(endsAt) {
  try {
    return new Date(endsAt).toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Amsterdam',
      timeZoneName: 'short',
    });
  } catch {
    return new Date(endsAt).toISOString();
  }
}

function buildGiveawayEmbed(giveaway, entryCount, ended = false) {
  const loc = getGuildLocale(giveaway.guild_id);
  const status = ended || giveaway.status !== 'active' ? 'ENDED' : null;
  const title = status
    ? `🎉 ${giveaway.title} 🎉 [${status}]`
    : `🎉 ${giveaway.title} 🎉`;

  const desc =
    (giveaway.description || t(loc, 'giveaway.clickToJoin')) +
    (ended
      ? ''
      : `\n\n**${t(loc, 'giveaway.prize')}:** ${giveaway.prize}\n**${t(loc, 'giveaway.participants')}:** ${giveaway.winners_count}`);

  const embed = new EmbedBuilder()
    .setColor(ended ? 0x5865f2 : 0xeb459e)
    .setTitle(title.slice(0, 256))
    .setDescription(desc.slice(0, 4000))
    .setFooter({
      text: ended
        ? `Giveaway #${giveaway.id}`
        : `Giveaway #${giveaway.id} · Reedhall`,
    })
    .setTimestamp(new Date(giveaway.ends_at));

  if (!ended) {
    embed.addFields(
      {
        name: '⏱',
        value: `<t:${Math.floor(giveaway.ends_at / 1000)}:R> (<t:${Math.floor(giveaway.ends_at / 1000)}:f>)`,
        inline: true,
      },
      { name: t(loc, 'giveaway.participants'), value: String(entryCount), inline: true },
      { name: '🏆', value: String(giveaway.winners_count), inline: true }
    );
    if (giveaway.required_role_id) {
      embed.addFields({
        name: 'Role',
        value: `<@&${giveaway.required_role_id}>`,
        inline: true,
      });
    }
  } else {
    embed.addFields(
      { name: t(loc, 'giveaway.prize'), value: giveaway.prize || '—', inline: true },
      { name: t(loc, 'giveaway.participants'), value: String(entryCount), inline: true }
    );
  }

  if (giveaway.image_url) {
    try {
      embed.setImage(giveaway.image_url);
    } catch {
      // invalid url
    }
  }

  return embed;
}

function buildGiveawayButtons(giveaway, entryCount, ended = false) {
  const loc = getGuildLocale(giveaway.guild_id);
  const when = formatEndedLabel(giveaway.ends_at);
  if (ended || giveaway.status !== 'active') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_ended_${giveaway.id}`)
          .setLabel(t(loc, 'giveaway.endedOn', { when }).slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      ),
    ];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_enter_${giveaway.id}`)
        .setLabel(t(loc, 'giveaway.participate', { count: entryCount }).slice(0, 80))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`giveaway_ends_${giveaway.id}`)
        .setLabel(t(loc, 'giveaway.ends', { when }).slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    ),
  ];
}

function buildResultsEmbed(giveaway, entryCount, winnerMentions) {
  const loc = getGuildLocale(giveaway.guild_id);
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🎉 ${giveaway.title} 🎉 [RESULTS]`.slice(0, 256))
    .setDescription(
      winnerMentions.length ? t(loc, 'giveaway.resultsDesc') : t(loc, 'giveaway.resultsNone')
    )
    .addFields(
      { name: t(loc, 'giveaway.prize'), value: giveaway.prize || '—', inline: true },
      { name: t(loc, 'giveaway.participants'), value: String(entryCount), inline: true }
    )
    .setFooter({ text: `Giveaway #${giveaway.id} · Reedhall` })
    .setTimestamp();
}

function pickWinners(userIds, count) {
  const pool = [...new Set(userIds.map(String))];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.min(count, pool.length)));
}

async function refreshGiveawayMessage(client, giveawayId) {
  const giveaway = getGiveaway(giveawayId);
  if (!giveaway?.channel_id || !giveaway.message_id) return;
  const guild = client.guilds.cache.get(giveaway.guild_id);
  if (!guild) return;
  const channel = await guild.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
  if (!msg) return;
  const count = getGiveawayEntryCount(giveawayId);
  const ended = giveaway.status !== 'active';
  await msg
    .edit({
      embeds: [buildGiveawayEmbed(giveaway, count, ended)],
      components: buildGiveawayButtons(giveaway, count, ended),
    })
    .catch(() => null);
}

function buildWinnerDmEmbed(giveaway, guildName, user) {
  const loc = getGuildLocale(giveaway.guild_id);
  const template =
    (giveaway.prize_dm && String(giveaway.prize_dm).trim()) ||
    t(loc, 'giveaway.winnerDefault');

  const text = template
    .replaceAll('{user}', user?.username || 'winner')
    .replaceAll('{username}', user?.username || 'winner')
    .replaceAll('{prize}', giveaway.prize || '—')
    .replaceAll('{title}', giveaway.title || 'giveaway')
    .replaceAll('{server}', guildName || 'the server');

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(t(loc, 'giveaway.winnerTitle'))
    .setDescription(text.slice(0, 4000))
    .addFields(
      { name: t(loc, 'giveaway.prize'), value: String(giveaway.prize || '—').slice(0, 1024), inline: true },
      { name: 'Giveaway', value: String(giveaway.title || '—').slice(0, 1024), inline: true }
    )
    .setFooter({ text: `Giveaway #${giveaway.id} · Reedhall` })
    .setTimestamp();
}

async function dmWinners(client, giveaway, guild, winnerIds) {
  if (!winnerIds?.length) return;
  for (const userId of winnerIds) {
    try {
      const user = await client.users.fetch(userId);
      await user.send({
        embeds: [buildWinnerDmEmbed(giveaway, guild?.name, user)],
      });
    } catch {
      // DMs dicht
    }
  }
}

async function finishGiveaway(client, giveawayId, { reroll = false } = {}) {
  const giveaway = getGiveaway(giveawayId);
  if (!giveaway) return null;
  if (!reroll && giveaway.status !== 'active') return giveaway;

  const entries = listGiveawayEntries(giveawayId);
  const winners = pickWinners(
    entries.map((e) => e.user_id),
    Number(giveaway.winners_count) || 1
  );

  if (!reroll) endGiveaway(giveawayId);
  setGiveawayWinners(giveawayId, winners);

  const updated = getGiveaway(giveawayId);
  const count = entries.length;
  const guild = client.guilds.cache.get(updated.guild_id);
  if (!guild) return updated;

  const channel = await guild.channels.fetch(updated.channel_id).catch(() => null);
  if (channel?.isTextBased() && updated.message_id) {
    const msg = await channel.messages.fetch(updated.message_id).catch(() => null);
    if (msg) {
      await msg
        .edit({
          embeds: [buildGiveawayEmbed(updated, count, true)],
          components: buildGiveawayButtons(updated, count, true),
        })
        .catch(() => null);
    }

    const mentions = winners.map((id) => `<@${id}>`);
    await channel
      .send({
        content: mentions.length ? mentions.join(' ') : undefined,
        embeds: [buildResultsEmbed(updated, count, mentions)],
        reply: updated.message_id ? { messageReference: updated.message_id } : undefined,
      })
      .catch(async () => {
        await channel
          .send({
            content: mentions.length ? mentions.join(' ') : undefined,
            embeds: [buildResultsEmbed(updated, count, mentions)],
          })
          .catch(() => null);
      });
  }

  await dmWinners(client, updated, guild, winners);
  return updated;
}

async function handleGiveawayButton(interaction) {
  const id = interaction.customId;
  const loc = interaction.guildId ? getGuildLocale(interaction.guildId) : 'en';

  if (id.startsWith('giveaway_ended_') || id.startsWith('giveaway_ends_')) {
    return interaction.reply({
      content: t(loc, 'giveaway.notOpen'),
      ephemeral: true,
    });
  }

  if (!id.startsWith('giveaway_enter_')) return;

  const giveawayId = Number(id.replace('giveaway_enter_', ''));
  const giveaway = getGiveaway(giveawayId);
  if (!giveaway || giveaway.status !== 'active') {
    return interaction.reply({ content: t(loc, 'giveaway.ended'), ephemeral: true });
  }
  if (Date.now() >= giveaway.ends_at) {
    await finishGiveaway(interaction.client, giveawayId);
    return interaction.reply({ content: t(loc, 'giveaway.justEnded'), ephemeral: true });
  }

  if (giveaway.required_role_id) {
    const member = interaction.member;
    if (!member?.roles?.cache?.has(giveaway.required_role_id)) {
      return interaction.reply({
        content: t(loc, 'giveaway.needRole', { role: giveaway.required_role_id }),
        ephemeral: true,
      });
    }
  }

  if (hasGiveawayEntry(giveawayId, interaction.user.id)) {
    return interaction.reply({
      content: t(loc, 'giveaway.alreadyIn'),
      ephemeral: true,
    });
  }

  addGiveawayEntry(giveawayId, interaction.user.id);
  const count = getGiveawayEntryCount(giveawayId);
  await refreshGiveawayMessage(interaction.client, giveawayId).catch(() => null);

  return interaction.reply({
    content: t(loc, 'giveaway.joinOk', { count }),
    ephemeral: true,
  });
}

async function processExpiredGiveaways(client) {
  const rows = listExpiredActiveGiveaways();
  for (const row of rows) {
    await finishGiveaway(client, row.id).catch((err) =>
      console.error('Giveaway end error:', err.message)
    );
  }
}

function startGiveawayChecker(client) {
  processExpiredGiveaways(client).catch(() => null);
  setInterval(() => processExpiredGiveaways(client), 30_000);
}

module.exports = {
  buildGiveawayEmbed,
  buildGiveawayButtons,
  buildResultsEmbed,
  refreshGiveawayMessage,
  finishGiveaway,
  handleGiveawayButton,
  startGiveawayChecker,
  setGiveawayMessage,
  pickWinners,
};
