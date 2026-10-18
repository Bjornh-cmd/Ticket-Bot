const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../database/db');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a member')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const rows = db
      .prepare(
        `SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? AND active = 1 ORDER BY id DESC LIMIT 15`
      )
      .all(interaction.guild.id, user.id);

    if (!rows.length) {
      return interaction.reply({ content: `${user.tag} heeft geen actieve waarschuwingen.`, ephemeral: true });
    }

    const list = rows
      .map((w) => `\`#${w.id}\` — ${w.reason} *(door <@${w.moderator_id}> · ${w.created_at})*`)
      .join('\n');

    const embed = baseEmbed(0xfaa61a)
      .setTitle(`Waarschuwingen — ${user.tag}`)
      .setDescription(list)
      .setFooter({ text: `${rows.length} actief getoond` });

    return interaction.reply({ embeds: [embed] });
  },
};
