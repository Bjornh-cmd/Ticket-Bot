const { SlashCommandBuilder } = require('discord.js');
const { getGuildSettings } = require('../database/db');
const { baseEmbed } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Send a suggestion to the suggestion channel')
    .addStringOption((opt) =>
      opt.setName('idea').setDescription('Your suggestion').setRequired(true).setMaxLength(1000)
    ),

  async execute(interaction) {
    const settings = getGuildSettings(interaction.guildId);
    if (!settings.suggestion_channel_id) {
      return interaction.reply({
        content: 'Er is nog geen suggestie-kanaal ingesteld. Doe dat in het Reedhall dashboard.',
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.fetch(settings.suggestion_channel_id).catch(() => null);
    if (!channel?.isTextBased()) {
      return interaction.reply({
        content: 'Suggestie-kanaal bestaat niet meer. Update dit in het dashboard.',
        ephemeral: true,
      });
    }

    const idea = interaction.options.getString('idea', true);
    const color = Number.parseInt(String(settings.embed_color || '0f766e').replace('#', ''), 16);

    const msg = await channel.send({
      embeds: [
        baseEmbed(Number.isFinite(color) ? color : 0x0f766e)
          .setTitle('Nieuwe suggestie')
          .setDescription(idea)
          .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL({ size: 64 }),
          })
          .setFooter({ text: 'Reedhall · /suggest' }),
      ],
    });

    await msg.react('👍').catch(() => null);
    await msg.react('👎').catch(() => null);

    return interaction.reply({ content: `Suggestie geplaatst in ${channel}.`, ephemeral: true });
  },
};
