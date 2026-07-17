# Komodo Cloud — Web App

AI-powered PR code review as a service. Users sign in with GitHub, paste a PR URL, pick a model, and get a review posted to their PR using their own OAuth token. Credits are deducted per review based on actual model cost.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | NextAuth secret (`openssl rand -base64 32`) |
| `AUTH_GITHUB_ID` | Yes | GitHub OAuth App client ID (scopes: `repo read:user`) |
| `AUTH_GITHUB_SECRET` | Yes | GitHub OAuth App client secret |
| `OPENROUTER_API_KEY` | Yes | Platform OpenRouter key — users are billed in credits, not their own keys |
| `DEV_TOPUP_ENABLED` | No | Set `true` to enable `/api/credits/dev-topup` (adds 500 free credits) |
| `POLAR_ACCESS_TOKEN` | No | Polar.sh API token for paid credit packs |
| `POLAR_WEBHOOK_SECRET` | No | Polar webhook secret (from Polar dashboard) |
| `POLAR_PRODUCT_500` | No | Polar product ID for the 500-credit pack |
| `POLAR_PRODUCT_2000` | No | Polar product ID for the 2,000-credit pack |
| `POLAR_PRODUCT_10000` | No | Polar product ID for the 10,000-credit pack |

Copy `.env.example` to `.env.local` and fill in the values.

## Development

```bash
# Install deps (from workspace root)
pnpm install

# Push DB schema
cd apps/web && pnpm db:push

# Run dev server
pnpm dev
```

## Railway deployment

### Services
1. **PostgreSQL** — add a Railway Postgres service; copy `DATABASE_URL` to the web service's env vars
2. **Web** — point Railway at this repo

### Build & start commands
```
Build:  pnpm install && pnpm --filter @komodo/web build
Start:  pnpm --filter @komodo/web start
```

### Required env vars on Railway
Set all variables from the table above. For GitHub OAuth, set the callback URL to:
```
https://<your-domain>/api/auth/callback/github
```

### Polar webhook
In the Polar dashboard, add a webhook pointing to:
```
https://<your-domain>/api/webhooks/polar
```
Enable the `order.paid` event.

## Credits model

- 1 credit = $0.01
- Reviews are charged at `max(1, ceil(costUsd × 1.5 × 100))` credits
- Minimum balance to start a review: 25 credits
- New users receive 100 free welcome credits
