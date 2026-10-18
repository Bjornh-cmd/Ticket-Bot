# Reedhall

Discord staff desk met tickets, moderatie, polls, berichten en een product-dashboard.

## Merk

**Reedhall** — staff desk voor Discord. Logo: `src/dashboard/public/logo.png`

## Zo werkt koppelen (geen IDs)

1. Start de bot + open http://localhost:3000
2. **Inloggen met Discord**
3. **Servers koppelen** → kies je server → **Koppelen**
4. Zo nodig **Bot uitnodigen**
5. Open de desk en configureer

Geen server-ID of user-ID invullen. Owners/admins zien hun servers automatisch.

## Start

```bash
npm install
npm start
```

Na het koppelen van een nieuwe server (of opnieuw):

```bash
npm run deploy
```

(Deploy gebeurt ook automatisch bij koppelen als de bot al in de server zit.)

## Coolify (VPS + Docker)

De bot en het dashboard draaien in één container. SQLite en uploads blijven bewaard in het volume `/app/data`.

1. In Coolify: **New Resource → Docker Compose** (of Dockerfile) en wijs dit repo aan.
2. Zet de **poort op 3000** en koppel je domein met HTTPS.
3. Persistent storage: volume **`/app/data`** (in Compose heet het volume `reedhall-data`).
4. Zet deze environment variables in Coolify (niet in de image):

```
NODE_ENV=production
PORT=3000
DISCORD_TOKEN=
CLIENT_ID=
CLIENT_SECRET=
SESSION_SECRET=
DASHBOARD_URL=https://jouw-domein
CAPTCHA_IS_SIGNING_SECRET=
CAPTCHA_IS_SECRET=
```

`SESSION_SECRET` en `CAPTCHA_IS_SIGNING_SECRET` moeten elk minstens 32 willekeurige tekens zijn (`openssl rand -hex 32`).

5. In de Discord Developer Portal:
   - Redirect: `https://jouw-domein/auth/callback`
   - Privileged intents aan: **Server Members** en **Message Content**

`DASHBOARD_URL` mag leeg blijven als Coolify `COOLIFY_URL` of `COOLIFY_FQDN` meegeeft. Zet hem wel, dan kloppen cookies en OAuth altijd. Healthcheck: `GET /health`.

## .env (minimaal)

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `CLIENT_SECRET`
- `DASHBOARD_URL=http://localhost:3000`
- OAuth redirect: `http://localhost:3000/auth/callback`
- Optioneel: `BOT_OWNER_IDS` (comma-separated Discord user IDs)
