const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const {
  db,
  getGuildSettings,
  nextTicketNumber,
  getTicketTypes,
  saveTicketTranscript,
  getTicketTranscript,
  getTicketByChannel,
  getTicketByNumber,
  getTicketById,
  updateTicketFields,
  isTicketDmMuted,
  setTicketDmMuted,
} = require('../database/db');
const { baseEmbed, hasSupportAccess } = require('../utils/helpers');
const { tg, getGuildLocale, t } = require('../i18n');
const { formatDiscordFix } = require('../utils/discordErrors');

function formatTranscriptLines(messages) {
  if (!messages?.size) return 'Geen berichten';
  return [...messages.values()]
    .reverse()
    .map((m) => {
      const time = m.createdAt.toLocaleString('nl-NL');
      const who = m.author?.tag || m.author?.username || 'onbekend';
      const text = m.content?.trim() || '';
      const extras = [];
      if (m.attachments?.size) extras.push(`[${m.attachments.size} bijlage(n)]`);
      if (m.embeds?.length) extras.push(`[${m.embeds.length} embed(s)]`);
      const body = [text, ...extras].filter(Boolean).join(' ') || '[leeg bericht]';
      return `[${time}] ${who}: ${body}`;
    })
    .join('\n');
}

function getTicketOpenBlockReason(interaction) {
  const loc = getGuildLocale(interaction.guildId);
  const settings = getGuildSettings(interaction.guild.id);
  if (!settings.ticket_category_id) {
    return t(loc, 'ticket.notConfigured');
  }

  const existingCount = db
    .prepare(`SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ? AND opener_id = ? AND status = 'open'`)
    .get(interaction.guild.id, interaction.user.id).c;

  const maxOpen = Math.max(1, Number(settings.max_open_tickets) || 1);
  if (existingCount >= maxOpen) {
    const openOnes = db
      .prepare(
        `SELECT channel_id FROM tickets WHERE guild_id = ? AND opener_id = ? AND status = 'open' ORDER BY id DESC`
      )
      .all(interaction.guild.id, interaction.user.id)
      .map((row) => `<#${row.channel_id}>`)
      .join(', ');

    return maxOpen === 1
      ? t(loc, 'ticket.alreadyOpenOne', { channels: openOnes })
      : t(loc, 'ticket.alreadyOpenMany', {
          count: existingCount,
          max: maxOpen,
          channels: openOnes,
        });
  }
  return null;
}

function buildTicketModal(type, locale) {
  const title = String(type?.name || 'Ticket').slice(0, 45);
  const typeKey = type?.id != null ? String(type.id) : 'general';

  let questions = Array.isArray(type?.questions) ? type.questions.filter((q) => q?.label) : [];
  if (!questions.length) {
    questions = [
      {
        id: 'username',
        label: t(locale, 'ticket.modalUsername'),
        style: 'short',
        required: true,
      },
      {
        id: 'question',
        label: t(locale, 'ticket.modalQuestion'),
        style: 'paragraph',
        required: true,
      },
      {
        id: 'extra',
        label: t(locale, 'ticket.modalExtra'),
        style: 'paragraph',
        required: false,
        placeholder: t(locale, 'ticket.modalExtraPlaceholder'),
      },
    ];
  }

  const rows = questions.slice(0, 5).map((q, i) => {
    const input = new TextInputBuilder()
      .setCustomId(`ticket_q_${i}`)
      .setLabel(String(q.label).slice(0, 45))
      .setStyle(q.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(Boolean(q.required))
      .setMaxLength(q.style === 'short' ? 100 : 1000);
    if (q.placeholder) {
      input.setPlaceholder(String(q.placeholder).slice(0, 100));
    }
    return new ActionRowBuilder().addComponents(input);
  });

  return new ModalBuilder()
    .setCustomId(`ticket_form:${typeKey}`)
    .setTitle(title)
    .addComponents(...rows);
}

async function showTicketFormModal(interaction, type = null) {
  const block = getTicketOpenBlockReason(interaction);
  if (block) {
    return interaction.reply({ content: block, ephemeral: true });
  }
  const loc = getGuildLocale(interaction.guildId);
  return interaction.showModal(buildTicketModal(type, loc));
}

function canOverwriteRole(guild, role) {
  const me = guild.members.me;
  if (!me || !role) return false;
  if (role.id === guild.id) return true;
  if (role.managed) return false;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles) && !me.permissions.has(PermissionFlagsBits.Administrator)) {
    return false;
  }
  return me.roles.highest.comparePositionTo(role) > 0;
}

