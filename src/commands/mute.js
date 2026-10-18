const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const { db, getGuildSettings } = require('../database/db');
const { canModerate, baseEmbed, sendModLog, formatDuration } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a member (timeout or mute role)')
    .addUserOption((o) => o.setName('user').setDescription('Member to mute').setRequired(true))
    .addStringOption((o) =>
      o.setName('duration').setDescription('e.g. 10m, 1h, 1d (max 28d for timeout)').setRequired(true)
    )
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const durationRaw = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') || 'Geen reden opgegeven';
    const durationMs = ms(durationRaw);

    if (!durationMs || durationMs < 10_000) {
      return interaction.reply({ content: 'Ongeldige duur. Gebruik bijv. `10m`, `1h`, `1d`.', ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: 'Lid niet gevonden.', ephemeral: true });

    const check = canModerate(interaction.member, member);
    if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });

    const settings = getGuildSettings(interaction.guild.id);
    const maxTimeout = 28 * 24 * 60 * 60 * 1000;
    let usedRole = false;

    if (durationMs <= maxTimeout && member.moderatable) {
      await member.timeout(durationMs, reason);
    } else if (settings.mute_role_id) {
      await member.roles.add(settings.mute_role_id, reason);
      usedRole = true;
      const expiresAt = Date.now() + durationMs;
      db.prepare(
        `INSERT INTO temp_punishments (guild_id, user_id, type, expires_at, reason, moderator_id)
         VALUES (?, ?, 'mute', ?, ?, ?)`
      ).run(interaction.guild.id, user.id, expiresAt, reason, interaction.user.id);
    } else {
      return interaction.reply({
        content: 'Timeout max 28 dagen. Stel een mute-rol in via `/dashboard` voor langere mutes.',
        ephemeral: true,
      });
    }

    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason, duration_ms, expires_at)
       VALUES (?, 'mute', ?, ?, ?, ?, datetime(?, 'unixepoch'))`
    ).run(
      interaction.guild.id,
      user.id,
      interaction.user.id,
      reason,
      durationMs,
      Math.floor((Date.now() + durationMs) / 1000)
    );

    const embed = baseEmbed(0xfaa61a)
      .setTitle(usedRole ? 'Lid gemute (rol)' : 'Lid getimeout')
      .addFields(
        { name: 'Gebruiker', value: `${user.tag}`, inline: true },
        { name: 'Duur', value: formatDuration(durationMs), inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reden', value: reason }
      );

    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
