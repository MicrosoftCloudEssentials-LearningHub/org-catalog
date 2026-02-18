# Org Catalog (GitHub Pages)

Costa Rica

[![GitHub](https://img.shields.io/badge/--181717?logo=github&logoColor=ffffff)](https://github.com/)
[brown9804](https://github.com/brown9804)

Last updated: 2026-02-17

----------

A lightweight repo catalog designed to be hosted with **GitHub Pages**.

- Public catalog is generated at build time (GitHub Action) into `docs/catalog.json`.
- Site is static HTML/CSS/JS served from the `docs/` folder.
- Private repos are shown after “Sign in with GitHub” via a tiny serverless OAuth handler.

## Quick start

### 1) Configure GitHub Pages

In your repo settings:

- **Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: `main` (or `master`) / folder: `docs`

### 2) Set your org name

This catalog is intended to index only:

- https://github.com/MicrosoftCloudEssentials-LearningHub

By default the generator targets `MicrosoftCloudEssentials-LearningHub`.

Optional (only if you want to override locally or in a fork): add a repository variable named `ORG_NAME`:

- **Settings → Secrets and variables → Actions → Variables → New repository variable**
- Name: `ORG_NAME`
- Value: a GitHub org (e.g. `MicrosoftCloudEssentials-LearningHub`)

### 3) Enable workflow write access

The workflow commits `docs/catalog.json` back to the repo.

- **Settings → Actions → General → Workflow permissions**
- Select **Read and write permissions**

### 4) Run the generator

- Go to **Actions → Build catalog → Run workflow**
- Or wait for the nightly schedule.

Then open:

- `/` for the catalog

## Private section (GitHub OAuth)

GitHub Pages is static hosting, so the OAuth callback must be handled by a tiny serverless endpoint.

This repo includes a minimal Cloudflare Worker under `worker/` that:

- Redirects the user to GitHub to sign in
- Exchanges the OAuth code for an access token
- Verifies the user is a member of `MicrosoftCloudEssentials-LearningHub`
- Redirects back to the catalog

### Configure auth

1) Deploy the worker in `worker/` (see `worker/README.md`)
2) Set `docs/config.json` → `authBaseUrl` to your worker URL (example: `https://org-catalog-auth.<account>.workers.dev`)

Security notes:

- The OAuth token is stored in `sessionStorage` and never committed to the repo.
- Anyone with the token can act with its permissions until it expires.

## Repo layout

- `docs/` — GitHub Pages site (static)
- `scripts/fetch-catalog.mjs` — generates `docs/catalog.json`
- `.github/workflows/build-catalog.yml` — scheduled + manual generator workflow

<!-- START BADGE -->
<div align="center">
  <img src="https://img.shields.io/badge/Total%20views-1930-limegreen" alt="Total views">
  <p>Refresh Date: 2026-02-18</p>
</div>
<!-- END BADGE -->