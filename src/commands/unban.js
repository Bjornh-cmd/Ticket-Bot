const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../database/db');
const { baseEmbed, sendModLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Remove a ban from a user')
    .addStringOption((o) =>
      o.setName('user_id').setDescription('Discord user ID').setRequired(true)
    )
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') || 'Geen reden opgegeven';

    try {
      await interaction.guild.members.unban(userId, reason);
    } catch {
      return interaction.reply({ content: 'Kon deze gebruiker niet unbannen (niet gebanned?).', ephemeral: true });
    }

    db.prepare(
      `UPDATE temp_punishments SET active = 0 WHERE guild_id = ? AND user_id = ? AND type = 'tempban' AND active = 1`
    ).run(interaction.guild.id, userId);

    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'unban', ?, ?, ?)`
    ).run(interaction.guild.id, userId, interaction.user.id, reason);

    const embed = baseEmbed(0x57f287)
      .setTitle('Ban opgeheven')
      .addFields(
        { name: 'Gebruiker ID', value: userId, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reden', value: reason }
      );

    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
