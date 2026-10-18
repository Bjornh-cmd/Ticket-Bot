const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { baseEmbed, sendModLog } = require('../utils/helpers');
const { db } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock this channel (@everyone cannot talk)')
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (interaction.channel.type !== ChannelType.GuildText) {
      return interaction.reply({ content: 'Alleen in tekstkanalen.', ephemeral: true });
    }
    const reason = interaction.options.getString('reason') || 'Geen reden opgegeven';
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: false,
    });

    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'lock', ?, ?, ?)`
    ).run(interaction.guild.id, interaction.channel.id, interaction.user.id, reason);

    const embed = baseEmbed(0xed4245)
      .setTitle('Kanaal vergrendeld')
      .setDescription(`Dit kanaal is vergrendeld door ${interaction.user}.\n**Reden:** ${reason}`);

    await sendModLog(interaction.guild, embed);
    return interaction.reply({ embeds: [embed] });
  },
};