function ticketOverwrites(guild, openerId, settings) {
  const byId = new Map();
  const set = (id, overwrite) => {
    if (!id) return;
    byId.set(String(id), { ...overwrite, id: String(id) });
  };

  set(guild.id, { deny: [PermissionFlagsBits.ViewChannel] });
  set(openerId, {
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
    ],
  });
  set(guild.client.user.id, {
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.ManageThreads,
    ],
  });

  const staffAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.CreatePrivateThreads,
    PermissionFlagsBits.ManageThreads,
  ];

  for (const roleId of [settings.support_role_id, settings.mod_role_id]) {
    if (!roleId) continue;
    const role = guild.roles.cache.get(String(roleId));
    if (!role || !canOverwriteRole(guild, role)) continue;
    set(role.id, { allow: staffAllow });
  }

  return [...byId.values()];
}

async function createTicketChannel(guild, { name, parent, openerId, settings, topic, reason }) {
  const options = {
    name,
    type: ChannelType.GuildText,
    parent: parent.id,
    topic,
    reason,
  };

  const overwrites = ticketOverwrites(guild, openerId, settings);
  try {
    return await guild.channels.create({ ...options, permissionOverwrites: overwrites });
  } catch (err) {
    console.error('Ticket create with overwrites failed:', err.code, err.message);
  }

  const minimal = overwrites.filter(
    (o) => o.id === guild.id || o.id === String(openerId) || o.id === guild.client.user.id
  );
  try {
    return await guild.channels.create({ ...options, permissionOverwrites: minimal });
  } catch (err) {
    console.error('Ticket create with minimal overwrites failed:', err.code, err.message);
  }

  const channel = await guild.channels.create(options);
  await channel.permissionOverwrites
    .edit(openerId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    })
    .catch(() => null);
  return channel;
}

async function collectChannelTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  return formatTranscriptLines(messages);
}

function transcriptAttachment(ticket, transcript) {
  const header =
    `Ticket #${ticket.ticket_number}` +
    `${ticket.subject ? ` · ${ticket.subject}` : ''}\n` +
    `────────────────────────────────\n`;
  return new AttachmentBuilder(Buffer.from(header + (transcript || '—'), 'utf8'), {
    name: `ticket-${ticket.ticket_number}.txt`,
  });
}

async function replyTicket(interaction, payload) {
  const data = { ephemeral: true, ...payload };
  try {
    if (interaction.deferred || interaction.replied) return await interaction.editReply(data);
    return await interaction.reply(data);
  } catch {
    return interaction.followUp(data).catch(() => null);
  }
}

