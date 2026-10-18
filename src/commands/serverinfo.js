const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Info about this server'),

  async execute(interaction) {
    const g = interaction.guild;
    await g.members.fetch().catch(() => null);

    const embed = baseEmbed(0x5865f2)
      .setTitle(g.name)
      .setThumbnail(g.iconURL({ size: 256 }))
      .addFields(
        { name: 'Eigenaar', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Leden', value: `${g.memberCount}`, inline: true },
        { name: 'Kanalen', value: `${g.channels.cache.size}`, inline: true },
        { name: 'Rollen', value: `${g.roles.cache.size}`, inline: true },
        { name: 'Aangemaakt', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0} (lvl ${g.premiumTier})`, inline: true }
      );

    return interaction.reply({ embeds: [embed] });
  },
};
