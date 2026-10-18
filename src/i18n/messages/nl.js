/** Nederlands */

module.exports = {
  common: {
    noReason: 'Geen reden opgegeven',
    somethingWrong: 'Er ging iets mis bij dit command.',
    noPermission: 'Je hebt geen toestemming om dit te doen.',
    fixPerms:
      '**Missing Permissions**\n\n**How to fix:**\n1. Discord → **Server Settings → Roles**\n2. Drag **Reedhall** **above** the support/mod roles\n3. Open the channel (or ticket category) → **Permissions**\n4. Allow Reedhall: **View Channel**, **Send Messages**, **Embed Links**\n5. For tickets also allow **Manage Channels** on the ticket category\n6. Try again',
    fixAccess:
      '**Reedhall cannot see that channel**\n\n**How to fix:**\n1. Open the channel → **Permissions**\n2. Allow Reedhall **View Channel**\n3. Try again',
    fixUnknownChannel:
      '**That channel no longer exists**\n\n**How to fix:**\n1. Open `/dashboard`\n2. Pick a channel that still exists\n3. Try again',
    fixCategoryFull:
      '**Ticket category is full** (max 50 channels)\n\n**How to fix:**\n1. Delete or move old ticket channels\n2. Or choose a new ticket category in `/dashboard`\n3. Try again',
    fixCannotDm:
      '**Could not send a DM**\n\n**How to fix:**\nAllow DMs from server members: **User Settings → Privacy → Allow direct messages from server members**.',
    fixInvalid:
      '**Discord rejected that request**\n\n**How to fix:**\n1. Ticket category must be a **category**, not a text channel\n2. Set it again in `/dashboard`\n3. Put Reedhall’s role above the support role\n4. Try again',
    fixGeneric:
      '**Something went wrong:** {reason}\n\n**How to fix:**\n1. Check Reedhall is still in the server\n2. Give it **View Channel**, **Send Messages**, **Embed Links**, **Manage Channels**\n3. Set the ticket category in `/dashboard`\n4. Try again',
  },
  cmd: {
    disabledGuild:
      '`/{command}` staat **uit** op deze server. Zet het weer aan via het dashboard → Commands.',
    disabledUser: '`/{command}` is voor jou uitgeschakeld op deze server.',
    planLocked: 'Dit command zit niet in **{plan}**. Upgrade via het dashboard → Plan.',
    modRoleMissing:
      'Alleen leden met de **Mod**-rol (of Administrator) kunnen dit command gebruiken.',
    modRoleUnset: 'Er is nog geen **Mod-rol** ingesteld. Open `/dashboard` en kies een Mod-rol.',
    noFunction:
      'Je rol heeft deze functie niet. Een platform-admin kan dit instellen via `/admin` → Rollen.',
    panelAccess:
      'Geen panel-toegang. Owner kan je uitnodigen onder Toegang, of een admin wijst **Dashboard panel** toe aan jouw rol.',
  },
  commands: {
    ping: { description: 'Check latency van de bot' },
    help: { description: 'Lijst van bot commands' },
    ban: { description: 'Ban een lid van de server' },
    kick: { description: 'Kick een lid van de server' },
    mute: { description: 'Mute een lid (timeout of mute-rol)' },
    unmute: { description: 'Haal mute/timeout van een lid af' },
    warn: { description: 'Geef een waarschuwing aan een lid' },
    warnings: { description: 'Bekijk waarschuwingen van een lid' },
    delwarn: { description: 'Verwijder een waarschuwing op ID' },
    timeout: { description: 'Timeout een lid (Discord timeout)' },
    tempban: { description: 'Tijdelijk ban een lid' },
    softban: { description: 'Ban + unban om berichten te wissen' },
    unban: { description: 'Haal een ban van een gebruiker af' },
    purge: { description: 'Verwijder berichten in dit kanaal' },
    lock: { description: 'Vergrendel dit kanaal (@everyone mag niet meer praten)' },
    unlock: { description: 'Ontgrendel dit kanaal' },
    slowmode: { description: 'Stel slowmode in voor dit kanaal' },
    nickname: { description: 'Wijzig de nickname van een lid' },
    addrole: { description: 'Geef een rol aan een lid' },
    removerole: { description: 'Verwijder een rol van een lid' },
    userinfo: { description: 'Info over een lid' },
    serverinfo: { description: 'Info over deze server' },
    roleinfo: { description: 'Info over een rol' },
    avatar: { description: 'Toon de avatar van een gebruiker' },
    botinfo: { description: 'Info over Reedhall' },
    membercount: { description: 'Aantal leden in deze server' },
    ticket: { description: 'Ticket systeem' },
    poll: { description: 'Maak snel een poll (mods)' },
    announce: { description: 'Stuur een aankondiging als embed (mods)' },
    suggest: { description: 'Stuur een suggestie naar het suggestie-kanaal' },
    report: { description: 'Rapporteer een lid aan de staff' },
    dashboard: { description: 'Open het Reedhall panel (owner of uitgenodigde panel-mod)' },
    mod: { description: 'Mod-snelmenu (alleen voor mods)' },
    giveaway: { description: 'Beheer giveaways' },
  },
  options: {
    user: { name: 'gebruiker', description: 'Lid' },
    reason: { name: 'reden', description: 'Reden' },
    duration: { name: 'duur', description: 'Bijv. 10m, 1h, 1d' },
    role: { name: 'rol', description: 'Rol' },
    channel: { name: 'kanaal', description: 'Kanaal' },
    title: { name: 'titel', description: 'Titel' },
    text: { name: 'tekst', description: 'Inhoud' },
    amount: { name: 'aantal', description: '1–100' },
    seconds: { name: 'seconden', description: 'Seconden' },
    name: { name: 'naam', description: 'Naam' },
    id: { name: 'id', description: 'ID' },
    delete_days: { name: 'verwijder_dagen', description: 'Verwijder berichten van de laatste X dagen (0–7)' },
    user_id: { name: 'gebruiker_id', description: 'Discord user ID' },
  },
  ticket: {
    closedTitle: 'Ticket Closed',
    closedBody:
      'Je ticket in **{server}** is gesloten.\n\n**Reden:** {reason}\n**Gesloten door:** {closer}',
    closedFooter: 'Ticket #{number}{subject} · typ clear in deze DM om Reedhall-berichten te wissen',
    fieldTicketId: 'Ticket ID',
    fieldOpenedBy: 'Opened By',
    fieldClosedBy: 'Closed By',
    fieldOpenTime: 'Open Time',
    fieldClaimedBy: 'Claimed By',
    fieldReason: 'Reason',
    noReason: 'No reason specified',
    notClaimed: 'Not claimed',
    dmMuted:
      '🔇 Ticket-meldingen voor die server zijn **gedempt**. Druk op **Undempen** om dit terug te zetten.',
    dmUnmuted: '🔔 Ticket-meldingen staan weer **aan** voor die server.',
    dmViewDenied: 'Alleen de opener van dit ticket kan het transcript bekijken.',
    dmViewMissing: 'Geen transcript gevonden voor dit ticket.',
    dmHistory: '📜 **Ticketgeschiedenis** (wie wat zei):\n```\n{preview}\n```',
    btnMute: 'Dempen',
    btnUnmute: 'Undempen',
    btnCheck: 'Check ticket',
    modalUsername: 'Wat is jouw gebruikersnaam?',
    modalQuestion: 'Wat is het probleem / je vraag?',
    modalExtra: 'Extra informatie? (optioneel)',
    modalExtraPlaceholder: 'Optioneel…',
    fieldUsername: 'Gebruikersnaam',
    fieldQuestion: 'Vraag / probleem',
    fieldExtra: 'Extra info',
    notConfigured:
      '**Tickets zijn nog niet ingesteld.**\n\n**How to fix:**\n1. Open `/dashboard`\n2. Ga naar **Tickets**\n3. Kies een Discord-**categorie** (geen tekstkanaal)\n4. Voeg minstens één ticket-type toe en sla op\n5. Probeer opnieuw',
    alreadyOpenOne: 'Je hebt al een open ticket: {channels}',
    alreadyOpenMany: 'Je hebt al **{count}/{max}** open tickets: {channels}',
    created: '🎫 Ticket aangemaakt: {channel}',
    badCategory:
      '**Ticket-categorie ontbreekt of is ongeldig.**\n\n**How to fix:**\n1. Open `/dashboard` → **Tickets**\n2. Kies een echte **categorie** (een map met kanalen), geen tekstkanaal\n3. Sla op en probeer opnieuw',
    needManageChannels:
      '**Reedhall kan geen kanalen maken in de ticket-categorie.**\n\n**How to fix:**\n1. Discord → **Server Settings → Roles** → sleep **Reedhall** boven de support-rol\n2. Rechtsklik de ticket-categorie → **Edit category → Permissions**\n3. Sta Reedhall toe: **Manage Channels**, **View Channel**, **Send Messages**\n4. Probeer opnieuw',
    createFailed:
      '**Kon het ticketkanaal niet aanmaken.**\n\n**How to fix:**\n1. Geef Reedhall **Manage Channels** op de ticket-categorie\n2. Sleep de Reedhall-rol boven de support-rol\n3. Check of de categorie niet vol zit (max 50 kanalen)\n4. Probeer opnieuw',
    createFailedDetail: 'Kon het ticketkanaal niet aanmaken: {reason}',
  },
  dm: {
    cleared:
      '🧹 **{count}** bericht(en) van Reedhall verwijderd.\nTyp opnieuw `clear` om later weer op te schonen.',
    clearedEmpty: '🧹 Geen berichten van Reedhall gevonden om te wissen.',
    clearFailed: 'Kon de berichten niet wissen. Probeer het later opnieuw.',
  },
  giveaway: {
    participate: '🎉 Doe mee ({count})',
    ends: 'Eindigt {when}',
    endedOn: 'Afgelopen op {when}',
    joinOk: 'Je doet mee! Er zijn nu **{count}** deelnemers.',
    alreadyIn: 'Je doet al mee aan deze giveaway.',
    needRole: 'Je hebt de rol <@&{role}> nodig om mee te doen.',
    ended: 'Deze giveaway is afgelopen.',
    justEnded: 'Deze giveaway is net afgelopen.',
    notOpen: 'Deze giveaway is niet meer open voor deelname.',
    winnerTitle: '🎉 Je hebt gewonnen!',
    winnerDefault:
      'Gefeliciteerd {user}! 🎉\n\nJe hebt **{title}** gewonnen op **{server}**.\n\n**Je prijs:** {prize}\n\nReageer hier of open een ticket om je prijs te claimen.',
    resultsDesc: 'De winnaar van deze giveaway staat hierboven getagd! Gefeliciteerd 🎉',
    resultsNone: 'Geen geldige deelnemers — geen winnaar getrokken.',
    prize: 'Prijs',
    participants: 'Deelnemers',
    clickToJoin: 'Klik op de knop hieronder om mee te doen.',
  },
  ping: {
    pinging: 'Pingen…',
    pong: 'Pong · roundtrip **{roundtrip}ms** · websocket **{ws}ms**',
  },
};
