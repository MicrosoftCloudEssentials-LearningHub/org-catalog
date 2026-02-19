const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');
const qEl = document.getElementById('q');
const footerMetaEl = document.getElementById('footerMeta');

const viewPublicEl = document.getElementById('viewPublic');
const viewPrivateEl = document.getElementById('viewPrivate');
const signInEl = document.getElementById('signIn');
const signOutEl = document.getElementById('signOut');
const authRowEl = document.getElementById('authRow');

const uiLangEl = document.getElementById('lang');

const languageFilterEl = document.getElementById('languageFilter');
const categoryFilterEl = document.getElementById('categoryFilter');
const updatedWithinEl = document.getElementById('updatedWithin');
const minStarsEl = document.getElementById('minStars');
const hasImageEl = document.getElementById('hasImage');
const includeArchivedEl = document.getElementById('includeArchived');

const TOKEN_KEY = 'orgCatalogOAuthToken';
const CONFIG_URL = './config.json';

const TRANSLATION_BATCH_SIZE = 50;
const translationCacheByLang = new Map();
const translationInFlightByLang = new Map();

const UI_META_LABELS = ['Language', 'Updated', 'Archived'];

async function ensureTranslationsForTexts({ lang, texts }) {
  const to = String(lang || '').toLowerCase();
  if (!to || to === 'en') return false;
  if (!Array.isArray(texts) || !texts.length) return false;

  const baseUrl = getTranslationBaseUrl();
  if (!baseUrl) return false;

  const cache = getLangTranslationCache(to);
  const needed = new Set();

  for (const s of texts) {
    const t = String(s || '').trim();
    if (t && !cache.has(t)) needed.add(t);
  }

  if (!needed.size) return false;
  if (translationInFlightByLang.get(to)) return false;

  translationInFlightByLang.set(to, true);
  try {
    const all = Array.from(needed);
    for (let i = 0; i < all.length; i += TRANSLATION_BATCH_SIZE) {
      const batch = all.slice(i, i + TRANSLATION_BATCH_SIZE);
      const translated = await requestTranslations({ baseUrl, to, texts: batch });
      for (let j = 0; j < batch.length; j++) {
        const src = batch[j];
        const dst = typeof translated[j] === 'string' && translated[j] ? translated[j] : src;
        cache.set(src, dst);
      }
    }
    return true;
  } finally {
    translationInFlightByLang.set(to, false);
  }
}

function restoreUiToSource() {
  document.documentElement.lang = activeUiLang;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    if (typeof el.dataset.srcText === 'string') el.textContent = el.dataset.srcText;
  }

  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    if (typeof el.dataset.srcPlaceholder === 'string') el.setAttribute('placeholder', el.dataset.srcPlaceholder);
  }

  if (updatedWithinEl) {
    for (const opt of updatedWithinEl.querySelectorAll('option')) {
      if (typeof opt.dataset.srcText === 'string') opt.textContent = opt.dataset.srcText;
    }
  }

  if (categoryFilterEl) {
    for (const opt of categoryFilterEl.querySelectorAll('option')) {
      if (typeof opt.dataset.srcText === 'string') opt.textContent = opt.dataset.srcText;
    }
  }
}

function applyUiTranslationsFromCache(lang) {
  const to = String(lang || '').toLowerCase();
  if (!to || to === 'en') return;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const src = el.dataset.srcText;
    if (!src) continue;
    el.textContent = translateText(to, src);
  }

  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const src = el.dataset.srcPlaceholder;
    if (!src) continue;
    el.setAttribute('placeholder', translateText(to, src));
  }

  if (updatedWithinEl) {
    for (const opt of updatedWithinEl.querySelectorAll('option')) {
      const src = opt.dataset.srcText;
      if (!src) continue;
      opt.textContent = translateText(to, src);
    }
  }

  if (categoryFilterEl) {
    for (const opt of categoryFilterEl.querySelectorAll('option')) {
      const src = opt.dataset.srcText;
      if (!src) continue;
      opt.textContent = translateText(to, src);
    }
  }

  if (lastStatusSource) {
    statusEl.textContent = translateText(to, lastStatusSource);
  }
}

