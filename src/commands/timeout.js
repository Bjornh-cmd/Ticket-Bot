const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const { db } = require('../database/db');
const { canModerate, baseEmbed, sendModLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member (Discord timeout)')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) =>
      o.setName('duration').setDescription('e.g. 10m, 1h, 1d').setRequired(true)
    )
    .addStringOption((o) => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const durationRaw = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') || 'Geen reden opgegeven';
    const duration = ms(durationRaw);
    if (!duration || duration < 5000 || duration > 28 * 24 * 60 * 60 * 1000) {
      return interaction.reply({
        content: 'Ongeldige duur. Gebruik bijv. `10m`, `1h` of `1d` (max 28 dagen).',
        ephemeral: true,
      });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: 'Lid niet gevonden.', ephemeral: true });

    const check = canModerate(interaction.member, member);
    if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
    if (!member.moderatable) {
      return interaction.reply({ content: 'Ik kan dit lid niet timeouten.', ephemeral: true });
    }

    await member.timeout(duration, reason);
    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason, duration_ms) VALUES (?, 'timeout', ?, ?, ?, ?)`
    ).run(interaction.guild.id, user.id, interaction.user.id, reason, duration);

    const embed = baseEmbed(0xf0b232)
      .setTitle('Timeout gezet')
      .addFields(
        { name: 'Gebruiker', value: `${user.tag}`, inline: true },
        { name: 'Duur', value: durationRaw, inline: true },
        { name: 'Reden', value: reason }
      );
    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
