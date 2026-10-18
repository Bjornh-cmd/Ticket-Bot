const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const { db } = require('../database/db');
const { canModerate, baseEmbed, sendModLog, formatDuration } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily ban a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption((o) =>
      o.setName('duration').setDescription('e.g. 1h, 1d, 7d').setRequired(true)
    )
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const durationRaw = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') || 'Geen reden opgegeven';
    const durationMs = ms(durationRaw);

    if (!durationMs || durationMs < 60_000) {
      return interaction.reply({
        content: 'Ongeldige duur. Gebruik bijv. `1h`, `12h`, `1d`, `7d`.',
        ephemeral: true,
      });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const check = canModerate(interaction.member, member);
      if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
      if (!member.bannable) {
        return interaction.reply({ content: 'Ik kan dit lid niet bannen.', ephemeral: true });
      }
    }

    const expiresAt = Date.now() + durationMs;
    await interaction.guild.members.ban(user.id, { reason: `[TEMPBAN ${durationRaw}] ${reason}` });

    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason, duration_ms, expires_at)
       VALUES (?, 'tempban', ?, ?, ?, ?, datetime(?, 'unixepoch'))`
    ).run(
      interaction.guild.id,
      user.id,
      interaction.user.id,
      reason,
      durationMs,
      Math.floor(expiresAt / 1000)
    );

    db.prepare(
      `INSERT INTO temp_punishments (guild_id, user_id, type, expires_at, reason, moderator_id)
       VALUES (?, ?, 'tempban', ?, ?, ?)`
    ).run(interaction.guild.id, user.id, expiresAt, reason, interaction.user.id);

    const embed = baseEmbed(0xfaa61a)
      .setTitle('Tijdelijke ban')
      .addFields(
        { name: 'Gebruiker', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Duur', value: formatDuration(durationMs), inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reden', value: reason }
      );

    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