async function openTicket(interaction, typeName = null, extras = {}) {
  const loc = getGuildLocale(interaction.guildId);
  const settings = getGuildSettings(interaction.guild.id);
  if (!settings.ticket_category_id) {
    return replyTicket(interaction, { content: t(loc, 'ticket.notConfigured') });
  }

  const block = getTicketOpenBlockReason(interaction);
  if (block) {
    return replyTicket(interaction, { content: block });
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  const parent = await interaction.guild.channels.fetch(settings.ticket_category_id).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildCategory) {
    return replyTicket(interaction, { content: t(loc, 'ticket.badCategory') });
  }

  await interaction.guild.roles.fetch().catch(() => null);
  await interaction.guild.members.fetchMe().catch(() => null);

  const me = interaction.guild.members.me || (await interaction.guild.members.fetchMe().catch(() => null));
  const botPerms = parent.permissionsFor(me);
  if (!me || !botPerms?.has(PermissionFlagsBits.ManageChannels)) {
    return replyTicket(interaction, { content: t(loc, 'ticket.needManageChannels') });
  }

  const subject = String(typeName || 'General').slice(0, 80);
  const number = nextTicketNumber(interaction.guild.id);
  const safeName =
    subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'ticket';

  let channel;
  try {
    channel = await createTicketChannel(interaction.guild, {
      name: `${safeName}-${number}`.slice(0, 100),
      parent,
      openerId: interaction.user.id,
      settings,
      topic: `Ticket #${number} · ${subject} · ${interaction.user.username}`.slice(0, 1024),
      reason: `Ticket #${number} opened by ${interaction.user.username}`,
    });
  } catch (err) {
    console.error('Ticket channel create failed:', err.code, err.message, err);
    return replyTicket(interaction, {
      content: formatDiscordFix(err, loc),
    });
  }

  try {
    db.prepare(
      `INSERT INTO tickets (guild_id, channel_id, opener_id, status, subject, ticket_number)
       VALUES (?, ?, ?, 'open', ?, ?)`
    ).run(interaction.guild.id, channel.id, interaction.user.id, subject, number);
  } catch (err) {
    console.error('Ticket DB insert failed:', err);
  }

  const answers = extras.answers || {};
  const formFields = [];
  if (Array.isArray(answers.fields) && answers.fields.length) {
    for (const field of answers.fields) {
      if (!field?.value) continue;
      formFields.push({
        name: String(field.label || 'Answer').slice(0, 256),
        value: String(field.value).slice(0, 1024),
      });
    }
  } else {
    if (answers.username) {
      formFields.push({ name: t(loc, 'ticket.fieldUsername'), value: String(answers.username).slice(0, 1024) });
    }
    if (answers.question) {
      formFields.push({ name: t(loc, 'ticket.fieldQuestion'), value: String(answers.question).slice(0, 1024) });
    }
    if (answers.extra) {
      formFields.push({ name: t(loc, 'ticket.fieldExtra'), value: String(answers.extra).slice(0, 1024) });
    }
  }

  const welcomeText = String(settings.welcome_message || 'Thanks for opening a ticket.')
    .slice(0, 1800);
  const welcome = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Ticket #${number} · ${subject}`.slice(0, 256))
    .setDescription(
      `${welcomeText}\n\n**Category:** ${subject}\n**Opened by:** ${interaction.user}`.slice(0, 4096)
    )
    .setFooter({ text: 'Staff: use Claim / Close below' })
    .setTimestamp();
  if (formFields.length) welcome.addFields(formFields.slice(0, 10));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✋'),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒')
  );

  const mentions = [interaction.user.toString()];
  if (settings.support_role_id && interaction.guild.roles.cache.has(String(settings.support_role_id))) {
    mentions.push(`<@&${settings.support_role_id}>`);
  }

  try {
    await channel.send({ content: mentions.join(' '), embeds: [welcome], components: [row] });
  } catch (err) {
    console.error('Ticket welcome message failed:', err);
    await channel.send({ content: `${mentions.join(' ')}\nTicket #${number} · ${subject}` }).catch(() => null);
  }

  if (settings.ticket_log_channel_id) {
    const logCh = await interaction.guild.channels.fetch(settings.ticket_log_channel_id).catch(() => null);
    if (logCh?.isTextBased?.()) {
      await logCh.send({
        embeds: [
          baseEmbed(0x57f287)
            .setTitle(`Ticket #${number} opened`)
            .addFields(
              { name: 'By', value: `${interaction.user}`, inline: true },
              { name: 'Category', value: subject, inline: true },
              { name: 'Channel', value: `${channel}`, inline: true }
            ),
        ],
      }).catch(() => null);
    }
  }

  try {
    const muted = isTicketDmMuted(interaction.guild.id, interaction.user.id);
    if (!muted) {
      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`🎫 Ticket #${number} created`)
            .setDescription(
              `Your ticket is open in **${interaction.guild.name}**.\n\n` +
                `**Category:** ${subject}\n` +
                `**Channel:** ${channel}\n\n` +
                `You will get a DM when this ticket is closed.`
            )
            .setTimestamp(),
        ],
      });
    }
  } catch {
    // DMs closed
  }

  return replyTicket(interaction, {
    content: t(loc, 'ticket.created', { channel: channel.toString() }),
  });
}

