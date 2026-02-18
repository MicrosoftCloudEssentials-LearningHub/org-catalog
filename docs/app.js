const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');
const qEl = document.getElementById('q');
const footerMetaEl = document.getElementById('footerMeta');

const viewPublicEl = document.getElementById('viewPublic');
const viewPrivateEl = document.getElementById('viewPrivate');
const signInEl = document.getElementById('signIn');
const signOutEl = document.getElementById('signOut');
const authRowEl = document.getElementById('authRow');

const TOKEN_KEY = 'orgCatalogOAuthToken';
const CONFIG_URL = './config.json';

/** @typedef {{name:string, fullName:string, url:string, description:string, topics:string[], language:string|null, updatedAt:string, archived:boolean, private:boolean, stargazersCount?:number}} Repo */

/** @type {{generatedAt?:string, org?:string, repos?:Repo[]}} */
let publicCatalog = {};

/** @type {Repo[]} */
let publicRepos = [];

/** @type {Repo[]} */
let privateRepos = [];

/** @type {'public'|'private'} */
let activeView = 'public';

/** @type {{authBaseUrl?: string}} */
let config = {};

function setStatus(message) {
  statusEl.textContent = message;
}

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

function repoMatches(repo, q) {
  if (!q) return true;
  const haystack = [repo.name, repo.fullName, repo.description, ...(repo.topics ?? [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
}

function render(list) {
  gridEl.replaceChildren(
    ...list.map((repo) => {
      const card = document.createElement('a');
      card.className = 'card';
      card.href = repo.url;
      card.target = '_blank';
      card.rel = 'noreferrer';

      const title = document.createElement('h2');
      title.className = 'cardTitle';
      title.textContent = repo.name;

      const desc = document.createElement('p');
      desc.className = 'cardDesc';
      desc.textContent = repo.description || '—';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const language = repo.language ? `Language: ${repo.language}` : 'Language: —';
      const updated = repo.updatedAt ? `Updated: ${formatDate(repo.updatedAt)}` : 'Updated: —';
      const archived = repo.archived ? 'Archived' : '';
      meta.textContent = [language, updated, archived].filter(Boolean).join(' • ');

      card.append(title, desc, meta);

      if (repo.topics?.length) {
        const chips = document.createElement('div');
        chips.className = 'chips';
        for (const topic of repo.topics.slice(0, 6)) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = topic;
          chips.appendChild(chip);
        }
        card.appendChild(chips);
      }

      return card;
    })
  );
}

function setActiveView(view) {
  activeView = view;
  viewPublicEl.classList.toggle('active', view === 'public');
  viewPrivateEl.classList.toggle('active', view === 'private');
  qEl.value = '';
  update();
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function setSignedIn(signedIn) {
  signInEl.hidden = signedIn;
  signOutEl.hidden = !signedIn;
  viewPrivateEl.disabled = !signedIn || privateRepos.length === 0;
}


function openAuthPopup() {
  const authBaseUrl = String(config.authBaseUrl || '').trim();
  if (!authBaseUrl) {
    setStatus('Auth is not configured yet. Set docs/config.json authBaseUrl.');
    return;
  }

  const returnTo = new URL('./oauth-popup.html', window.location.href);

  const loginUrl = new URL('/login', authBaseUrl);
  loginUrl.searchParams.set('returnTo', returnTo.toString());

  const width = 520;
  const height = 680;
  const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

  authRowEl.hidden = false;
  const win = window.open(loginUrl.toString(), 'orgCatalogAuth', features);
  if (!win) {
    setStatus('Popup blocked. Allow popups and try again.');
    authRowEl.hidden = true;
  }
}

function update() {
  const q = qEl.value.trim().toLowerCase();
  const list = activeView === 'public' ? publicRepos : privateRepos;
  const filtered = list.filter((r) => repoMatches(r, q));

  const label = activeView === 'public' ? 'public' : 'private';
  setStatus(`${filtered.length} of ${list.length} ${label} repositories`);
  render(filtered);
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text || 'Request failed'}`);
  }
  return res.json();
}

async function loadPublicCatalog() {
  setStatus('Loading public catalog…');

  try {
    publicCatalog = await fetchJson('./catalog.json', undefined);
  } catch {
    setStatus('Could not load catalog.json. Run the GitHub Action to generate it.');
    return;
  }

  publicRepos = (publicCatalog.repos ?? []).filter((r) => !r.private);

  const org = publicCatalog.org ? `@${publicCatalog.org}` : '';
  const generatedAt = publicCatalog.generatedAt ? new Date(publicCatalog.generatedAt).toLocaleString() : '';
  footerMetaEl.textContent = [org, generatedAt ? `Generated: ${generatedAt}` : ''].filter(Boolean).join(' • ');

  setActiveView('public');
}

async function loadConfig() {
  try {
    config = await fetchJson(CONFIG_URL, undefined);
  } catch {
    config = {};
  }
}

async function fetchPrivateRepos({ org, headers }) {
  const repos = [];
  let url = `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?per_page=100&type=private&sort=pushed`;

  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error (repos): HTTP ${res.status}. ${text}`);
    }

    const page = await res.json();
    for (const r of page) {
      repos.push({
        name: r.name,
        fullName: r.full_name,
        url: r.html_url,
        description: r.description ?? '',
        topics: Array.isArray(r.topics) ? r.topics : [],
        language: r.language,
        updatedAt: r.pushed_at ?? r.updated_at,
        archived: Boolean(r.archived),
        private: Boolean(r.private),
        stargazersCount: typeof r.stargazers_count === 'number' ? r.stargazers_count : undefined,
      });
    }

    const link = res.headers.get('link');
    const next = link?.match(/<([^>]+)>;\s*rel="next"/i)?.[1] ?? null;
    url = next;
  }

  return repos;
}

