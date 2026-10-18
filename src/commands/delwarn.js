const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../database/db');
const { baseEmbed, sendModLog } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delwarn')
    .setDescription('Delete a warning by ID')
    .addIntegerOption((o) => o.setName('id').setDescription('Warn ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const id = interaction.options.getInteger('id', true);
    const warn = db
      .prepare(`SELECT * FROM warnings WHERE id = ? AND guild_id = ? AND active = 1`)
      .get(id, interaction.guild.id);

    if (!warn) {
      return interaction.reply({ content: 'Waarschuwing niet gevonden.', ephemeral: true });
    }

    db.prepare(`UPDATE warnings SET active = 0 WHERE id = ?`).run(id);
    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'delwarn', ?, ?, ?)`
    ).run(interaction.guild.id, warn.user_id, interaction.user.id, `Warn #${id} verwijderd`);

    const embed = baseEmbed(0x57f287)
      .setTitle('Waarschuwing verwijderd')
      .setDescription(`Warn \`#${id}\` van <@${warn.user_id}> is verwijderd.`);

    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