function sqliteToUnix(value) {
  if (!value) return Math.floor(Date.now() / 1000);
  const raw = String(value).trim();
  const ms = Date.parse(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
  return Math.floor((Number.isFinite(ms) ? ms : Date.now()) / 1000);
}

function displayReason(reason, loc) {
  const raw = String(reason || '').trim();
  const generic = new Set([
    '',
    'gesloten',
    'gesloten via knop',
    'gesloten via dashboard',
    'closed',
    'closed via button',
    'confirmed close request',
    'geen reden',
    'geen reden opgegeven',
    'no reason given',
    'no reason specified',
  ]);
  if (generic.has(raw.toLowerCase())) return t(loc, 'ticket.noReason');
  return raw.slice(0, 1024);
}

function buildTicketClosedDmEmbed(ticket, guild, closerId, reason, loc) {
  const openedUnix = sqliteToUnix(ticket.created_at);
  const claimed = ticket.claimed_by ? `<@${ticket.claimed_by}>` : t(loc, 'ticket.notClaimed');
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(t(loc, 'ticket.closedTitle'))
    .addFields(
      { name: '🆔 ' + t(loc, 'ticket.fieldTicketId'), value: String(ticket.ticket_number || ticket.id), inline: true },
      { name: '👤 ' + t(loc, 'ticket.fieldOpenedBy'), value: `<@${ticket.opener_id}>`, inline: true },
      { name: '🔒 ' + t(loc, 'ticket.fieldClosedBy'), value: `<@${closerId}>`, inline: true },
      { name: '🕐 ' + t(loc, 'ticket.fieldOpenTime'), value: `<t:${openedUnix}:F>`, inline: true },
      { name: '✋ ' + t(loc, 'ticket.fieldClaimedBy'), value: claimed, inline: true },
      { name: '📝 ' + t(loc, 'ticket.fieldReason'), value: displayReason(reason, loc), inline: false }
    )
    .setFooter({ text: `${guild.name} · type clear to wipe this DM` })
    .setTimestamp();
}

async function closeTicketChannel(channel, ticket, closerId, reason = 'Gesloten') {
  const settings = getGuildSettings(ticket.guild_id);
  const guild = channel.guild;
  const transcript = await collectChannelTranscript(channel);

  db.prepare(
    `UPDATE tickets SET status = 'closed', closed_by = ?, closed_at = datetime('now') WHERE id = ?`
  ).run(closerId, ticket.id);

  saveTicketTranscript({
    ticketId: ticket.id,
    guildId: ticket.guild_id,
    ticketNumber: ticket.ticket_number,
    subject: ticket.subject,
    openerId: ticket.opener_id,
    closerId,
    reason,
    transcript,
  });

  const muted = isTicketDmMuted(ticket.guild_id, ticket.opener_id);
  if (!muted) {
    try {
      const opener = await guild.client.users.fetch(ticket.opener_id);
      const loc = getGuildLocale(ticket.guild_id);
      const dmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_dm_mute:${ticket.guild_id}`)
          .setLabel(t(loc, 'ticket.btnMute').slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔇'),
        new ButtonBuilder()
          .setCustomId(`ticket_dm_unmute:${ticket.guild_id}`)
          .setLabel(t(loc, 'ticket.btnUnmute').slice(0, 80))
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔔'),
        new ButtonBuilder()
          .setCustomId(`ticket_dm_view:${ticket.id}`)
          .setLabel(t(loc, 'ticket.btnCheck').slice(0, 80))
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📜')
      );

      await opener.send({
        embeds: [buildTicketClosedDmEmbed(ticket, guild, closerId, reason, loc)],
        components: [dmRow],
      });
    } catch {
      // DMs closed
    }
  }

  if (settings.ticket_log_channel_id) {
    const logCh = await guild.channels.fetch(settings.ticket_log_channel_id).catch(() => null);
    if (logCh) {
      await logCh.send({
        embeds: [
          baseEmbed(0xed4245)
            .setTitle(`Ticket #${ticket.ticket_number} gesloten`)
            .addFields(
              { name: 'Opener', value: `<@${ticket.opener_id}>`, inline: true },
              { name: 'Gesloten door', value: `<@${closerId}>`, inline: true },
              { name: 'Categorie', value: ticket.subject || 'Algemeen', inline: true },
              { name: 'Reden', value: reason }
            ),
        ],
        files: [
          {
            attachment: Buffer.from(transcript || 'Geen berichten', 'utf8'),
            name: `ticket-${ticket.ticket_number}.txt`,
          },
        ],
      });
    }
  }

  setTimeout(() => {
    channel.delete(reason).catch(() => null);
  }, 5000);
}

async function claimTicket(channel, ticket, user) {
  db.prepare(`UPDATE tickets SET claimed_by = ? WHERE id = ?`).run(user.id, ticket.id);

  const safe = (user.username || user.tag || 'staff')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'staff';

  const newName = safe.slice(0, 100);
  await channel.setName(newName).catch(() => null);

  return newName;
}

