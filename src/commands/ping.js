const { SlashCommandBuilder } = require('discord.js');
const { getGuildLocale, t } = require('../i18n');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),

  async execute(interaction) {
    const loc = interaction.guildId ? getGuildLocale(interaction.guildId) : 'en';
    const sent = await interaction.reply({
      content: t(loc, 'ping.pinging'),
      fetchReply: true,
      ephemeral: true,
    });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const ws = Math.round(interaction.client.ws.ping);
    return interaction.editReply(
      t(loc, 'ping.pong', { roundtrip, ws })
    );
  },
};
