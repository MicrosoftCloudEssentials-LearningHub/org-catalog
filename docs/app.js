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

const UI_LANG_KEY = 'orgCatalogUiLang';

const I18N = {
  en: {
    'label.search': 'Search',
    'label.languageUi': 'UI',
    'placeholder.search': 'name, description, topics, language',
    'button.public': 'Public',
    'button.private': 'Private',
    'button.signIn': 'Sign in',
    'button.signOut': 'Sign out',
    'label.language': 'Language',
    'label.updated': 'Updated',
    'label.minStars': 'Min stars',
    'placeholder.minStars': '0',
    'label.hasThumbnail': 'Has thumbnail',
    'label.includeArchived': 'Include archived',
    'hint.redirecting': 'Redirecting to GitHub sign-in…',

    'updated.any': 'Any time',
    'updated.7': 'Last 7 days',
    'updated.30': 'Last 30 days',
    'updated.90': 'Last 90 days',
    'updated.365': 'Last 365 days',

    'status.loadingPublic': 'Loading public catalog…',
    'status.catalogMissing': 'Could not load catalog.json. Run the GitHub Action to generate it.',
    'status.signInNotConfigured': 'Sign-in is not configured yet. Set docs/config.json authBaseUrl to your OAuth worker URL.',
    'status.popupBlocked': 'Popup blocked. Allow popups and try again.',
    'status.signInCancelled': 'Sign-in was cancelled or blocked. Try again (and allow popups).',
    'status.publicRepoCount': '{count} public repositories',
    'status.viewCount': '{filtered} of {total} {label} repositories',
    'status.checkingAccess': 'Checking access…',
    'status.loadingPrivate': 'Loading private repositories for @{org}…',
    'status.signedInNotAuthorized': 'Signed in, but not authorized for @{org} private repos.',
    'status.signInFailed': 'Sign-in failed or you are not authorized.',
    'status.signInNoToken': 'Sign-in did not return an access token.',
    'status.publicCatalogMissingOrg': 'Public catalog missing org name. Regenerate catalog.json.',
    'status.tokenRejected': 'Token not accepted by GitHub. Sign in again.',
  },
  es: {
    'label.search': 'Buscar',
    'label.languageUi': 'UI',
    'placeholder.search': 'nombre, descripción, temas, lenguaje',
    'button.public': 'Público',
    'button.private': 'Privado',
    'button.signIn': 'Iniciar sesión',
    'button.signOut': 'Cerrar sesión',
    'label.language': 'Lenguaje',
    'label.updated': 'Actualizado',
    'label.minStars': 'Mín estrellas',
    'placeholder.minStars': '0',
    'label.hasThumbnail': 'Con miniatura',
    'label.includeArchived': 'Incluir archivados',
    'hint.redirecting': 'Redirigiendo al inicio de sesión de GitHub…',

    'updated.any': 'Cualquier fecha',
    'updated.7': 'Últimos 7 días',
    'updated.30': 'Últimos 30 días',
    'updated.90': 'Últimos 90 días',
    'updated.365': 'Últimos 365 días',

    'status.loadingPublic': 'Cargando catálogo público…',
    'status.catalogMissing': 'No se pudo cargar catalog.json. Ejecuta la acción de GitHub para generarlo.',
    'status.signInNotConfigured': 'El inicio de sesión no está configurado. Define authBaseUrl en docs/config.json con la URL de tu OAuth worker.',
    'status.popupBlocked': 'Popup bloqueado. Permite popups e inténtalo de nuevo.',
    'status.signInCancelled': 'El inicio de sesión fue cancelado o bloqueado. Inténtalo de nuevo (y permite popups).',
    'status.publicRepoCount': '{count} repositorios públicos',
    'status.viewCount': '{filtered} de {total} repositorios {label}',
    'status.checkingAccess': 'Verificando acceso…',
    'status.loadingPrivate': 'Cargando repositorios privados para @{org}…',
    'status.signedInNotAuthorized': 'Sesión iniciada, pero sin autorización para ver repos privados de @{org}.',
    'status.signInFailed': 'Falló el inicio de sesión o no estás autorizado.',
    'status.signInNoToken': 'El inicio de sesión no devolvió un token de acceso.',
    'status.publicCatalogMissingOrg': 'El catálogo público no incluye el nombre de la organización. Regenera catalog.json.',
    'status.tokenRejected': 'GitHub rechazó el token. Inicia sesión nuevamente.',
  },
  pt: {
    'label.search': 'Pesquisar',
    'label.languageUi': 'UI',
    'placeholder.search': 'nome, descrição, tópicos, linguagem',
    'button.public': 'Público',
    'button.private': 'Privado',
    'button.signIn': 'Entrar',
    'button.signOut': 'Sair',
    'label.language': 'Linguagem',
    'label.updated': 'Atualizado',
    'label.minStars': 'Mín estrelas',
    'placeholder.minStars': '0',
    'label.hasThumbnail': 'Com miniatura',
    'label.includeArchived': 'Incluir arquivados',
    'hint.redirecting': 'Redirecionando para o login do GitHub…',

    'updated.any': 'Qualquer data',
    'updated.7': 'Últimos 7 dias',
    'updated.30': 'Últimos 30 dias',
    'updated.90': 'Últimos 90 dias',
    'updated.365': 'Últimos 365 dias',
  },
  fr: {
    'label.search': 'Rechercher',
    'label.languageUi': 'UI',
    'placeholder.search': 'nom, description, sujets, langage',
    'button.public': 'Public',
    'button.private': 'Privé',
    'button.signIn': 'Se connecter',
    'button.signOut': 'Se déconnecter',
    'label.language': 'Langage',
    'label.updated': 'Mis à jour',
    'label.minStars': 'Min étoiles',
    'placeholder.minStars': '0',
    'label.hasThumbnail': 'Avec miniature',
    'label.includeArchived': 'Inclure archivés',
    'hint.redirecting': 'Redirection vers la connexion GitHub…',

    'updated.any': 'N’importe quand',
    'updated.7': '7 derniers jours',
    'updated.30': '30 derniers jours',
    'updated.90': '90 derniers jours',
    'updated.365': '365 derniers jours',
  },
};

