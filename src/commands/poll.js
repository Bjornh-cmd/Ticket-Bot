const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { createPoll, setPollMessage } = require('../database/db');
const { sendNativePoll } = require('../utils/polls');
const { hasModRole } = require('../utils/helpers');
const { getGuildLocale } = require('../i18n');
const { formatDiscordFix } = require('../utils/discordErrors');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a Discord poll (mods)')
    .addStringOption((o) => o.setName('question').setDescription('Question').setRequired(true).setMaxLength(300))
    .addStringOption((o) =>
      o.setName('choices').setDescription('Answers separated by | (min. 2, max 10)').setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName('hours')
        .setDescription('How long the poll stays open (1–768 hours)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(768)
    )
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel (defaults to this channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .addBooleanOption((o) => o.setName('multi').setDescription('Allow voting for multiple answers')),

  async execute(interaction) {
    if (!hasModRole(interaction.member)) {
      return interaction.reply({ content: 'Only moderators can create polls.', ephemeral: true });
    }

    const question = interaction.options.getString('question', true);
    const raw = interaction.options.getString('choices', true);
    const hours = interaction.options.getInteger('hours', true);
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const allowMulti = interaction.options.getBoolean('multi') === true;

    if (!channel?.isTextBased?.()) {
      return interaction.reply({ content: 'Invalid channel.', ephemeral: true });
    }

    const labels = raw
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (labels.length < 2) {
      return interaction.reply({
        content: 'Provide at least 2 answers, separated by `|`. Example: `Yes | No`',
        ephemeral: true,
      });
    }

    const options = labels.map((label) => ({
      label: label.slice(0, 55),
      emoji: '',
    }));

    const endsAt = Date.now() + hours * 60 * 60 * 1000;
    const pollId = createPoll({
      guildId: interaction.guildId,
      channelId: channel.id,
      question,
      endsAt,
      createdBy: interaction.user.id,
      allowMulti,
      voteOnce: !allowMulti,
      options,
    });

    try {
      const message = await sendNativePoll(channel, {
        question,
        options,
        endsAt,
        allowMulti,
      });
      setPollMessage(pollId, message.id);
    } catch (err) {
      console.error('Native poll create error:', err);
      return interaction.reply({
        content: formatDiscordFix(err, getGuildLocale(interaction.guildId)),
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: `Poll posted in ${channel}. Members vote directly on the Discord poll.`,
      ephemeral: true,
    });
  },
};
