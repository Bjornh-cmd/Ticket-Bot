const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../database/db');
const { canModerate, baseEmbed, sendModLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const check = canModerate(interaction.member, member);
      if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
    }

    const info = db
      .prepare(
        `INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)`
      )
      .run(interaction.guild.id, user.id, interaction.user.id, reason);

    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'warn', ?, ?, ?)`
    ).run(interaction.guild.id, user.id, interaction.user.id, reason);

    const count = db
      .prepare(`SELECT COUNT(*) AS c FROM warnings WHERE guild_id = ? AND user_id = ? AND active = 1`)
      .get(interaction.guild.id, user.id).c;

    const embed = baseEmbed(0xfaa61a)
      .setTitle('Waarschuwing gegeven')
      .addFields(
        { name: 'Gebruiker', value: `${user.tag}`, inline: true },
        { name: 'Warn ID', value: `#${info.lastInsertRowid}`, inline: true },
        { name: 'Totaal actief', value: `${count}`, inline: true },
        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
        { name: 'Reden', value: reason }
      );

    await sendModLog(interaction.guild, embed);

    try {
      await user.send({
        embeds: [
          baseEmbed(0xfaa61a)
            .setTitle(`Waarschuwing in ${interaction.guild.name}`)
            .setDescription(`**Reden:** ${reason}\n**Actieve warns:** ${count}`),
        ],
      });
    } catch {
      // DMs closed
    }

    return interaction.reply({ embeds: [embed] });
  },
};
