const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../database/db');
const { canModerate, baseEmbed, sendModLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption((o) => o.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    .addIntegerOption((o) =>
      o
        .setName('delete_days')
        .setDescription('Delete messages from the last X days (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'Geen reden opgegeven';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const check = canModerate(interaction.member, member);
      if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
      if (!member.bannable) {
        return interaction.reply({ content: 'Ik kan dit lid niet bannen.', ephemeral: true });
      }
    }

    await interaction.guild.members.ban(user.id, {
      reason,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    });

    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'ban', ?, ?, ?)`
    ).run(interaction.guild.id, user.id, interaction.user.id, reason);

    const embed = baseEmbed(0xed4245)
      .setTitle('Lid gebanned')
      .addFields(
        { name: 'Gebruiker', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reden', value: reason }
      );

    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
