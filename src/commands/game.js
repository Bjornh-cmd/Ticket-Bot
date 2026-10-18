'use strict';

/**
 * /game — mini-games, all replies are ephemeral (only visible to the user).
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function e(color, title, desc) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);
}

const REPLY = { ephemeral: true };

// ── 🎱 Magic 8-ball ───────────────────────────────────────────────────────────

const BALL = [
  '✅ It is certain.',
  '✅ It is decidedly so.',
  '✅ Without a doubt.',
  '✅ Yes, definitely.',
  '✅ You may rely on it.',
  '✅ As I see it, yes.',
  '✅ Most likely.',
  '✅ Outlook good.',
  '✅ Yes.',
  '✅ Signs point to yes.',
  '🟡 Reply hazy, try again.',
  '🟡 Ask again later.',
  '🟡 Better not tell you now.',
  '🟡 Cannot predict now.',
  '🟡 Concentrate and ask again.',
  '❌ Don\'t count on it.',
  '❌ My reply is no.',
  '❌ My sources say no.',
  '❌ Outlook not so good.',
  '❌ Very doubtful.',
];

function eightBall(question) {
  const ans = BALL[Math.floor(Math.random() * BALL.length)];
  return e(0x5865f2, '🎱 Magic 8-Ball', `**Question:** ${question}\n\n**Answer:** ${ans}`);
}

// ── 🪙 Coin flip ──────────────────────────────────────────────────────────────

function coinFlip() {
  const result = Math.random() < 0.5 ? 'Heads 🪙' : 'Tails 🪙';
  return e(0xfbbf24, '🪙 Coin Flip', `It landed on… **${result}**!`);
}

// ── 🎲 Dice roll ──────────────────────────────────────────────────────────────

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function diceRoll(sides = 6, count = 1) {
  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const total = rolls.reduce((a, b) => a + b, 0);
  const display =
    sides === 6
      ? rolls.map((r) => DICE_FACES[r - 1]).join('  ')
      : rolls.map((r) => `**${r}**`).join(', ');
  const desc =
    count > 1
      ? `${count}d${sides}: ${display}\nTotal: **${total}**`
      : `d${sides}: ${display} = **${total}**`;
  return e(0x10b981, '🎲 Dice Roll', desc);
}

// ── ✂️ Rock Paper Scissors ────────────────────────────────────────────────────

const RPS_EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
const RPS_NAME  = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

function rps(choice) {
  const picks = ['rock', 'paper', 'scissors'];
  const bot = picks[Math.floor(Math.random() * 3)];
  const p = `${RPS_EMOJI[choice]} ${RPS_NAME[choice]}`;
  const b = `${RPS_EMOJI[bot]} ${RPS_NAME[bot]}`;
  let result, color;
  if (choice === bot)               { result = "🤝 It's a tie!"; color = 0xfbbf24; }
  else if (RPS_BEATS[choice] === bot) { result = '🎉 You win!';   color = 0x22c55e; }
  else                               { result = '💀 I win!';      color = 0xef4444; }
  return e(color, '✂️ Rock Paper Scissors', `You: ${p}  ·  Me: ${b}\n\n**${result}**`);
}

// ── 🎰 Slot machine ───────────────────────────────────────────────────────────

const SLOTS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '💎', '7️⃣'];

function slotMachine() {
  const reels = Array.from({ length: 3 }, () => SLOTS[Math.floor(Math.random() * SLOTS.length)]);
  const allSame = reels.every((s) => s === reels[0]);
  const twoSame = !allSame && (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]);
  let result, color;
  if (allSame && reels[0] === '💎') { result = '💎 JACKPOT! Three diamonds!';     color = 0xfbbf24; }
  else if (allSame)                  { result = '🎉 Three of a kind! Small win!'; color = 0x22c55e; }
  else if (twoSame)                  { result = '✨ Two matching — so close!';     color = 0xf59e0b; }
  else                               { result = '😢 No match. Better luck next time!'; color = 0xef4444; }
  return e(color, '🎰 Slot Machine', `[ ${reels.join(' │ ')} ]\n\n${result}`);
}

// ── 🔢 Higher / Lower ────────────────────────────────────────────────────────

const hlSessions = new Map(); // userId → { secret, attempts }

function hlStart(userId) {
  hlSessions.set(userId, { secret: Math.floor(Math.random() * 100) + 1, attempts: 0 });
  return e(0x8b5cf6, '🔢 Higher or Lower', "I'm thinking of a number between **1** and **100**.\nUse `/game guess` to make a guess!");
}

function hlGuess(userId, n) {
  const s = hlSessions.get(userId);
  if (!s) return { embeds: [e(0xef4444, '🔢 No game', 'Start a game with `/game highlow`.')], ephemeral: true };
  s.attempts += 1;
  if (n === s.secret) {
    hlSessions.delete(userId);
    return { embeds: [e(0x22c55e, '🎉 Correct!', `The number was **${s.secret}**!\nYou needed **${s.attempts}** guess${s.attempts === 1 ? '' : 'es'}.`)], ephemeral: true };
  }
  const hint = n < s.secret ? '📈 **Higher!**' : '📉 **Lower!**';
  return { embeds: [e(0xf59e0b, '🔢 Higher or Lower', `Your guess: **${n}**\n\n${hint}\nAttempt **${s.attempts}** — use \`/game guess\` again.`)], ephemeral: true };
}

// ── 🔤 Word scramble ──────────────────────────────────────────────────────────

const WORDS = [
  'discord','server','ticket','moderator','admin','channel','message','emoji',
  'avatar','profile','voice','announcement','reaction','permission','category',
  'thread','webhook','nitro','booster','ban','kick','timeout','role','member',
  'gaming','stream','friend','invite','support','dashboard',
];

const scrambleSessions = new Map();

function scrambleStart(userId) {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
  scrambleSessions.set(userId, { word, scrambled });
  return e(0x0ea5e9, '🔤 Word Scramble', `Unscramble this word: **\`${scrambled}\`**\n\nUse \`/game answer\` to submit your answer!`);
}

function scrambleAnswer(userId, answer) {
  const s = scrambleSessions.get(userId);
  if (!s) return e(0xef4444, '🔤 No game', 'Start a game with `/game scramble`.');
  if (answer.toLowerCase().trim() === s.word) {
    scrambleSessions.delete(userId);
    return e(0x22c55e, '✅ Correct!', `The word was **${s.word}**! Well done!`);
  }
  return e(0xef4444, '❌ Wrong', `"${answer}" is not right. Try again!\n(Hint: \`${s.scrambled}\`)`);
}

// ── ❓ Trivia ─────────────────────────────────────────────────────────────────

const TRIVIA = [
  { q: 'How many colors are in a rainbow?',               a: '7',          opts: ['5', '6', '7', '8'] },
  { q: 'What is the speed of light (approx)?',            a: '300,000 km/s', opts: ['300,000 km/s', '150,000 km/s', '500,000 km/s', '200,000 km/s'] },
  { q: 'How many planets are in our solar system?',       a: '8',          opts: ['7', '8', '9', '10'] },
  { q: 'Which country has the most people?',              a: 'India',      opts: ['China', 'India', 'USA', 'Russia'] },
  { q: 'What is the chemical symbol for gold?',           a: 'Au',         opts: ['Go', 'Ag', 'Au', 'Gd'] },
  { q: 'How many teeth does a healthy adult human have?', a: '32',         opts: ['28', '30', '32', '36'] },
  { q: 'In which year was Discord founded?',              a: '2015',       opts: ['2013', '2014', '2015', '2016'] },
  { q: 'What is the most spoken language in the world?',  a: 'Mandarin',   opts: ['English', 'Spanish', 'Mandarin', 'Hindi'] },
  { q: 'How many sides does a hexagon have?',             a: '6',          opts: ['5', '6', '7', '8'] },
  { q: 'Which planet is closest to the Sun?',             a: 'Mercury',    opts: ['Venus', 'Mars', 'Mercury', 'Earth'] },
  { q: 'What is 12 × 12?',                               a: '144',        opts: ['132', '144', '154', '148'] },
  { q: 'How many continents are there on Earth?',         a: '7',          opts: ['5', '6', '7', '8'] },
];

const triviaSessions = new Map();
const LETTERS = ['A', 'B', 'C', 'D'];
const LETTER_EMOJI = ['🇦', '🇧', '🇨', '🇩'];

function triviaStart(userId) {
  const t = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
  const shuffled = [...t.opts].sort(() => Math.random() - 0.5);
  triviaSessions.set(userId, { trivia: t, shuffled });
  const opts = shuffled.map((o, i) => `${LETTER_EMOJI[i]} **${LETTERS[i]}.** ${o}`).join('\n');
  return e(0x7c3aed, '❓ Trivia', `**${t.q}**\n\n${opts}\n\nReply with \`/game answer\` using A, B, C, or D.`);
}

function triviaAnswer(userId, answer) {
  const s = triviaSessions.get(userId);
  if (!s) return e(0xef4444, '❓ No game', 'Start a trivia game with `/game trivia`.');
  const upper = answer.trim().toUpperCase();
  const chosen = LETTERS.includes(upper) ? s.shuffled[LETTERS.indexOf(upper)] : answer.trim();
  triviaSessions.delete(userId);
  if (chosen === s.trivia.a) {
    return e(0x22c55e, '✅ Correct!', `The answer was **${s.trivia.a}**. Great job!`);
  }
  return e(0xef4444, '❌ Wrong', `Your answer: **${chosen}**\nCorrect answer: **${s.trivia.a}**`);
}

// ── 🔮 Fortune ────────────────────────────────────────────────────────────────

const FORTUNES = [
  'A surprise awaits you around the corner. 🎁',
  'Your creativity will lead you to great things. 🌟',
  'Patience will bring you what you seek. ⏳',
  'A good friend will support you through hard times. 🤝',
  'Today is a great day to try something new. 🚀',
  'Your hard work will soon be rewarded. 💪',
  'Laughter is the best medicine — share it generously. 😄',
  'Beware of overconfidence; stay humble and focused. 🧘',
  'An unexpected opportunity is heading your way. 🌈',
  'Trust your instincts — they are rarely wrong. 🦋',
];

function fortune() {
  const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
  return e(0xd946ef, '🔮 Fortune Cookie', `*${f}*`);
}

// ── Main command ──────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('Play a mini-game! (only you can see the result)')
    .addSubcommand((sc) =>
      sc.setName('8ball').setDescription('Ask the magic 8-ball a question')
        .addStringOption((o) => o.setName('question').setDescription('Your question').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('coinflip').setDescription('Flip a coin — heads or tails?'))
    .addSubcommand((sc) =>
      sc.setName('dice').setDescription('Roll dice')
        .addIntegerOption((o) => o.setName('sides').setDescription('Number of sides (default 6)').setMinValue(2).setMaxValue(100))
        .addIntegerOption((o) => o.setName('count').setDescription('Number of dice (max 10)').setMinValue(1).setMaxValue(10))
    )
    .addSubcommand((sc) =>
      sc.setName('rps').setDescription('Rock, Paper, Scissors against the bot')
        .addStringOption((o) =>
          o.setName('choice').setDescription('Your pick').setRequired(true)
            .addChoices(
              { name: '🪨 Rock',     value: 'rock' },
              { name: '📄 Paper',    value: 'paper' },
              { name: '✂️ Scissors', value: 'scissors' },
            )
        )
    )
    .addSubcommand((sc) => sc.setName('slots').setDescription('Spin the slot machine 🎰'))
    .addSubcommand((sc) => sc.setName('fortune').setDescription('Get a fortune cookie message 🔮'))
    .addSubcommand((sc) => sc.setName('highlow').setDescription('Higher or Lower: guess my number (1–100)'))
    .addSubcommand((sc) =>
      sc.setName('guess').setDescription('Make a guess in Higher or Lower')
        .addIntegerOption((o) => o.setName('number').setDescription('Your guess (1–100)').setMinValue(1).setMaxValue(100).setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('scramble').setDescription('Unscramble a hidden word 🔤'))
    .addSubcommand((sc) => sc.setName('trivia').setDescription('Answer a trivia question ❓'))
    .addSubcommand((sc) =>
      sc.setName('answer').setDescription('Submit your answer for Word Scramble or Trivia')
        .addStringOption((o) => o.setName('text').setDescription('Your answer').setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const uid = interaction.user.id;

    if (sub === '8ball') {
      return interaction.reply({ embeds: [eightBall(interaction.options.getString('question', true))], ...REPLY });
    }

    if (sub === 'coinflip') {
      return interaction.reply({ embeds: [coinFlip()], ...REPLY });
    }

    if (sub === 'dice') {
      return interaction.reply({
        embeds: [diceRoll(interaction.options.getInteger('sides') ?? 6, interaction.options.getInteger('count') ?? 1)],
        ...REPLY,
      });
    }

    if (sub === 'rps') {
      return interaction.reply({ embeds: [rps(interaction.options.getString('choice', true))], ...REPLY });
    }

    if (sub === 'slots') {
      return interaction.reply({ embeds: [slotMachine()], ...REPLY });
    }

    if (sub === 'fortune') {
      return interaction.reply({ embeds: [fortune()], ...REPLY });
    }

    if (sub === 'highlow') {
      return interaction.reply({ embeds: [hlStart(uid)], ...REPLY });
    }

    if (sub === 'guess') {
      return interaction.reply({ ...hlGuess(uid, interaction.options.getInteger('number', true)) });
    }

    if (sub === 'scramble') {
      return interaction.reply({ embeds: [scrambleStart(uid)], ...REPLY });
    }

    if (sub === 'trivia') {
      return interaction.reply({ embeds: [triviaStart(uid)], ...REPLY });
    }

    if (sub === 'answer') {
      const text = interaction.options.getString('text', true);
      if (triviaSessions.has(uid)) {
        return interaction.reply({ embeds: [triviaAnswer(uid, text)], ...REPLY });
      }
      if (scrambleSessions.has(uid)) {
        return interaction.reply({ embeds: [scrambleAnswer(uid, text)], ...REPLY });
      }
      return interaction.reply({ content: 'No active game found. Start one with `/game trivia` or `/game scramble`.', ...REPLY });
    }
  },
};
