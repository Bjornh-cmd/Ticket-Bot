const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { canModerate, baseEmbed, sendModLog } = require('../utils/helpers');
const { db } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removerole')
    .setDescription('Remove a role from a member')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const user = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: 'Lid niet gevonden.', ephemeral: true });

    const check = canModerate(interaction.member, member);
    if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({ content: 'Die rol staat hoger dan mijn hoogste rol.', ephemeral: true });
    }

    await member.roles.remove(role, `Door ${interaction.user.tag}`);
    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'removerole', ?, ?, ?)`
    ).run(interaction.guild.id, user.id, interaction.user.id, role.name);

    const embed = baseEmbed(0xed4245)
      .setTitle('Rol verwijderd')
      .setDescription(`${role} verwijderd van ${user}.`);
    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