async function moveTicketChannel(channel, ticket, category) {
  await channel.setParent(category.id, { lockPermissions: false });
  const topic = channel.topic ? `${channel.topic.split(' · moved')[0]} · moved` : `Ticket #${ticket.ticket_number}`;
  await channel.setTopic(topic.slice(0, 1024)).catch(() => null);
  return category;
}

async function createTicketNotesThread(channel, ticket, staffUser) {
  if (ticket.notes_thread_id) {
    const existing = await channel.threads.fetch(ticket.notes_thread_id).catch(() => null);
    if (existing) return existing;
  }

  const thread = await channel.threads.create({
    name: `notes-${ticket.ticket_number}`.slice(0, 100),
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `Staff notes for ticket #${ticket.ticket_number}`,
  });

  await thread.members.add(staffUser.id).catch(() => null);
  if (ticket.claimed_by && String(ticket.claimed_by) !== String(staffUser.id)) {
    await thread.members.add(ticket.claimed_by).catch(() => null);
  }

  updateTicketFields(ticket.id, { notes_thread_id: thread.id });

  await thread.send({
    embeds: [
      baseEmbed(0x0f766e)
        .setTitle(`Staff notes · ticket #${ticket.ticket_number}`)
        .setDescription(
          'Private thread for support. The ticket opener cannot see this.\nInvite extra staff with **Add members** on this thread.'
        ),
    ],
  });

  return thread;
}

async function setTicketPriority(channel, ticket, { name, role, user }) {
  const label = String(name || 'Normal').trim().slice(0, 50) || 'Normal';
  updateTicketFields(ticket.id, {
    priority: label,
    priority_role_id: role ? role.id : null,
    priority_user_id: user ? user.id : null,
  });

  const pings = [];
  if (role) pings.push(`${role}`);
  if (user) pings.push(`${user}`);

  await channel.send({
    content: pings.length ? pings.join(' ') : null,
    embeds: [
      baseEmbed(0xf59e0b)
        .setTitle(`Priority: ${label}`)
        .setDescription(
          (role ? `**Staff role:** ${role}\n` : '') +
            (user ? `**Assigned staff:** ${user}\n` : '') +
            'This team should handle the ticket.'
        )
        .setFooter({ text: `Ticket #${ticket.ticket_number}` }),
    ],
  });

  return label;
}

async function sendTicketTranscript(interaction, ticket, channel) {
  const live = channel ? await collectChannelTranscript(channel) : '';
  const stored = getTicketTranscript(ticket.id);
  const text = live && live !== 'Geen berichten' ? live : stored?.transcript || live;
  const file = transcriptAttachment(ticket, text);
  const payload = {
    content: `Transcript for ticket #${ticket.ticket_number}`,
    files: [file],
    ephemeral: true,
  };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

async function reopenTicket(interaction, ticket) {
  const guild = interaction.guild;
  const settings = getGuildSettings(guild.id);
  if (!settings.ticket_category_id) {
    return interaction.reply({
      content: 'Set a ticket category in the dashboard first.',
      ephemeral: true,
    });
  }

  const existing = await guild.channels.fetch(ticket.channel_id).catch(() => null);
  if (existing && ticket.status === 'open') {
    return interaction.reply({
      content: `Ticket #${ticket.ticket_number} is already open in ${existing}.`,
      ephemeral: true,
    });
  }

  if (existing) {
    updateTicketFields(ticket.id, { status: 'open', closed_by: null, closed_at: null });
    await existing.send({
      content: `${interaction.user} reopened this ticket.`,
    });
    return interaction.reply({ content: `Ticket #${ticket.ticket_number} reopened in ${existing}.` });
  }

  const subject = ticket.subject || 'ticket';
  const safeName =
    subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'ticket';

  const channel = await guild.channels.create({
    name: `${safeName}-${ticket.ticket_number}`,
    type: ChannelType.GuildText,
    parent: settings.ticket_category_id,
    permissionOverwrites: ticketOverwrites(guild, ticket.opener_id, settings),
    topic: `Ticket #${ticket.ticket_number} · ${subject} · reopened`,
  });

  updateTicketFields(ticket.id, {
    status: 'open',
    channel_id: channel.id,
    closed_by: null,
    closed_at: null,
    notes_thread_id: null,
  });

  const stored = getTicketTranscript(ticket.id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✋'),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Sluiten').setStyle(ButtonStyle.Danger).setEmoji('🔒')
  );

  await channel.send({
    content: `<@${ticket.opener_id}> ${settings.support_role_id ? `<@&${settings.support_role_id}>` : ''}`.trim(),
    embeds: [
      baseEmbed(0x57f287)
        .setTitle(`Ticket #${ticket.ticket_number} reopened`)
        .setDescription(`Reopened by ${interaction.user}. Previous closer: ${ticket.closed_by ? `<@${ticket.closed_by}>` : '—'}`),
    ],
    components: [row],
    files: stored?.transcript ? [transcriptAttachment(ticket, stored.transcript)] : [],
  });

  return interaction.reply({ content: `Ticket #${ticket.ticket_number} reopened: ${channel}` });
}