function collectUiSourceTexts() {
  const texts = [];

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const src = el.dataset.srcText;
    if (src) texts.push(src);
  }

  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const src = el.dataset.srcPlaceholder;
    if (src) texts.push(src);
  }

  if (updatedWithinEl) {
    for (const opt of updatedWithinEl.querySelectorAll('option')) {
      const src = opt.dataset.srcText;
      if (src) texts.push(src);
    }
  }

  if (categoryFilterEl) {
    for (const opt of categoryFilterEl.querySelectorAll('option')) {
      const src = opt.dataset.srcText;
      if (src) texts.push(src);
    }
  }

  if (lastStatusSource) texts.push(lastStatusSource);
  for (const s of UI_META_LABELS) texts.push(s);

  return texts;
}

function applyTranslations() {
  captureUiStrings();
  restoreUiToSource();

  if (activeUiLang === 'en') return;

  applyUiTranslationsFromCache(activeUiLang);
  const langAtStart = activeUiLang;
  const texts = collectUiSourceTexts();

  ensureTranslationsForTexts({ lang: langAtStart, texts })
    .then((didTranslate) => {
      if (!didTranslate) return;
      if (activeUiLang !== langAtStart) return;
      applyUiTranslationsFromCache(langAtStart);
      update();
    })
    .catch(() => {});
}

const UI_LANG_KEY = 'orgCatalogUiLang';

