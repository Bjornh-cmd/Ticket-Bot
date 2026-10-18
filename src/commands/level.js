const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getLevelProfile } = require('../database/db');
const { buildLevelCard, levelsEnabledForGuild, levelProgress } = require('../utils/levels');
const { hasFeature } = require('../utils/plans');
const { buildRankCardBuffer } = require('../utils/rankCard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Toon je level card')
    .addUserOption((o) =>
      o.setName('user').setDescription('Bekijk level card van een ander').setRequired(false)
    ),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Dit command werkt alleen in servers.', ephemeral: true });
    }
    const { enabled, plan } = levelsEnabledForGuild(interaction.guildId, interaction.client);
    if (!enabled) {
      return interaction.reply({
        content:
          `Level systeem zit niet in **${plan.name}**.\n` +
          'Upgrade de server-owner naar een betaald plan (Desk/Estate) om XP en level cards te gebruiken.',
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user') || interaction.user;
    const member =
      interaction.guild.members.cache.get(target.id) ||
      (await interaction.guild.members.fetch(target.id).catch(() => null));
    if (!member) {
      return interaction.reply({ content: 'Deze gebruiker zit niet in deze server.', ephemeral: true });
    }

    const profile = getLevelProfile(interaction.guildId, target.id);

    // Estate plan: generate a real MEE6-style rank card image
    if (hasFeature(plan, 'levelCardImage')) {
      try {
        await interaction.deferReply({ ephemeral: true });
        const prog = levelProgress(profile);
        const { getLevelRank } = require('../database/db');
        const rank = getLevelRank(interaction.guildId, target.id);
        const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 256 });
        const buf = await buildRankCardBuffer({
          username: target.displayName || target.username,
          discriminator: target.discriminator || '0',
          avatarUrl,
          level: prog.level,
          rank,
          currentXp: prog.current,
          neededXp: prog.needed,
          totalXp: prog.total,
          backgroundUrl: profile.background_url || '',
          accentColor: '#60a5fa',
        });
        const attachment = new AttachmentBuilder(buf, { name: 'rankcard.png' });
        return interaction.editReply({ files: [attachment] });
      } catch (err) {
        console.error('[rankCard] failed, falling back to embed:', err.message);
        // Fall through to embed fallback
      }
    }

    const payload = buildLevelCard(interaction, member, profile);
    return interaction.reply({ ...payload, ephemeral: true });
  },
};

