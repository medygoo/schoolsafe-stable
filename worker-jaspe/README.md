# SchoolSafe JASPE 2.5D — Worker Cloudflare

Pont entre le VPS SchoolSafe et Cloudflare AI.

## Architecture

```
VPS SchoolSafe                     Cloudflare
┌──────────────┐     POST /chat    ┌──────────────────────┐
│  JASPE       │ ────────────────▶ │  schoolsafe-jaspe    │
│  Service     │                   │  (Cloudflare Worker) │
│              │ ◀──────────────── │                      │
│  JASPE_      │  { reply: "..." } │  AI Gateway ───▶ Workers AI
│  WORKER_URL  │                   │                      │
└──────────────┘                   └──────────────────────┘
```

## Déploiement

```bash
cd worker-jaspe

# Installer
npm install

# Développement local
npm run dev

# Déployer sur Cloudflare
npm run deploy
```

## Configuration

| Variable | Description | Défaut |
|---|---|---|
| `JASPE_MODEL` | Modèle Workers AI | `@cf/meta/llama-3.3-70b-instruct` |
| `JASPE_SYSTEM_PROMPT` | Prompt système JASPE | "Tu es JASPE, l'assistante..." |

**Bindings (wrangler.toml) :**
- `AI` — Workers AI binding
- `AI_GATEWAY` — optionnel, pour AI Gateway

## API

### `POST /`

```json
{
  "message": "Bonjour JASPE !",
  "session_key": "u:uuid:uuid"
}
```

Réponse (200) :
```json
{
  "reply": "Bonjour ! Comment puis-je t'aider ?"
}
```

## Côté VPS

Dans `.env` du serveur SchoolSafe :
```env
JASPE_WORKER_URL=https://schoolsafe-jaspe.nom-utilisateur.workers.dev
JASPE_CHAT_TIMEOUT_MS=12000
JASPE_RATE_PER_MINUTE=20
```