async function signInWithToken(token) {
  const org = publicCatalog.org;
  if (!org) {
    setStatus('Public catalog missing org name. Regenerate catalog.json.');
    return;
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  setStatus('Checking access…');

  // 1) Validate token is usable
  try {
    await fetchJson('https://api.github.com/user', headers);
  } catch {
    setStatus('Token not accepted by GitHub. Create a fine-grained token and try again.');
    return;
  }

  // 2) Load private repos; this doubles as the authorization gate.
  setStatus(`Loading private repositories for @${org}…`);
  try {
    privateRepos = await fetchPrivateRepos({ org, headers });
  } catch (err) {
    setStatus(`Signed in, but not authorized for @${org} private repos.`);
    privateRepos = [];
    setSignedIn(true);
    setActiveView('public');
    return;
  }

  setSignedIn(true);
  viewPrivateEl.disabled = privateRepos.length === 0;
  setActiveView('private');
}

// Events
qEl.addEventListener('input', update);

viewPublicEl.addEventListener('click', () => setActiveView('public'));
viewPrivateEl.addEventListener('click', () => {
  if (!viewPrivateEl.disabled) {
    setActiveView('private');
    return;
  }

  openAuthPopup();
});

signInEl.addEventListener('click', () => {
  openAuthPopup();
});

signOutEl.addEventListener('click', () => {
  clearToken();
  privateRepos = [];
  setSignedIn(false);
  setActiveView('public');
  setStatus(`${publicRepos.length} public repositories`);
});

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.type !== 'org-catalog-oauth') return;

  authRowEl.hidden = true;

  if (data.error) {
    setStatus('Sign-in failed or you are not authorized.');
    return;
  }

  if (typeof data.accessToken === 'string' && data.accessToken) {
    setToken(data.accessToken);
    await signInWithToken(data.accessToken);
    return;
  }

  setStatus('Sign-in did not return an access token.');
});

// Boot
setSignedIn(false);
await loadConfig();
await loadPublicCatalog();

const existingToken = getToken();
if (existingToken) {
  await signInWithToken(existingToken);
}
