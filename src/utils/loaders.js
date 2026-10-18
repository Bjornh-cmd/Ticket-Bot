const fs = require('fs');
const path = require('path');

function loadCommands(commandsPath) {
  const commands = new Map();
  const resolved = path.resolve(commandsPath);
  if (!fs.existsSync(resolved)) return commands;

  const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const fullPath = path.join(resolved, file);
    const command = require(fullPath);
    if (command?.data?.name && typeof command.execute === 'function') {
      commands.set(command.data.name, command);
    }
  }
  return commands;
}

function loadEvents(client, eventsPath) {
  const resolved = path.resolve(eventsPath);
  if (!fs.existsSync(resolved)) return;
  const files = fs.readdirSync(resolved).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const event = require(path.join(resolved, file));
    if (!event?.name || typeof event.execute !== 'function') continue;
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
}

module.exports = { loadCommands, loadEvents };
