const { db, getGuildSettings } = require('../database/db');

async function processExpiredPunishments(client) {
  const now = Date.now();
  const rows = db
    .prepare(`SELECT * FROM temp_punishments WHERE active = 1 AND expires_at <= ?`)
    .all(now);

  for (const row of rows) {
    try {
      const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
      if (!guild) {
        db.prepare(`UPDATE temp_punishments SET active = 0 WHERE id = ?`).run(row.id);
        continue;
      }

      if (row.type === 'tempban') {
        await guild.members.unban(row.user_id, 'Tempban verlopen').catch(() => null);
      }

      if (row.type === 'mute') {
        const settings = getGuildSettings(guild.id);
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member && settings.mute_role_id) {
          await member.roles.remove(settings.mute_role_id, 'Mute verlopen').catch(() => null);
        }
      }

      db.prepare(`UPDATE temp_punishments SET active = 0 WHERE id = ?`).run(row.id);
      console.log(`Temp punishment verlopen: ${row.type} ${row.user_id} @ ${row.guild_id}`);
    } catch (err) {
      console.error('Temp punishment error:', err);
    }
  }
}

function startPunishmentChecker(client) {
  processExpiredPunishments(client);
  setInterval(() => processExpiredPunishments(client), 30_000);
}

module.exports = { startPunishmentChecker };
