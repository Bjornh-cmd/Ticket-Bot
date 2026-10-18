const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder().setName('membercount').setDescription('Member count for this server'),

  async execute(interaction) {
    const g = interaction.guild;
    const embed = baseEmbed(0x0f766e)
      .setTitle(g.name)
      .setDescription(`**${g.memberCount}** leden`)
      .setThumbnail(g.iconURL({ size: 128 }));
    return interaction.reply({ embeds: [embed] });
  },
};
