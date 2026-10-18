const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Info about a role')
    .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),

  async execute(interaction) {
    const role = interaction.options.getRole('role', true);
    const embed = baseEmbed(role.color || 0x0f766e)
      .setTitle(role.name)
      .addFields(
        { name: 'ID', value: role.id, inline: true },
        { name: 'Leden', value: `${role.members.size}`, inline: true },
        { name: 'Positie', value: `${role.position}`, inline: true },
        { name: 'Mentionable', value: role.mentionable ? 'Ja' : 'Nee', inline: true },
        { name: 'Hoist', value: role.hoist ? 'Ja' : 'Nee', inline: true },
        { name: 'Kleur', value: role.hexColor, inline: true },
        { name: 'Aangemaakt', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true }
      );
    return interaction.reply({ embeds: [embed] });
  },
};
