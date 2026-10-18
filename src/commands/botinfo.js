const { SlashCommandBuilder, version } = require('discord.js');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder().setName('botinfo').setDescription('Info about Reedhall'),

  async execute(interaction) {
    const client = interaction.client;
    const embed = baseEmbed(0x0f766e)
      .setTitle('Reedhall')
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Commands', value: `${client.commands.size}`, inline: true },
        { name: 'Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
        { name: 'discord.js', value: `v${version}`, inline: true },
        { name: 'Node', value: process.version, inline: true },
        { name: 'Uptime', value: `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'Staff desk · /dashboard' });

    return interaction.reply({ embeds: [embed] });
  },
};
