const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  createGiveaway,
  getGiveaway,
  deleteGiveaway,
  setGiveawayMessage,
  getGiveawayEntryCount,
} = require('../database/db');
const {
  buildGiveawayEmbed,
  buildGiveawayButtons,
  finishGiveaway,
} = require('../utils/giveaways');
const { botCanPostInChannel } = require('../utils/helpers');
const { getGuildLocale } = require('../i18n');
const { formatDiscordFix } = require('../utils/discordErrors');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Start a giveaway in this channel')
        .addStringOption((o) =>
          o.setName('title').setDescription('Giveaway title').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('prize').setDescription('What you can win').setRequired(true)
        )
        .addStringOption((o) =>
          o
            .setName('duration')
            .setDescription('Duration, e.g. 1h, 1d, 30m')
            .setRequired(true)
        )
        .addIntegerOption((o) =>
          o
            .setName('winners')
            .setDescription('Number of winners (1–20)')
            .setMinValue(1)
            .setMaxValue(20)
        )
        .addStringOption((o) =>
          o.setName('description').setDescription('Extra text under the title')
        )
        .addStringOption((o) =>
          o.setName('image').setDescription('Banner URL (https://…png/jpg)')
        )
        .addStringOption((o) =>
          o
            .setName('prize_dm')
            .setDescription('DM to winner — {user} {prize} {title} {server}')
            .setMaxLength(1500)
        )
        .addRoleOption((o) =>
          o.setName('role').setDescription('Required role to join')
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setDescription('End a giveaway early')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Giveaway ID').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reroll')
        .setDescription('Reroll winners')
        .addIntegerOption((o) =>
          o.setName('id').setDescription('Giveaway ID').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const ms = require('ms');
      const title = interaction.options.getString('title', true);
      const prize = interaction.options.getString('prize', true);
      const durationRaw = interaction.options.getString('duration', true);
      const duration = ms(durationRaw);
      if (!duration || duration < 60_000 || duration > 30 * 24 * 60 * 60 * 1000) {
        return interaction.reply({
          content: 'Ongeldige duur. Gebruik bijv. `30m`, `2h`, `1d` (min 1m, max 30d).',
          ephemeral: true,
        });
      }

      const endsAt = Date.now() + duration;
      const winnersCount = interaction.options.getInteger('winners') || 1;
      const description = interaction.options.getString('description');
      const imageUrl = interaction.options.getString('image');
      const prizeDm = interaction.options.getString('prize_dm');
      const role = interaction.options.getRole('role');

      if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
        return interaction.reply({
          content: 'Image URL must start with https://',
          ephemeral: true,
        });
      }

      const canPost = await botCanPostInChannel(interaction.channel);
      if (!canPost.ok) {
        return interaction.reply({
          content:
            'Reedhall cannot post in this channel. Missing: **' +
            canPost.missing.join(', ') +
            '**.',
          ephemeral: true,
        });
      }

      let id;
      try {
        id = createGiveaway({
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          title,
          prize,
          prizeDm,
          description,
          imageUrl,
          winnersCount,
          endsAt,
          requiredRoleId: role?.id || null,
          hostId: interaction.user.id,
        });

        const giveaway = getGiveaway(id);
        const msg = await interaction.channel.send({
          embeds: [buildGiveawayEmbed(giveaway, 0, false)],
          components: buildGiveawayButtons(giveaway, 0, false),
        });
        setGiveawayMessage(id, msg.id);
      } catch (err) {
        if (id) deleteGiveaway(id);
        console.error('Giveaway start error:', err);
        return interaction.reply({
          content: formatDiscordFix(err, getGuildLocale(interaction.guildId)),
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: `Giveaway **#${id}** started in ${interaction.channel}.`,
        ephemeral: true,
      });
    }

    if (sub === 'end') {
      const id = interaction.options.getInteger('id', true);
      const giveaway = getGiveaway(id);
      if (!giveaway || giveaway.guild_id !== interaction.guildId) {
        return interaction.reply({ content: 'Giveaway niet gevonden.', ephemeral: true });
      }
      if (giveaway.status !== 'active') {
        return interaction.reply({ content: 'Deze giveaway is al afgelopen.', ephemeral: true });
      }
      await finishGiveaway(interaction.client, id);
      return interaction.reply({ content: `Giveaway **#${id}** beëindigd.`, ephemeral: true });
    }

    if (sub === 'reroll') {
      const id = interaction.options.getInteger('id', true);
      const giveaway = getGiveaway(id);
      if (!giveaway || giveaway.guild_id !== interaction.guildId) {
        return interaction.reply({ content: 'Giveaway niet gevonden.', ephemeral: true });
      }
      if (giveaway.status === 'active') {
        return interaction.reply({
          content: 'Beëindig de giveaway eerst met `/giveaway end`.',
          ephemeral: true,
        });
      }
      if (!getGiveawayEntryCount(id)) {
        return interaction.reply({ content: 'Geen deelnemers om te herloten.', ephemeral: true });
      }
      await finishGiveaway(interaction.client, id, { reroll: true });
      return interaction.reply({ content: `Nieuwe winnaar(s) getrokken voor **#${id}**.`, ephemeral: true });
    }
  },
};
