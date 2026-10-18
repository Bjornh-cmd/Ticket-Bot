const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../database/db');
const { canModerate, baseEmbed, sendModLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption((o) => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'Geen reden opgegeven';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: 'Dit lid zit niet in de server.', ephemeral: true });
    }

    const check = canModerate(interaction.member, member);
    if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
    if (!member.kickable) {
      return interaction.reply({ content: 'Ik kan dit lid niet kicken.', ephemeral: true });
    }

    await member.kick(reason);
    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'kick', ?, ?, ?)`
    ).run(interaction.guild.id, user.id, interaction.user.id, reason);

    const embed = baseEmbed(0xed4245)
      .setTitle('Lid gekickt')
      .addFields(
        { name: 'Gebruiker', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reden', value: reason }
      );

    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