function getUiLangPreference() {
  try {
    return localStorage.getItem(UI_LANG_KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

function setUiLangPreference(value) {
  try {
    localStorage.setItem(UI_LANG_KEY, value);
  } catch {
    // ignore
  }
}

function resolveLang(value) {
  const v = String(value || '').trim().toLowerCase();
  const supported = ['en', 'es', 'pt', 'fr'];

  if (!v || v === 'auto') {
    const nav = String(navigator.language || '').toLowerCase();
    const short = nav.split('-')[0];
    return supported.includes(short) ? short : 'en';
  }

  return supported.includes(v) ? v : 'en';
}

let activeUiLang = resolveLang(getUiLangPreference());

let uiCaptured = false;
let lastStatusSource = '';

function captureUiStrings() {
  if (uiCaptured) return;
  uiCaptured = true;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    if (!el.dataset.srcText) el.dataset.srcText = el.textContent || '';
  }

  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    if (!el.dataset.srcPlaceholder) el.dataset.srcPlaceholder = el.getAttribute('placeholder') || '';
  }

  if (updatedWithinEl) {
    for (const opt of updatedWithinEl.querySelectorAll('option')) {
      if (!opt.dataset.srcText) opt.dataset.srcText = opt.textContent || '';
    }
  }

  if (categoryFilterEl) {
    for (const opt of categoryFilterEl.querySelectorAll('option')) {
      if (!opt.dataset.srcText) opt.dataset.srcText = opt.textContent || '';
    }
  }
}

/** @typedef {{name:string, fullName:string, url:string, description:string, topics:string[], language:string|null, updatedAt:string, archived:boolean, private:boolean, stargazersCount?:number, imageUrl?:string|null}} Repo */

/** @type {{generatedAt?:string, org?:string, repos?:Repo[]}} */
let publicCatalog = {};

/** @type {Repo[]} */
let publicRepos = [];

/** @type {Repo[]} */
let privateRepos = [];

/** @type {'public'|'private'} */
let activeView = 'public';

let isSignedIn = false;

/** @type {{authBaseUrl?: string}} */
let config = {};

function getTranslationBaseUrl() {
  const translateBaseUrl = String(config.translateBaseUrl || '').trim();
  if (translateBaseUrl) return translateBaseUrl.replace(/\/$/, '');

  const authBaseUrl = String(config.authBaseUrl || '').trim();
  if (authBaseUrl) return authBaseUrl.replace(/\/$/, '');

  return '';
}

function getLangTranslationCache(lang) {
  const l = String(lang || '').toLowerCase();
  if (!translationCacheByLang.has(l)) translationCacheByLang.set(l, new Map());
  return translationCacheByLang.get(l);
}

function translateText(lang, text) {
  const t = String(text || '');
  if (!t) return '';
  const cache = getLangTranslationCache(lang);
  return cache.get(t) || t;
}

async function requestTranslations({ baseUrl, to, texts }) {
  const res = await fetch(`${baseUrl}/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ to, texts }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error || `translate_http_${res.status}`;
    throw new Error(msg);
  }
  if (!data?.ok || !Array.isArray(data?.translations)) throw new Error('translate_invalid_response');
  return data.translations;
}

async function ensureTranslationsForRepos({ lang, repos, extraTexts }) {
  const to = String(lang || '').toLowerCase();
  if (!to || to === 'en') return false;
  if (!Array.isArray(repos) || !repos.length) return false;

  const baseUrl = getTranslationBaseUrl();
  if (!baseUrl) return false;

  const cache = getLangTranslationCache(to);
  const needed = new Set();

  if (Array.isArray(extraTexts)) {
    for (const s of extraTexts) {
      const t = String(s || '').trim();
      if (t && !cache.has(t)) needed.add(t);
    }
  }

  for (const repo of repos) {
    const desc = String(repo?.description || '').trim();
    if (desc && !cache.has(desc)) needed.add(desc);

    const topics = Array.isArray(repo?.topics) ? repo.topics : [];
    for (const topic of topics) {
      const t = String(topic || '').trim();
      if (t && !cache.has(t)) needed.add(t);
    }
  }

  if (!needed.size) return false;
  if (translationInFlightByLang.get(to)) return false;

  translationInFlightByLang.set(to, true);
  try {
    const all = Array.from(needed);
    for (let i = 0; i < all.length; i += TRANSLATION_BATCH_SIZE) {
      const batch = all.slice(i, i + TRANSLATION_BATCH_SIZE);
      const translated = await requestTranslations({ baseUrl, to, texts: batch });
      for (let j = 0; j < batch.length; j++) {
        const src = batch[j];
        const dst = typeof translated[j] === 'string' && translated[j] ? translated[j] : src;
        cache.set(src, dst);
      }
    }
    return true;
  } finally {
    translationInFlightByLang.set(to, false);
  }
}

function applyRepoContentTranslations(lang, repos) {
  const to = String(lang || '').toLowerCase();
  if (!to || to === 'en') return repos;

  return repos.map((repo) => {
    const topics = Array.isArray(repo?.topics) ? repo.topics : [];
    return {
      ...repo,
      description: translateText(to, repo?.description),
      topics: topics.map((t) => translateText(to, t)),
    };
  });
}

function setStatus(message) {
  lastStatusSource = String(message || '');
  statusEl.textContent = lastStatusSource;

  if (activeUiLang === 'en' || !lastStatusSource) return;

  const langAtStart = activeUiLang;
  ensureTranslationsForTexts({ lang: langAtStart, texts: [lastStatusSource] })
    .then((didTranslate) => {
      if (!didTranslate) return;
      if (activeUiLang !== langAtStart) return;
      statusEl.textContent = translateText(langAtStart, lastStatusSource);
    })
    .catch(() => {});
}

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

function tokenizeQuery(q) {
  return String(q || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function repoSearchScore(repo, tokens) {
  if (!tokens.length) return 0;

  const name = String(repo.name || '').toLowerCase();
  const fullName = String(repo.fullName || '').toLowerCase();
  const description = String(repo.description || '').toLowerCase();
  const language = String(repo.language || '').toLowerCase();
  const topics = (repo.topics ?? []).map((t) => String(t || '').toLowerCase());

  let score = 0;

  for (const token of tokens) {
    let tokenScore = 0;

    if (name === token) tokenScore = Math.max(tokenScore, 120);
    if (name.startsWith(token)) tokenScore = Math.max(tokenScore, 70);
    if (name.includes(token)) tokenScore = Math.max(tokenScore, 45);

    if (fullName.includes(token)) tokenScore = Math.max(tokenScore, 28);
    if (topics.some((t) => t.includes(token))) tokenScore = Math.max(tokenScore, 24);
    if (description.includes(token)) tokenScore = Math.max(tokenScore, 18);
    if (language.includes(token)) tokenScore = Math.max(tokenScore, 14);

    // AND semantics: all tokens must match somewhere
    if (tokenScore === 0) return -1;

    score += tokenScore;
  }

  // Light tie-breaker boost
  const stars = typeof repo.stargazersCount === 'number' ? repo.stargazersCount : 0;
  score += Math.min(stars, 50) / 10;

  return score;
}

function toTimeMs(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : 0;
}

function getFilters() {
  const language = (languageFilterEl?.value || '').trim();
  const category = (categoryFilterEl?.value || '').trim();
  const updatedWithinDaysRaw = (updatedWithinEl?.value || '').trim();
  const updatedWithinDays = updatedWithinDaysRaw && updatedWithinDaysRaw !== 'any' ? Number(updatedWithinDaysRaw) : 0;
  const minStars = Math.max(0, Number((minStarsEl?.value || '').trim() || 0) || 0);
  const hasImage = Boolean(hasImageEl?.checked);
  const includeArchived = Boolean(includeArchivedEl?.checked);
  return {
    language: language && language !== 'all' ? language : '',
    category: category && category !== 'all' ? category : '',
    updatedWithinDays,
    minStars,
    hasImage,
    includeArchived,
  };
}

function repoPassesFilters(repo, filters) {
  if (!filters.includeArchived && repo.archived) return false;
  if (filters.language && String(repo.language || '') !== filters.language) return false;
  if (filters.hasImage && !repo.imageUrl) return false;

  if (filters.category) {
    const topics = Array.isArray(repo.topics) ? repo.topics : [];
    const categories = Array.isArray(repo.categories) ? repo.categories : [];
    const want = String(filters.category || '').toLowerCase();
    const hay = [...categories, ...topics];
    if (!hay.some((t) => String(t || '').toLowerCase() === want)) return false;
  }

  const stars = typeof repo.stargazersCount === 'number' ? repo.stargazersCount : 0;
  if (filters.minStars && stars < filters.minStars) return false;

  if (filters.updatedWithinDays) {
    const updatedAtMs = toTimeMs(repo.updatedAt);
    if (!updatedAtMs) return false;
    const cutoff = Date.now() - filters.updatedWithinDays * 24 * 60 * 60 * 1000;
    if (updatedAtMs < cutoff) return false;
  }

  return true;
}

function setCategoryOptionsFrom(list) {
  if (!categoryFilterEl) return;

  const current = String(categoryFilterEl.value || 'all');
  const counts = new Map();

  for (const repo of list || []) {
    const categories = Array.isArray(repo?.categories) ? repo.categories : [];
    const topics = Array.isArray(repo?.topics) ? repo.topics : [];
    const values = categories.length ? categories : topics;

    for (const v of values) {
      const t = String(v || '').trim();
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40)
    .map(([topic]) => topic);

  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All';
  allOpt.dataset.srcText = 'All';

  const options = [allOpt, ...sorted.map((topic) => {
    const opt = document.createElement('option');
    opt.value = topic;
    opt.textContent = topic;
    opt.dataset.srcText = topic;
    return opt;
  })];

  categoryFilterEl.replaceChildren(...options);
  const stillExists = options.some((o) => o.value === current);
  categoryFilterEl.value = stillExists ? current : 'all';
}

function render(list) {
  const langLabel = translateText(activeUiLang, 'Language');
  const updatedLabel = translateText(activeUiLang, 'Updated');
  const archivedLabel = translateText(activeUiLang, 'Archived');

  gridEl.replaceChildren(
    ...list.map((repo) => {
      const card = document.createElement('a');
      card.className = 'card';
      card.href = repo.url;
      card.target = '_blank';
      card.rel = 'noreferrer';

      if (repo.imageUrl) {
        const media = document.createElement('div');
        media.className = 'cardMedia';

        const img = document.createElement('img');
        img.className = 'cardThumb';
        img.loading = 'lazy';
        img.alt = '';
        img.src = repo.imageUrl;

        media.appendChild(img);
        card.appendChild(media);
      }

      const title = document.createElement('h2');
      title.className = 'cardTitle';
      title.textContent = repo.name;

      const desc = document.createElement('p');
      desc.className = 'cardDesc';
      desc.textContent = repo.description || '—';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const language = repo.language ? `${langLabel}: ${repo.language}` : `${langLabel}: —`;
      const updated = repo.updatedAt ? `${updatedLabel}: ${formatDate(repo.updatedAt)}` : `${updatedLabel}: —`;
      const archived = repo.archived ? archivedLabel : '';
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

function setLanguageOptionsFrom(list) {
  if (!languageFilterEl) return;

  const current = String(languageFilterEl.value || 'all');
  const languages = new Set(
    list
      .map((r) => (r && r.language ? String(r.language) : ''))
      .filter(Boolean)
  );

  const sorted = Array.from(languages).sort((a, b) => a.localeCompare(b));

  const options = [
    { value: 'all', label: 'All' },
    ...sorted.map((lang) => ({ value: lang, label: lang })),
  ];

  languageFilterEl.replaceChildren(
    ...options.map(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      return opt;
    })
  );

  const stillExists = options.some((o) => o.value === current);
  languageFilterEl.value = stillExists ? current : 'all';
}

function setActiveView(view) {
  activeView = view;
  viewPublicEl.classList.toggle('active', view === 'public');
  viewPrivateEl.classList.toggle('active', view === 'private');
  setLanguageOptionsFrom(activeView === 'public' ? publicRepos : privateRepos);
  setCategoryOptionsFrom(activeView === 'public' ? publicRepos : privateRepos);
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
  isSignedIn = signedIn;
  signInEl.hidden = signedIn;
  signOutEl.hidden = !signedIn;
}


function openAuthPopup() {
  const authBaseUrl = String(config.authBaseUrl || '').trim();
  if (!authBaseUrl) {
    setStatus('Sign-in is not configured yet. Set docs/config.json authBaseUrl (or translateBaseUrl) to your worker URL.');
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
    return;
  }

  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    if (!win || win.closed) {
      window.clearInterval(timer);
      authRowEl.hidden = true;

      // If we didn't receive a token within a reasonable window, tell the user.
      if (!getToken() && Date.now() - startedAt > 1000) {
        setStatus('Sign-in was cancelled or blocked. Try again (and allow popups).');
      }
    }
  }, 400);
}

function update() {
  const q = qEl.value;
  const list = activeView === 'public' ? publicRepos : privateRepos;
  const filters = getFilters();
  const tokens = tokenizeQuery(q);
  const langAtStart = activeUiLang;

  const displayList = applyRepoContentTranslations(activeUiLang, list);

  let filtered = displayList.filter((r) => repoPassesFilters(r, filters));

  if (tokens.length) {
    const scored = filtered
      .map((repo) => ({ repo, score: repoSearchScore(repo, tokens) }))
      .filter((x) => x.score >= 0);

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return toTimeMs(b.repo.updatedAt) - toTimeMs(a.repo.updatedAt);
    });

    filtered = scored.map((x) => x.repo);
  }

  const label = activeView === 'public' ? 'public' : 'private';
  setStatus(`${filtered.length} of ${list.length} ${label} repositories`);
  render(filtered);

  // Kick off translation in the background; re-render once it completes.
  ensureTranslationsForRepos({ lang: langAtStart, repos: list, extraTexts: UI_META_LABELS })
    .then((didTranslate) => {
      if (!didTranslate) return;
      if (activeUiLang !== langAtStart) return;
      if (activeUiLang === 'en') return;
      update();
    })
    .catch(() => {});
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

  const configured = Boolean(String(config.authBaseUrl || '').trim());
  signInEl.disabled = !configured;
  signInEl.title = configured ? '' : 'Set docs/config.json authBaseUrl to enable GitHub sign-in.';
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
    setStatus('Token not accepted by GitHub. Sign in again.');
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

languageFilterEl?.addEventListener('change', update);
categoryFilterEl?.addEventListener('change', update);
updatedWithinEl?.addEventListener('change', update);
minStarsEl?.addEventListener('input', update);
hasImageEl?.addEventListener('change', update);
includeArchivedEl?.addEventListener('change', update);

viewPublicEl.addEventListener('click', () => setActiveView('public'));
viewPrivateEl.addEventListener('click', () => {
  if (!isSignedIn) {
    openAuthPopup();
    return;
  }

  setActiveView('private');
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

if (uiLangEl) {
  const pref = getUiLangPreference();
  uiLangEl.value = pref;
  activeUiLang = resolveLang(pref);
  applyTranslations();

  uiLangEl.addEventListener('change', () => {
    const value = String(uiLangEl.value || 'auto');
    setUiLangPreference(value);
    activeUiLang = resolveLang(value);
    applyTranslations();
    update();
  });
} else {
  applyTranslations();
}

await loadConfig();
await loadPublicCatalog();

const existingToken = getToken();
if (existingToken) {
  await signInWithToken(existingToken);
}
