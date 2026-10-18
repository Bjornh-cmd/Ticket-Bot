const { Events, MessageFlags } = require('discord.js');
const { isGuildAllowed, MOD_COMMANDS, hasModRole, hasBotFunction, isOwner, memberHasGuildOwnerPower } = require('../utils/helpers');
const {
  getGuildSettings,
  getLinkedGuild,
  getUserAccount,
  isPanelStaff,
  isGuildCommandDisabled,
  isUserCommandDisabled,
} = require('../database/db');
const { handleTicketButton, handleTicketSelect, handleTicketDmButton, handleTicketModal } = require('../tickets/handlers');
const { handlePollVote } = require('../utils/polls');
const { COMMAND_FEATURES, resolvePlan, hasFeature, planLabel } = require('../utils/plans');
const { COMMAND_TO_FUNCTION } = require('../utils/permissions');
const { tg, t, getGuildLocale } = require('../i18n');
const { formatDiscordFix } = require('../utils/discordErrors');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

function guildPlan(guildId, client) {
  const guild = client?.guilds?.cache?.get(guildId);
  if (guild?.ownerId) return resolvePlan(getUserAccount(guild.ownerId));
  const linked = getLinkedGuild(guildId);
  if (!linked?.linked_by) return resolvePlan(null);
  return resolvePlan(getUserAccount(linked.linked_by));
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (interaction.guildId && !isGuildAllowed(interaction.guildId)) {
      if (interaction.isRepliable()) {
        await interaction
          .reply({ content: 'Deze bot is niet geautoriseerd voor deze server.', ...EPHEMERAL })
          .catch(() => null);
      }
      return;
    }

    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          if (interaction.commandName === 'setup') {
            return interaction.reply({
              content: '`/setup` is verwijderd. Gebruik `/dashboard` om alles te configureren.',
              ...EPHEMERAL,
            });
          }
          return;
        }

        const settings = interaction.guild
          ? getGuildSettings(interaction.guild.id)
          : null;

        // Server-uit: voor iedereen (ook owner). Per-user: niet voor guild-owner.
        if (interaction.guild) {
          const loc = getGuildLocale(interaction.guildId);
          if (isGuildCommandDisabled(interaction.guildId, interaction.commandName)) {
            return interaction.reply({
              content: t(loc, 'cmd.disabledGuild', { command: interaction.commandName }),
              ...EPHEMERAL,
            });
          }
          const isGuildOwner = memberHasGuildOwnerPower(interaction.member, interaction.guild);
          if (
            !isGuildOwner &&
            isUserCommandDisabled(interaction.guildId, interaction.user.id, interaction.commandName)
          ) {
            return interaction.reply({
              content: t(loc, 'cmd.disabledUser', { command: interaction.commandName }),
              ...EPHEMERAL,
            });
          }
        }

        const fn = COMMAND_TO_FUNCTION[interaction.commandName];
        if (fn && interaction.guild) {
          const loc = getGuildLocale(interaction.guildId);
          if (interaction.commandName === 'dashboard') {
            const userId = String(interaction.user.id);
            const ok =
              memberHasGuildOwnerPower(interaction.member, interaction.guild) ||
              isPanelStaff(interaction.guildId, userId) ||
              hasBotFunction(interaction.member, 'panel.access', settings);
            if (!ok) {
              return interaction.reply({
                content: t(loc, 'cmd.panelAccess'),
                ...EPHEMERAL,
              });
            }
          } else if (!hasBotFunction(interaction.member, fn, settings)) {
            if (MOD_COMMANDS.has(interaction.commandName) || fn.startsWith('mod.')) {
              return interaction.reply({
                content: t(loc, 'cmd.noFunction'),
                ...EPHEMERAL,
              });
            }
          }
        } else if (MOD_COMMANDS.has(interaction.commandName)) {
          const loc = getGuildLocale(interaction.guildId);
          if (!hasModRole(interaction.member, settings)) {
            return interaction.reply({
              content: settings?.mod_role_id
                ? t(loc, 'cmd.modRoleMissing')
                : t(loc, 'cmd.modRoleUnset'),
              ...EPHEMERAL,
            });
          }
        }

        const featureKey = COMMAND_FEATURES[interaction.commandName];
        if (featureKey && interaction.guildId && !isOwner(interaction.user.id)) {
          const plan = guildPlan(interaction.guildId, client);
          if (!hasFeature(plan, featureKey)) {
            return interaction.reply({
              content: tg(interaction.guildId, 'cmd.planLocked', { plan: planLabel(plan) }),
              ...EPHEMERAL,
            });
          }
        }

        await command.execute(interaction, client);
        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('ticket_dm_')) {
          await handleTicketDmButton(interaction);
          return;
        }
        if (interaction.customId.startsWith('giveaway_')) {
          const { handleGiveawayButton } = require('../utils/giveaways');
          await handleGiveawayButton(interaction);
          return;
        }
        if (interaction.customId.startsWith('poll_vote_')) {
          await handlePollVote(interaction);
          return;
        }
        if (interaction.customId.startsWith('ticket_')) {
          await handleTicketButton(interaction);
          return;
        }
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
        await handleTicketSelect(interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_form:')) {
        await handleTicketModal(interaction);
      }
    } catch (error) {
      console.error('Interaction error:', error);
      const loc = interaction.guildId ? getGuildLocale(interaction.guildId) : 'en';
      const payload = { content: formatDiscordFix(error, loc), ...EPHEMERAL };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  },
};
