'use strict';

const { getCustomPrefixCommands } = require('../database/db');
const { hasFeature, maxCustomPrefixCommands } = require('./plans');

/** Normalize trigger input: "ip", "!IP" → "ip" */
function normalizeTrigger(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^!+/, '')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
}

function findMatchingCustomPrefixCommand(guildId, content, channelId, plan) {
  // #region agent log
  fetch('http://127.0.0.1:7350/ingest/07781833-3577-41e9-8a4f-196b6994c076',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1d128d'},body:JSON.stringify({sessionId:'1d128d',location:'customPrefixCommands.js:entry',message:'findMatching entry',data:{guildId,contentPreview:String(content||'').slice(0,80),channelId,planId:plan?.id,hasFeature:hasFeature(plan,'customPrefixCommands')},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (!hasFeature(plan, 'customPrefixCommands')) return null;

  const text = String(content || '').trim();
  if (!text.startsWith('!')) return null;

  const triggerPart = normalizeTrigger(text.slice(1).split(/\s+/)[0]);
  if (!triggerPart) return null;

  // Only respond when the whole message is exactly !trigger (optional whitespace)
  const wholeNormalized = normalizeTrigger(text.slice(1));
  if (wholeNormalized !== triggerPart) {
    // #region agent log
    fetch('http://127.0.0.1:7350/ingest/07781833-3577-41e9-8a4f-196b6994c076',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1d128d'},body:JSON.stringify({sessionId:'1d128d',location:'customPrefixCommands.js:triggerMismatch',message:'whole message did not match trigger',data:{text,triggerPart,wholeNormalized},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return null;
  }

  const max = maxCustomPrefixCommands(plan);
  const commands = getCustomPrefixCommands(guildId);
  const active = max === Infinity ? commands : commands.slice(0, max);
  // #region agent log
  fetch('http://127.0.0.1:7350/ingest/07781833-3577-41e9-8a4f-196b6994c076',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1d128d'},body:JSON.stringify({sessionId:'1d128d',location:'customPrefixCommands.js:commandsLoaded',message:'commands from DB',data:{triggerPart,max,totalCommands:commands.length,activeCount:active.length,triggers:active.map(c=>c.trigger),channelIds:active.map(c=>c.channel_id||null)},timestamp:Date.now(),hypothesisId:'C-D'})}).catch(()=>{});
  // #endregion

  for (const cmd of active) {
    if (cmd.trigger !== triggerPart) continue;
    if (cmd.channel_id && cmd.channel_id !== channelId) {
      // #region agent log
      fetch('http://127.0.0.1:7350/ingest/07781833-3577-41e9-8a4f-196b6994c076',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1d128d'},body:JSON.stringify({sessionId:'1d128d',location:'customPrefixCommands.js:channelBlock',message:'channel filter blocked',data:{trigger:cmd.trigger,cmdChannelId:cmd.channel_id,messageChannelId:channelId},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      continue;
    }
    // #region agent log
    fetch('http://127.0.0.1:7350/ingest/07781833-3577-41e9-8a4f-196b6994c076',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1d128d'},body:JSON.stringify({sessionId:'1d128d',location:'customPrefixCommands.js:matched',message:'command matched',data:{cmdId:cmd.id,trigger:cmd.trigger,responseLen:String(cmd.response||'').length},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return cmd;
  }
  // #region agent log
  fetch('http://127.0.0.1:7350/ingest/07781833-3577-41e9-8a4f-196b6994c076',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1d128d'},body:JSON.stringify({sessionId:'1d128d',location:'customPrefixCommands.js:noMatch',message:'no command matched',data:{triggerPart,activeTriggers:active.map(c=>c.trigger)},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  return null;
}

module.exports = {
  normalizeTrigger,
  findMatchingCustomPrefixCommand,
};
