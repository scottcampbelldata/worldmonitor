# World Monitor — Split Deploy Runbook (Cloudflare Pages + VPS)

**Architecture:** frontend on **Cloudflare Pages**, backend (API + Redis + relay)
on your **VPS** via Docker. Deploy the **vanilla** app first; expansions come after.

```
  worldmap.scottcampbell.io   ──/api/* fetch redirect──▶   api.worldmap.scottcampbell.io
   Cloudflare Pages (static Vite build)                     VPS: Docker (Node API+Redis+relay)
   built with VITE_WS_API_URL=https://api.worldmap...        Caddy → TLS, CORS via EXTRA_CORS_ORIGINS
```

> Conventions: frontend host = `worldmap.scottcampbell.io`; API host =
> `api.worldmap.scottcampbell.io`; repo dir on VPS = `/opt/worldmonitor`.
> Your fork: https://github.com/scottcampbelldata/worldmonitor

---

## 0. DNS records to create (in Cloudflare DNS for scottcampbell.io)

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| `CNAME` | `worldmap` | (Cloudflare Pages target, given in step B) | Proxied |
| `A` | `api.worldmap` | your VPS public IP | DNS only (grey cloud) |

> Keep `api.worldmap` **DNS-only** (grey cloud) so Caddy on the VPS can obtain
> its own Let's Encrypt cert without Cloudflare's proxy interfering.

---

# PART A — Backend on the VPS

## A1. Install Docker + tools
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"        # log out/in afterwards
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
docker --version && docker compose version && node -v
```

## A2. Clone YOUR fork
```bash
sudo mkdir -p /opt && cd /opt
git clone https://github.com/scottcampbelldata/worldmonitor.git
sudo chown -R "$USER":"$USER" worldmonitor && cd worldmonitor
npm install                            # host needs this to run seeders
```

## A3. Secrets + keys in `.env`
```bash
cd /opt/worldmonitor
{
  echo "RELAY_SHARED_SECRET=$(openssl rand -hex 32)"
  echo "REDIS_PASSWORD=$(openssl rand -hex 32)"
  echo "REDIS_TOKEN=$(openssl rand -hex 32)"
  echo "NODE_ENV=production"
  echo "EXTRA_CORS_ORIGINS=https://worldmap.scottcampbell.io"
} >> .env
chmod 600 .env
nano .env    # then paste your API keys (GROQ, FINNHUB, etc.) — see .env.local for the list
```

`docker-compose.override.yml` (in the repo) maps the extra keys into the container.
`EXTRA_CORS_ORIGINS` is read by the patched `api/_cors.js` / `server/cors.ts` to allow
the Cloudflare Pages origin.

> The override file must also pass NODE_ENV + EXTRA_CORS_ORIGINS into the container —
> confirm those lines are present (added during deploy prep).

## A4. Build & start
```bash
docker compose up -d --build           # first build ~5–10 min
docker compose ps                      # all "Up"
curl -s localhost:3000/api/health      # health payload
```

## A5. Seed data + cron
```bash
./scripts/run-seeders.sh
( crontab -l 2>/dev/null; echo "*/30 * * * * cd /opt/worldmonitor && ./scripts/run-seeders.sh >> /tmp/wm-seeders.log 2>&1" ) | crontab -
```

## A6. HTTPS for the API host (Caddy)
```bash
# install Caddy (see official docs), then set /etc/caddy/Caddyfile:
```
```
api.worldmap.scottcampbell.io {
    reverse_proxy localhost:3000
}
```
```bash
sudo systemctl reload caddy
curl -s https://api.worldmap.scottcampbell.io/api/health   # works once DNS + cert are live
```

## A7. Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```
Never expose port 3000 / Redis publicly. Never set `I_UNDERSTAND_THIS_DISABLES_AUTH=true`.

---

# PART B — Frontend on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick `scottcampbelldata/worldmonitor`.
2. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** set env `NODE_VERSION=22`
3. **Environment variables** (Production):
   - `VITE_WS_API_URL = https://api.worldmap.scottcampbell.io`
   - `NODE_VERSION = 22`
4. Deploy. Then **Custom domains** → add `worldmap.scottcampbell.io`
   (Cloudflare creates/points the CNAME for you).

When it builds, the SPA bakes in the API base URL, so every `/api/*` call from
`worldmap.scottcampbell.io` is redirected to your VPS API host.

---

# PART C — Verify end to end

1. Visit `https://worldmap.scottcampbell.io` — dashboard loads.
2. DevTools → Network → confirm `/api/*` calls go to `api.worldmap.scottcampbell.io`
   and return 200 (not CORS-blocked).
3. If CORS errors: confirm `EXTRA_CORS_ORIGINS` on the VPS exactly matches the
   frontend origin (scheme + host, no trailing slash), then `docker compose up -d`.

---

## Updates / redeploy
```bash
# Backend
cd /opt/worldmonitor && git pull && docker compose up -d --build && ./scripts/run-seeders.sh
# Frontend: Cloudflare Pages auto-rebuilds on every push to the repo.
```

## AGPL-3.0
Public site ⇒ source must be available. Deploying from your **public fork**
(`scottcampbelldata/worldmonitor`) satisfies this. Keep it public and pushed.
