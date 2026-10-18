const { SlashCommandBuilder } = require('discord.js');
const { getGuildSettings } = require('../database/db');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a member to staff')
    .addUserOption((o) => o.setName('user').setDescription('Member to report').setRequired(true))
    .addStringOption((o) =>
      o.setName('reason').setDescription('Why?').setRequired(true).setMaxLength(1000)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const settings = getGuildSettings(interaction.guildId);
    const channelId = settings.mod_log_channel_id;
    if (!channelId) {
      return interaction.reply({
        content: 'Er is nog geen mod-log kanaal. Stel die in via het dashboard.',
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: 'Mod-log kanaal is ongeldig.', ephemeral: true });
    }

    await channel.send({
      embeds: [
        baseEmbed(0xed4245)
          .setTitle('Nieuw report')
          .addFields(
            { name: 'Gemeld', value: `${target} (${target.id})`, inline: true },
            { name: 'Door', value: `${interaction.user} (${interaction.user.id})`, inline: true },
            { name: 'Reden', value: reason },
            { name: 'Kanaal', value: `${interaction.channel}` }
          ),
      ],
    });

    return interaction.reply({ content: 'Report doorgestuurd naar de staff.', ephemeral: true });
  },
};
