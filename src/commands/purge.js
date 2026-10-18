const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { baseEmbed, sendModLog } = require('../utils/helpers');
const { db } = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages in this channel')
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('1–100').setRequired(true).setMinValue(1).setMaxValue(100)
    )
    .addUserOption((o) => o.setName('user').setDescription('Only from this member').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    const fetched = await interaction.channel.messages.fetch({ limit: 100 });
    let toDelete = [...fetched.values()].filter(
      (m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );
    if (user) toDelete = toDelete.filter((m) => m.author.id === user.id);
    toDelete = toDelete.slice(0, amount);

    const deleted = await interaction.channel.bulkDelete(toDelete, true);

    db.prepare(
      `INSERT INTO mod_actions (guild_id, action, target_id, moderator_id, reason) VALUES (?, 'purge', ?, ?, ?)`
    ).run(
      interaction.guild.id,
      user?.id || interaction.channel.id,
      interaction.user.id,
      `${deleted.size} berichten verwijderd`
    );

    const embed = baseEmbed(0x5865f2)
      .setTitle('Berichten verwijderd')
      .setDescription(`${deleted.size} bericht(en) verwijderd${user ? ` van ${user.tag}` : ''}.`);

    await sendModLog(interaction.guild, embed);
    return interaction.editReply({ embeds: [embed] });
  },
};
