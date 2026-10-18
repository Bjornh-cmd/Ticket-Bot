const { Events } = require('discord.js');
const { getGuildSettings } = require('../database/db');
const { isGuildAllowed, baseEmbed } = require('../utils/helpers');

function fillTemplate(template, member) {
  return (template || '')
    .replaceAll('{user}', `${member}`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{membercount}', String(member.guild.memberCount));
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (!isGuildAllowed(member.guild.id)) return;
    const settings = getGuildSettings(member.guild.id);

    if (settings.auto_role_id) {
      const role = member.guild.roles.cache.get(settings.auto_role_id);
      if (role && role.editable) {
        await member.roles.add(role, 'Reedhall auto-rol').catch(() => null);
      }
    }

    if (!settings.join_channel_id || !settings.join_message) return;

    const channel = await member.guild.channels.fetch(settings.join_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    const color = Number.parseInt(String(settings.embed_color || '0f766e').replace('#', ''), 16);
    await channel
      .send({
        embeds: [
          baseEmbed(Number.isFinite(color) ? color : 0x0f766e)
            .setTitle('Welkom')
            .setDescription(fillTemplate(settings.join_message, member))
            .setThumbnail(member.user.displayAvatarURL({ size: 128 })),
        ],
      })
      .catch(() => null);
  },
};
