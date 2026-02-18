# Org Catalog (GitHub Pages)

Costa Rica

[![GitHub](https://img.shields.io/badge/--181717?logo=github&logoColor=ffffff)](https://github.com/)
[brown9804](https://github.com/brown9804)

Last updated: 2026-02-17

----------

# org-catalog auth worker (Cloudflare)

Tiny OAuth handler for GitHub Pages.

## Setup

1) Create a GitHub OAuth App

- GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
- Homepage URL: your catalog URL (e.g. `https://<org>.github.io/org-catalog/`)
- Authorization callback URL: `https://<your-worker>.workers.dev/callback`

2) Deploy the worker

- Install Wrangler: `npm i -g wrangler`
- Login: `wrangler login`
- From this `worker/` folder:
  - `wrangler deploy`

3) Configure secrets

From `worker/`:

- `wrangler secret put GITHUB_CLIENT_ID`
- `wrangler secret put GITHUB_CLIENT_SECRET`
- `wrangler secret put STATE_SECRET`

Recommended:

- Update `ALLOWED_RETURN_ORIGINS` in `wrangler.toml` to include your Pages origin.

## Endpoints

- `GET /login?returnTo=<url>` redirects to GitHub authorize.
- `GET /callback` handles OAuth exchange and redirects back to `returnTo` with `#access_token=...`.

<!-- START BADGE -->
<div align="center">
  <img src="https://img.shields.io/badge/Total%20views-1930-limegreen" alt="Total views">
  <p>Refresh Date: 2026-02-18</p>
</div>
<!-- END BADGE -->
