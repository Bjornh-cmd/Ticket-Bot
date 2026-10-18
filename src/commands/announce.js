const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { getGuildSettings } = require('../database/db');
const { hasModRole, baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send an announcement embed (mods)')
    .addStringOption((o) => o.setName('title').setDescription('Title').setRequired(true).setMaxLength(256))
    .addStringOption((o) => o.setName('text').setDescription('Content').setRequired(true).setMaxLength(2000))
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel (defaults to this channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  async execute(interaction) {
    if (!hasModRole(interaction.member)) {
      return interaction.reply({ content: 'Alleen mods kunnen aankondigen.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel?.isTextBased?.()) {
      return interaction.reply({ content: 'Ongeldig kanaal.', ephemeral: true });
    }

    const settings = getGuildSettings(interaction.guildId);
    const color = Number.parseInt(String(settings.embed_color || '0f766e').replace('#', ''), 16);

    await channel.send({
      embeds: [
        baseEmbed(Number.isFinite(color) ? color : 0x0f766e)
          .setTitle(interaction.options.getString('title', true))
          .setDescription(interaction.options.getString('text', true))
          .setFooter({
            text: `Reedhall · ${interaction.user.tag}`,
          }),
      ],
    });

    return interaction.reply({ content: `Aankondiging geplaatst in ${channel}.`, ephemeral: true });
  },
};
