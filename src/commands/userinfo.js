const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/helpers');
const { db } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Info about a member')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(false)),

  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const warns = db
      .prepare(`SELECT COUNT(*) AS c FROM warnings WHERE guild_id = ? AND user_id = ? AND active = 1`)
      .get(interaction.guild.id, user.id).c;

    const embed = baseEmbed(0x5865f2)
      .setTitle(user.tag)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Account aangemaakt', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        {
          name: 'Lid sinds',
          value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/A',
          inline: true,
        },
        { name: 'Actieve warns', value: `${warns}`, inline: true },
        {
          name: 'Rollen',
          value: member
            ? member.roles.cache
                .filter((r) => r.id !== interaction.guild.id)
                .map((r) => r.toString())
                .slice(0, 15)
                .join(' ') || 'Geen'
            : 'N/A',
        }
      );

    return interaction.reply({ embeds: [embed] });
  },
};
