const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show a user avatar')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(false)),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const url = user.displayAvatarURL({ size: 1024, extension: 'png' });
    const embed = baseEmbed(0x0f766e)
      .setTitle(`Avatar · ${user.tag}`)
      .setImage(url)
      .setDescription(`[Open afbeelding](${url})`);
    return interaction.reply({ embeds: [embed] });
  },
};
