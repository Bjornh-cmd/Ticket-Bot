const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getGuildSettings, getTicketByChannel, getTicketByNumber, getLinkedGuild, getUserAccount } = require('../database/db');
const { baseEmbed, hasSupportAccess } = require('../utils/helpers');
const { resolvePlan, hasFeature, TICKET_ADVANCED_SUBS } = require('../utils/plans');
const { buildTicketPanelPayload } = require('../tickets/panel');
const {
  closeTicketChannel,
  claimTicket,
  moveTicketChannel,
  createTicketNotesThread,
  setTicketPriority,
  sendTicketTranscript,
  reopenTicket,
  postCloseRequest,
} = require('../tickets/handlers');

function requireOpenTicket(interaction) {
  const ticket = getTicketByChannel(interaction.channel.id, 'open');
  if (!ticket) {
    return { ticket: null, error: 'This is not an open ticket channel.' };
  }
  return { ticket, error: null };
}

function staffOrOpener(interaction, ticket, settings) {
  return ticket.opener_id === interaction.user.id || hasSupportAccess(interaction.member, settings);
}

function guildPlan(guildId, client) {
  const guild = client?.guilds?.cache?.get(guildId);
  if (guild?.ownerId) return resolvePlan(getUserAccount(guild.ownerId));
  const linked = getLinkedGuild(guildId);
  if (!linked?.linked_by) return resolvePlan(null);
  return resolvePlan(getUserAccount(linked.linked_by));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system')
    .addSubcommand((sc) =>
      sc
        .setName('panel')
        .setDescription('Post a ticket panel in this channel (or use the dashboard)')
        .addStringOption((o) => o.setName('title').setDescription('Title').setRequired(false))
        .addStringOption((o) => o.setName('description').setDescription('Text').setRequired(false))
    )
    .addSubcommand((sc) =>
      sc
        .setName('close')
        .setDescription('Close this ticket')
        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand((sc) => sc.setName('claim').setDescription('Claim this ticket'))
    .addSubcommand((sc) =>
      sc
        .setName('add')
        .setDescription('Add a member to this ticket')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('remove')
        .setDescription('Remove a member from this ticket')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('rename')
        .setDescription('Rename this ticket channel')
        .addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('move')
        .setDescription('Move the current ticket to a different category')
        .addChannelOption((o) =>
          o
            .setName('category')
            .setDescription('Discord category to move this ticket into')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc.setName('notes').setDescription('Create a thread for private discussion between support members')
    )
    .addSubcommand((sc) =>
      sc
        .setName('priority')
        .setDescription('Set ticket priority and which staff should handle it')
        .addStringOption((o) =>
          o.setName('name').setDescription('Priority name, e.g. High, Low, VIP').setRequired(true)
        )
        .addRoleOption((o) =>
          o.setName('role').setDescription('Staff role that should handle this ticket').setRequired(false)
        )
        .addUserOption((o) =>
          o.setName('user').setDescription('Specific staff member').setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('requestclose')
        .setDescription('Ask to close this ticket (staff or opener can confirm)')
        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(false))
    )
    .addSubcommand((sc) =>
      sc.setName('transcript').setDescription('Download a transcript of this ticket')
    )
    .addSubcommand((sc) =>
      sc
        .setName('reopen')
        .setDescription('Reopen a closed ticket')
        .addIntegerOption((o) =>
          o.setName('number').setDescription('Ticket number (if the channel was deleted)').setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = getGuildSettings(interaction.guild.id);
    const plan = guildPlan(interaction.guild.id, interaction.client);

    if (TICKET_ADVANCED_SUBS.includes(sub) && !hasFeature(plan, 'ticketAdvanced')) {
      return interaction.reply({
        content: `Advanced ticket commands require **Estate**. Current plan: **${plan.name}**.`,
        ephemeral: true,
      });
    }

    if (sub === 'panel') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: 'Alleen admins. Tip: plaats panels via `/dashboard`.', ephemeral: true });
      }
      if (!settings.ticket_category_id) {
        return interaction.reply({
          content: 'Stel eerst een ticket-categorie in via `/dashboard`.',
          ephemeral: true,
        });
      }

      const payload = buildTicketPanelPayload(interaction.guild.id, {
        title: interaction.options.getString('title') || undefined,
        description: interaction.options.getString('description') || undefined,
      });
      payload.embeds[0].setFooter({ text: interaction.guild.name });

      await interaction.channel.send(payload);
      return interaction.reply({ content: 'Ticket panel geplaatst.', ephemeral: true });
    }

    if (sub === 'reopen') {
      if (!hasSupportAccess(interaction.member, settings)) {
        return interaction.reply({ content: 'Alleen staff kan tickets heropenen.', ephemeral: true });
      }
      const number = interaction.options.getInteger('number');
      let ticket = number
        ? getTicketByNumber(interaction.guild.id, number)
        : getTicketByChannel(interaction.channel.id);
      if (!ticket) {
        return interaction.reply({
          content: number
            ? `Ticket #${number} not found.`
            : 'Use this in a ticket channel, or pass `number`.',
          ephemeral: true,
        });
      }
      return reopenTicket(interaction, ticket);
    }

    const { ticket, error } = requireOpenTicket(interaction);
    if (!ticket) {
      return interaction.reply({ content: error, ephemeral: true });
    }

    if (sub === 'close') {
      const reason = interaction.options.getString('reason') || 'Geen reden';
      if (!staffOrOpener(interaction, ticket, settings)) {
        return interaction.reply({ content: 'Geen toestemming om te sluiten.', ephemeral: true });
      }
      await interaction.reply({ content: '🔒 Ticket wordt gesloten over 5 seconden…' });
      await closeTicketChannel(interaction.channel, ticket, interaction.user.id, reason);
      return;
    }

    if (sub === 'claim') {
      if (!hasSupportAccess(interaction.member, settings)) {
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

    if (sub === 'add') {
      if (!staffOrOpener(interaction, ticket, settings)) {
        return interaction.reply({ content: 'Geen toestemming.', ephemeral: true });
      }
      const user = interaction.options.getUser('user', true);
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      return interaction.reply({ content: `${user} toegevoegd aan dit ticket.` });
    }

    if (sub === 'remove') {
      if (!hasSupportAccess(interaction.member, settings)) {
        return interaction.reply({ content: 'Geen toestemming.', ephemeral: true });
      }
      const user = interaction.options.getUser('user', true);
      if (user.id === ticket.opener_id) {
        return interaction.reply({ content: 'Je kunt de opener niet verwijderen.', ephemeral: true });
      }
      await interaction.channel.permissionOverwrites.delete(user.id);
      return interaction.reply({ content: `${user} verwijderd uit dit ticket.` });
    }

    if (sub === 'rename') {
      if (!hasSupportAccess(interaction.member, settings)) {
        return interaction.reply({ content: 'Geen toestemming.', ephemeral: true });
      }
      const name = interaction.options.getString('name', true).toLowerCase().replace(/\s+/g, '-').slice(0, 90);
      await interaction.channel.setName(name);
      return interaction.reply({ content: `Kanaal hernoemd naar \`${name}\`.` });
    }

    if (sub === 'move') {
      if (!hasSupportAccess(interaction.member, settings)) {
        return interaction.reply({ content: 'Alleen staff kan tickets verplaatsen.', ephemeral: true });
      }
      const category = interaction.options.getChannel('category', true);
      await moveTicketChannel(interaction.channel, ticket, category);
      return interaction.reply({ content: `Ticket moved to **${category.name}**.` });
    }

    if (sub === 'notes') {
      if (!hasSupportAccess(interaction.member, settings)) {
        return interaction.reply({ content: 'Alleen staff kan notes-threads maken.', ephemeral: true });
      }
      try {
        const thread = await createTicketNotesThread(interaction.channel, ticket, interaction.user);
        return interaction.reply({
          content: `Private staff thread: ${thread}`,
          ephemeral: true,
        });
      } catch (err) {
        console.error('ticket notes:', err);
        return interaction.reply({
          content:
            '**Could not create a private staff thread.**\n\n**How to fix:**\n1. Channel permissions → allow Reedhall **Create Private Threads** and **Manage Threads**\n2. Try `/ticket notes` again',
          ephemeral: true,
        });
      }
    }

    if (sub === 'priority') {
      if (!hasSupportAccess(interaction.member, settings)) {
        return interaction.reply({ content: 'Alleen staff kan prioriteit zetten.', ephemeral: true });
      }
      const name = interaction.options.getString('name', true);
      const role = interaction.options.getRole('role');
      const user = interaction.options.getUser('user');
      if (!role && !user) {
        await setTicketPriority(interaction.channel, ticket, { name, role: null, user: null });
        return interaction.reply({
          content: `Priority set to **${name}**. Tip: also pick a **role** or **user** so the right staff is pinged.`,
        });
      }
      await setTicketPriority(interaction.channel, ticket, { name, role, user });
      return interaction.reply({ content: `Priority **${name}** saved and staff notified.` });
    }

    if (sub === 'requestclose') {
      if (!staffOrOpener(interaction, ticket, settings)) {
        return interaction.reply({ content: 'Geen toestemming.', ephemeral: true });
      }
      const reason = interaction.options.getString('reason') || 'No reason given';
      await postCloseRequest(interaction.channel, ticket, interaction.user, reason);
      return interaction.reply({ content: 'Close request posted. Staff or the opener can confirm.', ephemeral: true });
    }

    if (sub === 'transcript') {
      if (!staffOrOpener(interaction, ticket, settings)) {
        return interaction.reply({ content: 'Geen toestemming.', ephemeral: true });
      }
      return sendTicketTranscript(interaction, ticket, interaction.channel);
    }
  },
};
