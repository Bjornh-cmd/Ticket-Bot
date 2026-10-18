const crypto = require('crypto');

const DEFAULTS = {
  400: {
    code: 'bad_request',
    title: 'Bad request',
    message: 'That request could not be processed. Check the form and try again.',
  },
  403: {
    code: 'forbidden',
    title: 'Access denied',
    message: 'You do not have permission to view or change this.',
  },
  404: {
    code: 'not_found',
    title: 'Page not found',
    message: 'This page does not exist or was moved.',
  },
  429: {
    code: 'rate_limited',
    title: 'Too many requests',
    message: 'Please wait a moment and try again.',
  },
  500: {
    code: 'server_error',
    title: 'Something went wrong',
    message: 'Reedhall hit an unexpected error. You can report it so we can fix it.',
  },
};

function signingSecret() {
  return String(process.env.SESSION_SECRET || process.env.ERROR_REPORT_SECRET || 'reedhall-dev').slice(0, 64);
}

function signPayload(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', signingSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyPayload(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', signingSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!data || typeof data !== 'object') return null;
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function buildErrorView(opts = {}) {
  const status = Number(opts.status) || 500;
  const fallback = DEFAULTS[status] || DEFAULTS[500];
  const code = opts.code || fallback.code;
  const title = opts.title || fallback.title;
  const message = opts.message || fallback.message;
  const path = opts.path || '/';
  const reportToken = signPayload({
    status,
    code,
    title,
    message,
    path: String(path).slice(0, 300),
    exp: Date.now() + 30 * 60 * 1000,
  });
  return {
    status,
    code,
    title,
    message,
    path,
    reportToken,
    reported: Boolean(opts.reported),
    reportOk: Boolean(opts.reportOk),
    reportError: opts.reportError || null,
  };
}

async function sendErrorWebhook({ context, note, user, reqMeta }) {
  const url = String(process.env.ERROR_REPORT_WEBHOOK || '').trim();
  if (!url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
    return { ok: false, reason: 'webhook_unset' };
  }

  const noteClean = String(note || '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, 1000);

  const embed = {
    title: 'Reedhall error report',
    color: 0xb91c1c,
    timestamp: new Date().toISOString(),
    fields: [
      { name: 'Status', value: String(context.status || '?'), inline: true },
      { name: 'Code', value: `\`${context.code || 'unknown'}\``, inline: true },
      { name: 'Path', value: `\`${String(context.path || '/').slice(0, 200)}\``, inline: false },
      { name: 'Title', value: String(context.title || 'Error').slice(0, 200), inline: false },
      {
        name: 'Message',
        value: String(context.message || '—').slice(0, 500),
        inline: false,
      },
    ],
  };

  if (noteClean) {
    embed.fields.push({ name: 'User note', value: noteClean, inline: false });
  }

  if (user?.id) {
    embed.fields.push({
      name: 'Reporter',
      value: `<@${user.id}> \`${user.username || user.id}\` (\`${user.id}\`)`,
      inline: false,
    });
  } else {
    embed.fields.push({ name: 'Reporter', value: 'Not signed in', inline: false });
  }

  if (reqMeta?.ip) {
    embed.fields.push({
      name: 'Client',
      value: `\`${String(reqMeta.ip).slice(0, 64)}\` · ${String(reqMeta.ua || 'unknown').slice(0, 120)}`,
      inline: false,
    });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: '🚨 New dashboard error report',
      embeds: [embed],
      allowed_mentions: { parse: [] },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, reason: `webhook_${res.status}`, detail: text.slice(0, 200) };
  }
  return { ok: true };
}

module.exports = {
  DEFAULTS,
  buildErrorView,
  verifyPayload,
  sendErrorWebhook,
};
