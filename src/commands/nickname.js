const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate, baseEmbed, sendModLog } = require('../utils/helpers');
const { db } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Change a member nickname')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) =>
      o.setName('name').setDescription('New name (empty = reset)').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const name = interaction.options.getString('name') || null;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: 'Lid niet gevonden.', ephemeral: true });

    const check = canModerate(interaction.member, member);
    if (!check.ok && interaction.user.id !== user.id) {
      return interaction.reply({ content: check.reason, ephemeral: true });
    }

    await member.setNickname(name);
    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'nickname', ?, ?, ?)`
    ).run(interaction.guild.id, user.id, interaction.user.id, name || 'reset');

    const embed = baseEmbed(0x5865f2)
      .setTitle('Nickname aangepast')
      .setDescription(`Nickname van ${user} is nu: **${name || '(gereset)'}**`);

    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