async function postCloseRequest(channel, ticket, requester, reason) {
  const settings = getGuildSettings(ticket.guild_id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_confirm_close')
      .setLabel('Confirm close')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket_keep_open')
      .setLabel('Keep open')
      .setStyle(ButtonStyle.Secondary)
  );

  const ping = settings.support_role_id ? `<@&${settings.support_role_id}>` : '';
  await channel.send({
    content: `${ping} <@${ticket.opener_id}>`.trim(),
    embeds: [
      baseEmbed(0xf59e0b)
        .setTitle('Close requested')
        .setDescription(
          `${requester} asked to close ticket #${ticket.ticket_number}.\n**Reason:** ${reason || 'None given'}\n\nStaff or the opener can confirm.`
        ),
    ],
    components: [row],
  });
}

async function handleTicketDmButton(interaction) {
  const id = interaction.customId;

  if (id.startsWith('ticket_dm_mute:')) {
    const guildId = id.slice('ticket_dm_mute:'.length);
    setTicketDmMuted(guildId, interaction.user.id, true);
    return interaction.reply({
      content: tg(guildId, 'ticket.dmMuted'),
    });
  }

  if (id.startsWith('ticket_dm_unmute:')) {
    const guildId = id.slice('ticket_dm_unmute:'.length);
    setTicketDmMuted(guildId, interaction.user.id, false);
    return interaction.reply({
      content: tg(guildId, 'ticket.dmUnmuted'),
    });
  }

  if (id.startsWith('ticket_dm_view:')) {
    const ticketId = id.slice('ticket_dm_view:'.length);
    const row = getTicketTranscript(ticketId);
    const loc = row?.guild_id ? getGuildLocale(row.guild_id) : 'en';
    if (!row) {
      return interaction.reply({
        content: t(loc, 'ticket.dmViewMissing'),
      });
    }
    if (String(row.opener_id) !== String(interaction.user.id)) {
      return interaction.reply({
        content: t(loc, 'ticket.dmViewDenied'),
      });
    }

    const header =
      `Ticket #${row.ticket_number || ticketId}` +
      `${row.subject ? ` · ${row.subject}` : ''}\n` +
      `────────────────────────────────\n`;
    const full = header + (row.transcript || '—');
    const file = new AttachmentBuilder(Buffer.from(full, 'utf8'), {
      name: `ticket-${row.ticket_number || ticketId}.txt`,
    });

    const preview = full.length > 1500 ? `${full.slice(0, 1500)}\n…` : full;
    return interaction.reply({
      content: t(loc, 'ticket.dmHistory', { preview }),
      files: [file],
    });
  }
}

