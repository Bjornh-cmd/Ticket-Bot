const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db, getGuildSettings } = require('../database/db');
const { canModerate, baseEmbed, sendModLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove mute/timeout from a member')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'Geen reden opgegeven';
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: 'Lid niet gevonden.', ephemeral: true });

    const check = canModerate(interaction.member, member);
    if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });

    if (member.communicationDisabledUntilTimestamp) {
      await member.timeout(null, reason);
    }

    const settings = getGuildSettings(interaction.guild.id);
    if (settings.mute_role_id && member.roles.cache.has(settings.mute_role_id)) {
      await member.roles.remove(settings.mute_role_id, reason);
    }

    db.prepare(
      `UPDATE temp_punishments SET active = 0 WHERE guild_id = ? AND user_id = ? AND type = 'mute' AND active = 1`
    ).run(interaction.guild.id, user.id);

    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'unmute', ?, ?, ?)`
    ).run(interaction.guild.id, user.id, interaction.user.id, reason);

    const embed = baseEmbed(0x57f287)
      .setTitle('Mute opgeheven')
      .addFields(
        { name: 'Gebruiker', value: `${user.tag}`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reden', value: reason }
      );

    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
