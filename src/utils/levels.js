const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { getLinkedGuild, getUserAccount, getLevelRank } = require('../database/db');
const { resolvePlan, hasFeature } = require('./plans');

function guildPlan(guildId, client) {
  const guild = client?.guilds?.cache?.get(guildId);
  if (guild?.ownerId) return resolvePlan(getUserAccount(guild.ownerId));
  const linked = getLinkedGuild(guildId);
  if (!linked?.linked_by) return resolvePlan(null);
  return resolvePlan(getUserAccount(linked.linked_by));
}

function levelProgress(profile) {
  const total = Math.max(0, Number(profile?.xp) || 0);
  let level = 1;
  let remaining = total;
  let needed = 100;
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = 100 + (level - 1) * 35;
  }
  return { level, current: remaining, needed, total };
}

function progressBar(current, needed, width = 16) {
  const ratio = needed <= 0 ? 0 : Math.max(0, Math.min(1, current / needed));
  const filled = Math.round(ratio * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

function buildLevelCard(interactionOrMessage, targetUser, profile, baseUrl) {
  const guild = interactionOrMessage.guild;
  const progress = levelProgress(profile);
  const rank = getLevelRank(guild.id, targetUser.id);
  const bar = progressBar(progress.current, progress.needed);
  const dashboardBase = String(baseUrl || process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
  const customizeUrl = `${dashboardBase}/leden/levels/${guild.id}`;

  const embed = new EmbedBuilder()
    .setColor(0x60a5fa)
    .setTitle(`🏆 Level card · ${targetUser.displayName || targetUser.username}`)
    .setDescription(
      `**Rank #${rank}** · **Level ${progress.level}**\n` +
        `\`${bar}\` **${progress.current}/${progress.needed} XP**\n` +
        `Totaal XP: **${progress.total}**`
    )
    .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 256 }))
    .setFooter({ text: 'Verdien XP door berichten te sturen (max 1x per minuut).' });

  const PRESET_COLORS = {
    'preset:blue':   0x3b82f6,
    'preset:green':  0x22c55e,
    'preset:purple': 0xa855f7,
    'preset:dark':   0x1e293b,
    'preset:sunset': 0xf97316,
    'preset:ocean':  0x38bdf8,
  };
  const bg = profile?.background_url || '';
  if (bg && PRESET_COLORS[bg] !== undefined) {
    embed.setColor(PRESET_COLORS[bg]);
  } else if (bg && !bg.startsWith('preset:')) {
    embed.setImage(bg);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('✨ Change background')
      .setStyle(ButtonStyle.Link)
      .setURL(customizeUrl)
  );
  return { embeds: [embed], components: [row] };
}

function levelsEnabledForGuild(guildId, client) {
  const plan = guildPlan(guildId, client);
  return { enabled: hasFeature(plan, 'levels'), plan };
}

module.exports = {
  guildPlan,
  levelProgress,
  buildLevelCard,
  levelsEnabledForGuild,
};