function formatI18n(template, vars) {
  if (!vars) return template;
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

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
  const supported = Object.keys(I18N);

  if (!v || v === 'auto') {
    const nav = String(navigator.language || '').toLowerCase();
    const short = nav.split('-')[0];
    return supported.includes(short) ? short : 'en';
  }

  return supported.includes(v) ? v : 'en';
}

let activeUiLang = resolveLang(getUiLangPreference());

function t(key, vars) {
  const dict = I18N[activeUiLang] || I18N.en;
  const fallback = I18N.en;
  const template = dict[key] ?? fallback[key] ?? key;
  return formatI18n(template, vars);
}

function applyTranslations() {
  document.documentElement.lang = activeUiLang;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (!key) continue;
    el.textContent = t(key);
  }

  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) continue;
    el.setAttribute('placeholder', t(key));
  }

  // Updated filter option labels
  if (updatedWithinEl) {
    for (const opt of updatedWithinEl.querySelectorAll('option')) {
      const value = String(opt.value || '').trim();
      if (value === 'any') opt.textContent = t('updated.any');
      if (value === '7') opt.textContent = t('updated.7');
      if (value === '30') opt.textContent = t('updated.30');
      if (value === '90') opt.textContent = t('updated.90');
      if (value === '365') opt.textContent = t('updated.365');
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
  statusEl.textContent = message;
}

function setStatusKey(key, vars) {
  setStatus(t(key, vars));
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
  const updatedWithinDaysRaw = (updatedWithinEl?.value || '').trim();
  const updatedWithinDays = updatedWithinDaysRaw && updatedWithinDaysRaw !== 'any' ? Number(updatedWithinDaysRaw) : 0;
  const minStars = Math.max(0, Number((minStarsEl?.value || '').trim() || 0) || 0);
  const hasImage = Boolean(hasImageEl?.checked);
  const includeArchived = Boolean(includeArchivedEl?.checked);
  return {
    language: language && language !== 'all' ? language : '',
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
    setStatusKey('status.signInNotConfigured');
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
    setStatusKey('status.popupBlocked');
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
        setStatusKey('status.signInCancelled');
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
  setStatusKey('status.viewCount', { filtered: filtered.length, total: list.length, label });
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
  setStatusKey('status.loadingPublic');

  try {
    publicCatalog = await fetchJson('./catalog.json', undefined);
  } catch {
    setStatusKey('status.catalogMissing');
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
    setStatusKey('status.publicCatalogMissingOrg');
    return;
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  setStatusKey('status.checkingAccess');

  // 1) Validate token is usable
  try {
    await fetchJson('https://api.github.com/user', headers);
  } catch {
    setStatusKey('status.tokenRejected');
    return;
  }

  // 2) Load private repos; this doubles as the authorization gate.
  setStatusKey('status.loadingPrivate', { org });
  try {
    privateRepos = await fetchPrivateRepos({ org, headers });
  } catch (err) {
    setStatusKey('status.signedInNotAuthorized', { org });
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
  setStatusKey('status.publicRepoCount', { count: publicRepos.length });
});

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.type !== 'org-catalog-oauth') return;

  authRowEl.hidden = true;

  if (data.error) {
    setStatusKey('status.signInFailed');
    return;
  }

  if (typeof data.accessToken === 'string' && data.accessToken) {
    setToken(data.accessToken);
    await signInWithToken(data.accessToken);
    return;
  }

  setStatusKey('status.signInNoToken');
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
