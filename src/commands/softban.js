const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../database/db');
const { canModerate, baseEmbed, sendModLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Ban + unban to wipe messages')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'Softban';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (member) {
      const check = canModerate(interaction.member, member);
      if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
      if (!member.bannable) {
        return interaction.reply({ content: 'Ik kan dit lid niet softbannen.', ephemeral: true });
      }
    }

    await interaction.guild.members.ban(user.id, { deleteMessageSeconds: 60 * 60 * 24 * 7, reason: `Softban: ${reason}` });
    await interaction.guild.members.unban(user.id, 'Softban cleanup');

    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'softban', ?, ?, ?)`
    ).run(interaction.guild.id, user.id, interaction.user.id, reason);

    const embed = baseEmbed(0xed4245)
      .setTitle('Softban uitgevoerd')
      .addFields(
        { name: 'Gebruiker', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Moderator', value: interaction.user.tag, inline: true },
        { name: 'Reden', value: reason }
      );
    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
