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

## Environment facts (recon 2026-06-29)

- VPS: Ubuntu 26.04, user `scott`, 15 GB RAM, 125 GB free. Host alias `ssh vps` (key auth).
- **nginx already serves ports 80/443** for several `*-api.scottcampbell.io` sites,
  TLS via **certbot**. We ADD a server block — we do NOT install Caddy.
- Docker / Node not yet installed. **Passwordless sudo is OFF** → sudo steps are
  run by Scott; non-sudo steps can be run over `ssh vps`.

## 0. DNS records to create (in Cloudflare DNS for scottcampbell.io)

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| `CNAME` | `worldmap` | (Cloudflare Pages target, given in step B) | Proxied |
| `A` | `api.worldmap` | your VPS public IP | DNS only (grey cloud) |

> Keep `api.worldmap` **DNS-only** (grey cloud) so certbot on the VPS can obtain
> its Let's Encrypt cert via HTTP-01 without Cloudflare's proxy interfering.

---

# PART A — Backend on the VPS

## A1. Install Docker + Node  [SUDO — Scott runs]
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"        # then DISCONNECT + reconnect ssh so the group applies
sudo apt-get install -y nodejs npm     # Ubuntu 26.04 ships Node 22+; verify below
docker --version && docker compose version && node -v   # node must be >= 22
```

## A2. Clone YOUR fork  [no sudo — into Scott's home]
```bash
cd ~ && git clone https://github.com/scottcampbelldata/worldmonitor.git
cd ~/worldmonitor
npm install                            # host needs this to run seeders
```

## A3. Secrets + keys in `.env`  [no sudo]
```bash
cd ~/worldmonitor
{
  echo "RELAY_SHARED_SECRET=$(openssl rand -hex 32)"
  echo "REDIS_PASSWORD=$(openssl rand -hex 32)"
  echo "REDIS_TOKEN=$(openssl rand -hex 32)"
  echo "NODE_ENV=production"
  echo "EXTRA_CORS_ORIGINS=https://worldmap.scottcampbell.io"
  echo "WM_PORT=127.0.0.1:3000"   # bind container to localhost only; nginx fronts it
} >> .env
chmod 600 .env
nano .env    # then paste your API keys (GROQ, FINNHUB, etc.) — see .env.local for the list
```

`docker-compose.override.yml` (in the repo) maps the extra keys into the container.
`EXTRA_CORS_ORIGINS` is read by the patched `api/_cors.js` / `server/cors.ts` to allow
the Cloudflare Pages origin.

> The override file must also pass NODE_ENV + EXTRA_CORS_ORIGINS into the container —
> confirm those lines are present (added during deploy prep).

## A4. Build & start  [no sudo, once in docker group]
```bash
cd ~/worldmonitor
docker compose up -d --build           # first build ~5–10 min
docker compose ps                      # all "Up"
curl -s 127.0.0.1:3000/api/health      # health payload
```

## A5. Seed data + cron  [no sudo]
```bash
cd ~/worldmonitor && ./scripts/run-seeders.sh
( crontab -l 2>/dev/null; echo "*/30 * * * * cd ~/worldmonitor && ./scripts/run-seeders.sh >> /tmp/wm-seeders.log 2>&1" ) | crontab -
```

## A6. HTTPS for the API host — add an nginx server block (matches existing sites)  [SUDO — Scott runs]

Create `/etc/nginx/sites-available/api.worldmap.scottcampbell.io.conf`:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.worldmap.scottcampbell.io;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket/SSE support (relay streams, live feeds)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
```
Then enable + get the cert (certbot rewrites the block for 443 automatically):
```bash
sudo ln -s /etc/nginx/sites-available/api.worldmap.scottcampbell.io.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.worldmap.scottcampbell.io
curl -s https://api.worldmap.scottcampbell.io/api/health   # works once DNS + cert are live
```

## A7. Firewall
nginx already fronts 80/443 and the container is bound to `127.0.0.1:3000` (WM_PORT),
so nothing new to expose. If ufw is inactive and you want it on:
```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```
Never set `I_UNDERSTAND_THIS_DISABLES_AUTH=true` on this host.

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