async function handleTicketButton(interaction) {
  if (interaction.customId === 'ticket_open') {
    return showTicketFormModal(interaction, { id: 'general', name: 'Ticket' });
  }

  if (interaction.customId.startsWith('ticket_type_btn_')) {
    const typeId = interaction.customId.replace('ticket_type_btn_', '');
    const types = getTicketTypes(interaction.guild.id);
    const type = types.find((row) => String(row.id) === String(typeId));
    return showTicketFormModal(interaction, type || { id: typeId, name: 'Ticket' });
  }

  const settings = getGuildSettings(interaction.guild.id);
  const ticket = db
    .prepare(`SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'`)
    .get(interaction.channel.id);

  if (!ticket) {
    return interaction.reply({ content: 'Geen open ticket gevonden.', ephemeral: true });
  }

  const isSupport = hasSupportAccess(interaction.member, settings);

  if (interaction.customId === 'ticket_claim') {
    if (!isSupport) {
      return interaction.reply({ content: 'Alleen staff kan claimen.', ephemeral: true });
    }
    const newName = await claimTicket(interaction.channel, ticket, interaction.user);
    return interaction.reply({
      embeds: [
        baseEmbed(0x57f287)
          .setTitle('Ticket geclaimd')
          .setDescription(
            `${interaction.user} heeft dit ticket geclaimd.\nKanaal hernoemd naar \`#${newName}\`.`
          ),
      ],
    });
  }

  if (interaction.customId === 'ticket_close') {
    if (ticket.opener_id !== interaction.user.id && !isSupport) {
      return interaction.reply({ content: 'Geen toestemming.', ephemeral: true });
    }
    await interaction.update({
      content: `🔒 Ticket wordt gesloten door ${interaction.user}… (kanaal verdwijnt over 5 seconden)`,
      embeds: [],
      components: [],
    }).catch(() => interaction.reply({ content: '🔒 Ticket wordt gesloten over 5 seconden…' }).catch(() => null));
    await closeTicketChannel(interaction.channel, ticket, interaction.user.id, 'Gesloten via knop');
    return;
  }

  if (interaction.customId === 'ticket_confirm_close') {
    if (ticket.opener_id !== interaction.user.id && !isSupport) {
      return interaction.reply({ content: 'Geen toestemming.', ephemeral: true });
    }
    await interaction.update({
      content: `🔒 Sluiting bevestigd door ${interaction.user}. Kanaal verdwijnt over 5 seconden.`,
      embeds: [],
      components: [],
    }).catch(() => null);
    await closeTicketChannel(interaction.channel, ticket, interaction.user.id, 'Confirmed close request');
    return;
  }

  if (interaction.customId === 'ticket_keep_open') {
    if (ticket.opener_id !== interaction.user.id && !isSupport) {
      return interaction.reply({ content: 'Geen toestemming.', ephemeral: true });
    }
    return interaction.update({
      content: `Ticket stays open (${interaction.user}).`,
      embeds: [],
      components: [],
    });
  }
}

async function handleTicketSelect(interaction) {
  if (interaction.customId !== 'ticket_type_select') return;
  const typeId = interaction.values[0];
  const types = getTicketTypes(interaction.guild.id);
  const type = types.find((row) => String(row.id) === String(typeId));
  return showTicketFormModal(interaction, type || { id: typeId, name: 'Ticket' });
}

async function handleTicketModal(interaction) {
  try {
    if (!interaction.customId.startsWith('ticket_form:')) return;
    const typeKey = interaction.customId.slice('ticket_form:'.length);
    let typeName = 'General';
    let questions = [];
    if (typeKey !== 'general') {
      const types = getTicketTypes(interaction.guild.id);
      const type = types.find((row) => String(row.id) === String(typeKey));
      typeName = type?.name || 'General';
      questions = Array.isArray(type?.questions) ? type.questions : [];
    }

    const loc = getGuildLocale(interaction.guildId);
    if (!questions.length) {
      questions = [
        { label: t(loc, 'ticket.fieldUsername') },
        { label: t(loc, 'ticket.fieldQuestion') },
        { label: t(loc, 'ticket.fieldExtra') },
      ];
    }

    const fields = [];
    for (let i = 0; i < Math.min(5, questions.length); i += 1) {
      let value = '';
      try {
        value = interaction.fields.getTextInputValue(`ticket_q_${i}`)?.trim() || '';
      } catch {
        value = '';
      }
      if (!value) continue;
      fields.push({
        label: questions[i]?.label || `Question ${i + 1}`,
        value,
      });
    }

    return await openTicket(interaction, typeName, { answers: { fields } });
  } catch (err) {
    console.error('Ticket modal submit failed:', err);
    const loc = interaction.guildId ? getGuildLocale(interaction.guildId) : 'en';
    return replyTicket(interaction, { content: formatDiscordFix(err, loc) });
  }
}

module.exports = {
  openTicket,
  handleTicketButton,
  handleTicketSelect,
  handleTicketModal,
  handleTicketDmButton,
  closeTicketChannel,
  claimTicket,
  showTicketFormModal,
  moveTicketChannel,
  createTicketNotesThread,
  setTicketPriority,
  sendTicketTranscript,
  reopenTicket,
  postCloseRequest,
  collectChannelTranscript,
  transcriptAttachment,
};
