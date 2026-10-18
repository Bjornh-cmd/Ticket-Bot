'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const {
  db,
  getPoll,
  getPollOptions,
  getPollVoteCounts,
  setPollMessage,
} = require('../database/db');

const DEFAULT_ANSWER_EMOJIS = ['✅', '❌', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

function splitEmojiAndText(raw) {
  const s = String(raw || '').trim();
  const custom = s.match(/^<(a)?:(\w+):(\d+)>\s*(.+)$/);
  if (custom) {
    return { emoji: `<${custom[1] ? 'a' : ''}:${custom[2]}:${custom[3]}>`, text: custom[4].slice(0, 55) };
  }
  try {
    const m = s.match(/^(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)\s+(.+)$/u);
    if (m) return { emoji: m[1], text: m[2].slice(0, 55) };
  } catch {
    // ignore
  }
  return { emoji: null, text: s.slice(0, 55) };
}

function toNativeAnswers(options) {
  return options.slice(0, 10).map((o, i) => {
    const fromLabel = splitEmojiAndText(o.label || o.text || '');
    const emoji =
      (o.emoji && o.emoji !== '▪️' ? o.emoji : null) ||
      fromLabel.emoji ||
      (options.length === 2 ? (i === 0 ? '✅' : '❌') : DEFAULT_ANSWER_EMOJIS[i] || null);
    const text = fromLabel.text || String(o.label || `Option ${i + 1}`).slice(0, 55);
    const answer = { text };
    if (emoji) answer.emoji = emoji;
    return answer;
  });
}

function durationHoursFromMs(endsAt) {
  const hours = Math.ceil((Number(endsAt) - Date.now()) / 3_600_000);
  return Math.max(1, Math.min(768, hours));
}

async function sendNativePoll(channel, { question, options, endsAt, allowMulti = false }) {
  return channel.send({
    poll: {
      question: { text: String(question).slice(0, 300) },
      answers: toNativeAnswers(options),
      duration: durationHoursFromMs(endsAt),
      allowMultiselect: Boolean(allowMulti),
    },
  });
}

// ── Visual helpers ────────────────────────────────────────────────────────────

/** Build a visual progress bar (16 chars wide). */
function bar(pct, width = 16) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

/** Find the winning option(s) (highest vote count, >0). */
function winners(options, countMap, total) {
  if (!total) return new Set();
  const max = Math.max(...options.map((o) => Number(countMap[o.id] || 0)));
  if (!max) return new Set();
  return new Set(options.filter((o) => Number(countMap[o.id] || 0) === max).map((o) => o.id));
}

// ── Embed builder ─────────────────────────────────────────────────────────────

function buildPollEmbed(poll, options, counts, ended = false) {
  const countMap = Object.fromEntries((counts || []).map((c) => [c.option_id, c.votes]));
  const total = (counts || []).reduce((sum, c) => sum + Number(c.votes), 0);
  const win = ended ? winners(options, countMap, total) : new Set();

  const lines = options.map((o) => {
    const votes = Number(countMap[o.id] || 0);
    const pct   = total ? Math.round((votes / total) * 100) : 0;
    const isWin = win.has(o.id);
    const isGoodMark = ended && o.is_good ? ' ✅' : '';

    // Icon: winning gets ✅ on end, correct answer mark if set, else ▫️
    const icon = ended
      ? isWin
        ? '**✅**'
        : '**✗**'
      : '▫️';

    const label = `${icon} **${o.label}**${isGoodMark}`;
    const barStr = bar(pct);
    const votes_str = `${votes.toLocaleString()} vote${votes === 1 ? '' : 's'}`;
    const pct_str = `${pct}%`;

    // Format like Discord's native polls: option label, then bar + count on next line
    return `${label}\n\`${barStr}\` ${votes_str} · **${pct_str}**`;
  });

  // Header colour: green active, red ended
  const color = ended ? 0xed4245 : 0x248046;

  const tsEnd = Math.floor(poll.ends_at / 1000);
  const endsValue = ended
    ? `Closed · <t:${tsEnd}:f>`
    : `<t:${tsEnd}:R>  (<t:${tsEnd}:f>)`;

  const mode = poll.allow_multi
    ? 'Multiple choices'
    : poll.vote_once !== 0
      ? 'One vote per person'
      : 'Vote change allowed';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(poll.question)
    .setDescription(lines.join('\n\n') || '*No options*')
    .addFields(
      { name: '🗳️ Votes', value: `**${total.toLocaleString()}**`, inline: true },
      { name: '⏱️ Ends', value: endsValue, inline: true },
      { name: '⚙️ Mode', value: mode, inline: true }
    )
    .setFooter({ text: ended ? `Poll #${poll.id} · Closed` : `Poll #${poll.id} · Click a button to vote` })
    .setTimestamp();

  // Show correct answers section if set and poll ended
  if (ended) {
    const goods = options.filter((o) => o.is_good);
    if (goods.length) {
      embed.addFields({
        name: '✅ Correct answer(s)',
        value: goods.map((g) => `• ${g.label}`).join('\n'),
      });
    }
    // Winning option callout
    const winOpts = options.filter((o) => win.has(o.id));
    if (winOpts.length && total > 0) {
      const winPct = total ? Math.round((Number(countMap[winOpts[0].id] || 0) / total) * 100) : 0;
      embed.addFields({
        name: '🏆 Winning answer',
        value: winOpts.map((o) => `**${o.label}** · ${winPct}%`).join(', '),
      });
    }
  }

  return embed;
}

// ── Buttons ───────────────────────────────────────────────────────────────────

function buildPollButtons(poll, options, ended = false) {
  if (ended) return [];
  const rows = [];
  for (let i = 0; i < options.length; i += 5) {
    const row = new ActionRowBuilder();
    for (const o of options.slice(i, i + 5)) {
      const btn = new ButtonBuilder()
        .setCustomId(`poll_vote_${poll.id}_${o.id}`)
        .setLabel(o.label.slice(0, 80))
        .setStyle(ButtonStyle.Secondary);
      if (o.emoji && o.emoji !== '▪️') {
        try { btn.setEmoji(o.emoji); } catch { /* skip invalid emoji */ }
      }
      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

// ── Refresh live message ──────────────────────────────────────────────────────

async function refreshPollMessage(client, pollId) {
  const poll = getPoll(pollId);
  if (!poll || !poll.message_id) return;
  const options = getPollOptions(pollId);
  const counts  = getPollVoteCounts(pollId);
  const ended   = poll.status !== 'active';

  const guild   = await client.guilds.fetch(poll.guild_id).catch(() => null);
  if (!guild) return;
  const channel = await guild.channels.fetch(poll.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(poll.message_id).catch(() => null);
  if (!message) return;

  // Discord native poll — keep Discord's vote UI, just expire it when we close
  if (message.poll) {
    if (ended && !message.poll.resultsFinalized) {
      await message.poll.end().catch(() => null);
    }
    return;
  }

  await message.edit({
    embeds:     [buildPollEmbed(poll, options, counts, ended)],
    components: buildPollButtons(poll, options, ended),
  });

  // When poll just ended: post a follow-up "results" reply to the poll message
  if (ended && !poll.result_posted) {
    db.prepare(`UPDATE polls SET result_posted = 1 WHERE id = ?`).run(pollId);
    const total = counts.reduce((s, c) => s + Number(c.votes), 0);
    const countMap = Object.fromEntries(counts.map((c) => [c.option_id, c.votes]));
    const win = winners(options, countMap, total);
    const winOpts = options.filter((o) => win.has(o.id));
    if (winOpts.length && total > 0) {
      const winPct = Math.round((Number(countMap[winOpts[0].id] || 0) / total) * 100);
      const resultEmbed = new EmbedBuilder()
        .setColor(0x248046)
        .setTitle(`📊 Poll closed · ${poll.question}`)
        .setDescription(
          `**${winOpts[0].label}** ✅\nWinning answer · **${winPct}%**\n\n` +
          `${total.toLocaleString()} total vote${total === 1 ? '' : 's'}`
        )
        .setTimestamp();
      await message.reply({ embeds: [resultEmbed] }).catch(() => null);
    }
  }
}

// ── Vote handler ──────────────────────────────────────────────────────────────

async function handlePollVote(interaction) {
  const match = interaction.customId.match(/^poll_vote_(\d+)_(\d+)$/);
  if (!match) return;

  const pollId   = Number(match[1]);
  const optionId = Number(match[2]);
  const poll     = getPoll(pollId);

  if (!poll || poll.status !== 'active') {
    return interaction.reply({ content: 'This poll is closed.', ephemeral: true });
  }
  if (Date.now() >= poll.ends_at) {
    db.prepare(`UPDATE polls SET status = 'ended' WHERE id = ?`).run(pollId);
    await refreshPollMessage(interaction.client, pollId);
    return interaction.reply({ content: 'This poll has expired.', ephemeral: true });
  }

  const option = getPollOptions(pollId).find((o) => o.id === optionId);
  if (!option) {
    return interaction.reply({ content: 'Invalid option.', ephemeral: true });
  }

  const existing = db
    .prepare(`SELECT * FROM poll_votes WHERE poll_id = ? AND user_id = ?`)
    .all(pollId, interaction.user.id);

  const voteOnce = poll.vote_once !== 0 && !poll.allow_multi;

  if (voteOnce && existing.length) {
    return interaction.reply({
      content: "You've already voted. This poll only allows **one vote**.",
      ephemeral: true,
    });
  }

  const alreadyThis = existing.find((v) => v.option_id === optionId);
  if (alreadyThis) {
    if (poll.allow_multi) {
      db.prepare(`DELETE FROM poll_votes WHERE poll_id = ? AND option_id = ? AND user_id = ?`)
        .run(pollId, optionId, interaction.user.id);
      await refreshPollMessage(interaction.client, pollId);
      return interaction.reply({ content: `Removed your vote for **${option.label}**.`, ephemeral: true });
    }
    return interaction.reply({ content: 'You already voted for this option.', ephemeral: true });
  }

  // Switch vote (single-choice)
  if (!poll.allow_multi && existing.length) {
    db.prepare(`DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?`).run(pollId, interaction.user.id);
  }

  db.prepare(`INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)`)
    .run(pollId, optionId, interaction.user.id);

  await refreshPollMessage(interaction.client, pollId);

  const counts = getPollVoteCounts(pollId);
  const total  = counts.reduce((s, c) => s + Number(c.votes), 0);
  const myVotes = counts.find((c) => c.option_id === optionId);
  const pct = total ? Math.round((Number(myVotes?.votes || 0) / total) * 100) : 0;

  return interaction.reply({
    content: `✅ Voted for **${option.label}** · ${pct}% of votes so far.`,
    ephemeral: true,
  });
}

// ── Expiry checker ────────────────────────────────────────────────────────────

async function processExpiredPolls(client) {
  const now = Date.now();
  const rows = db
    .prepare(`SELECT id FROM polls WHERE status = 'active' AND ends_at <= ?`)
    .all(now);
  for (const row of rows) {
    db.prepare(`UPDATE polls SET status = 'ended' WHERE id = ?`).run(row.id);
    await refreshPollMessage(client, row.id).catch(() => null);
  }
}

function startPollChecker(client) {
  processExpiredPolls(client);
  setInterval(() => processExpiredPolls(client), 30_000);
}

module.exports = {
  buildPollEmbed,
  buildPollButtons,
  refreshPollMessage,
  handlePollVote,
  startPollChecker,
  setPollMessage,
  sendNativePoll,
  durationHoursFromMs,
};
