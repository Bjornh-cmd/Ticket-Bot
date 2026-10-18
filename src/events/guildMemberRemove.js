const { Events } = require('discord.js');
const { getGuildSettings } = require('../database/db');
const { isGuildAllowed, baseEmbed } = require('../utils/helpers');

function fillTemplate(template, member) {
  return (template || '')
    .replaceAll('{user}', `${member.user.tag}`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{membercount}', String(member.guild.memberCount));
}

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (!isGuildAllowed(member.guild.id)) return;
    const settings = getGuildSettings(member.guild.id);
    if (!settings.leave_channel_id || !settings.leave_message) return;

    const channel = await member.guild.channels.fetch(settings.leave_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    await channel.send({
      embeds: [
        baseEmbed(0xed4245)
          .setTitle('Tot ziens')
          .setDescription(fillTemplate(settings.leave_message, member)),
      ],
    }).catch(() => null);
  },
};
