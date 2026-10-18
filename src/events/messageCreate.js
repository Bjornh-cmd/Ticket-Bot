const { Events, AttachmentBuilder } = require('discord.js');
const { t, defaultLocale } = require('../i18n');
const { awardLevelXpForMessage, getLevelProfile, getLevelRank } = require('../database/db');
const { buildLevelCard, levelsEnabledForGuild, guildPlan, levelProgress } = require('../utils/levels');
const { hasFeature } = require('../utils/plans');
const { buildRankCardBuffer } = require('../utils/rankCard');
const { findMatchingCustomPrefixCommand } = require('../utils/customPrefixCommands');

/**
 * In DM with Reedhall: type "clear" to delete all bot messages
 * (tickets, giveaway wins, etc.).
 */
async function clearDmHistory(channel, botId) {
  if (channel.partial) {
    await channel.fetch().catch(() => null);
  }

  let deleted = 0;
  let before;
  for (let pass = 0; pass < 25; pass += 1) {
    const opts = { limit: 100 };
    if (before) opts.before = before;
    const batch = await channel.messages.fetch(opts).catch(() => null);
    if (!batch?.size) break;

    const sorted = [...batch.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    before = sorted[sorted.length - 1]?.id;

    for (const msg of sorted) {
      const authorId = msg.author?.id;
      const isOurs = !authorId || authorId === botId || msg.author?.bot === true;
      if (!isOurs) continue;
      const ok = await msg.delete().then(() => true).catch(() => false);
      if (ok) deleted += 1;
      await new Promise((r) => setTimeout(r, 220));
    }

    if (batch.size < 100) break;
  }
  return deleted;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot) return;
    if (message.inGuild()) {
      const { enabled, plan } = levelsEnabledForGuild(message.guild.id, client);
      if (enabled) {
        awardLevelXpForMessage(message.guild.id, message.author.id);
      }

      const text = String(message.content || '').trim().toLowerCase();
      if (text === '!level') {
        if (!enabled) {
          await message.reply(
            `Level systeem zit niet in **${plan.name}**. Upgrade naar Desk of Estate.`
          );
          return;
        }
        const member =
          message.guild.members.cache.get(message.author.id) ||
          (await message.guild.members.fetch(message.author.id).catch(() => null));
        if (!member) return;
        const profile = getLevelProfile(message.guild.id, message.author.id);

        if (hasFeature(plan, 'levelCardImage')) {
          try {
            const prog = levelProgress(profile);
            const rank = getLevelRank(message.guild.id, message.author.id);
            const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 });
            const buf = await buildRankCardBuffer({
              username: message.author.displayName || message.author.username,
              discriminator: message.author.discriminator || '0',
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
            await message.reply({ files: [attachment] }).catch(() => null);
            return;
          } catch (err) {
            console.error('[rankCard] !level failed, falling back to embed:', err.message);
          }
        }

        const payload = buildLevelCard(message, member, profile);
        await message.reply(payload).catch(() => null);
        return;
      }

      const customCmd = findMatchingCustomPrefixCommand(
        message.guild.id,
        message.content,
        message.channel.id,
        plan
      );
      if (customCmd) {
        // #region agent log
        fetch('http://127.0.0.1:7350/ingest/07781833-3577-41e9-8a4f-196b6994c076',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1d128d'},body:JSON.stringify({sessionId:'1d128d',location:'messageCreate.js:replyAttempt',message:'attempting reply',data:{guildId:message.guild.id,channelId:message.channel.id,trigger:customCmd.trigger},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        const replyErr = await message.reply({ content: String(customCmd.response).slice(0, 2000) }).catch((err) => err);
        // #region agent log
        fetch('http://127.0.0.1:7350/ingest/07781833-3577-41e9-8a4f-196b6994c076',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1d128d'},body:JSON.stringify({sessionId:'1d128d',location:'messageCreate.js:replyResult',message:'reply result',data:{ok:!(replyErr instanceof Error),errorCode:replyErr?.code||null,errorMsg:replyErr instanceof Error?String(replyErr.message).slice(0,120):null},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
        // #endregion
      } else if (String(message.content || '').trim().startsWith('!')) {
        // #region agent log
        fetch('http://127.0.0.1:7350/ingest/07781833-3577-41e9-8a4f-196b6994c076',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1d128d'},body:JSON.stringify({sessionId:'1d128d',location:'messageCreate.js:noCustomMatch',message:'! message but no custom cmd',data:{content:String(message.content||'').slice(0,80),guildId:message.guild.id,planId:plan?.id,planHasFeature:hasFeature(plan,'customPrefixCommands')},timestamp:Date.now(),hypothesisId:'A-B-D'})}).catch(()=>{});
        // #endregion
      }
      return;
    }

    const text = String(message.content || '').trim().toLowerCase();
    if (text !== 'clear') return;

    // DMs have no guild — use platform default language
    const loc = defaultLocale();

    try {
      await message.channel.sendTyping().catch(() => null);
      const deleted = await clearDmHistory(message.channel, client.user.id);
      const confirm = await message.channel.send({
        content:
          deleted > 0
            ? t(loc, 'dm.cleared', { count: deleted })
            : t(loc, 'dm.clearedEmpty'),
      });
      setTimeout(() => confirm.delete().catch(() => null), 8000);
    } catch (err) {
      console.error('DM clear error:', err.message);
      await message.channel.send(t(loc, 'dm.clearFailed')).catch(() => null);
    }
  },
};
