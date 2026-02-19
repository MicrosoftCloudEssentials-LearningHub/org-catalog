# Org Catalog (GitHub Pages)

`org-catalog auth worker (Cloudflare)`

Costa Rica

[![GitHub](https://img.shields.io/badge/--181717?logo=github&logoColor=ffffff)](https://github.com/)
[brown9804](https://github.com/brown9804)

Last updated: 2026-02-19

----------

> Tiny OAuth handler for GitHub Pages.

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
3) Configure secrets. From `worker/`:
      - `wrangler secret put GITHUB_CLIENT_ID`
      - `wrangler secret put GITHUB_CLIENT_SECRET`
      - `wrangler secret put STATE_SECRET`
      - Recommended: Update `ALLOWED_RETURN_ORIGINS` in `wrangler.toml` to include your Pages origin.

## Translation (optional)

If you want repo descriptions/topics to display in the selected UI language, configure Azure AI Translator and set these secrets:

- `wrangler secret put TRANSLATOR_KEY`
- Optional (often required for multi-service resources): `wrangler secret put TRANSLATOR_REGION`
- Optional: `wrangler secret put TRANSLATOR_ENDPOINT` (defaults to `https://api.cognitive.microsofttranslator.com`)

Then set either `translateBaseUrl` (or `authBaseUrl`) in `docs/config.json` to the worker base URL.

## Endpoints

- `GET /login?returnTo=<url>` redirects to GitHub authorize.
- `GET /callback` handles OAuth exchange and redirects back to `returnTo` with `#access_token=...`.
- `POST /translate` translates an array of strings: `{ "to": "es", "texts": ["hello", "world"] }`.

<!-- START BADGE -->
<div align="center">
  <img src="https://img.shields.io/badge/Total%20views-1346-limegreen" alt="Total views">
  <p>Refresh Date: 2026-02-19</p>
</div>
<!-- END BADGE -->
