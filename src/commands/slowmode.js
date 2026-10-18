const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for this channel')
    .addIntegerOption((o) =>
      o
        .setName('seconds')
        .setDescription('0 to disable (max 21600)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds', true);
    await interaction.channel.setRateLimitPerUser(seconds);
    const embed = baseEmbed(0x5865f2)
      .setTitle('Slowmode aangepast')
      .setDescription(seconds === 0 ? 'Slowmode uitgeschakeld.' : `Slowmode: **${seconds}s**`);
    return interaction.reply({ embeds: [embed] });
  },
};
