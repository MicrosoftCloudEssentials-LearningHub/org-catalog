const statusEl = document.getElementById('status');
const gridEl = document.getElementById('grid');
const qEl = document.getElementById('q');
const footerMetaEl = document.getElementById('footerMeta');

const viewPublicEl = document.getElementById('viewPublic');
const viewPrivateEl = document.getElementById('viewPrivate');
const themeToggleEl = document.getElementById('themeToggle');
const advancedSearchToggleEl = document.getElementById('advancedSearchToggle');
const filtersPanelEl = document.getElementById('filtersPanel');

const uiLangEl = document.getElementById('lang');

// Initialize toggle icon based on current theme (set by anti-flash script)
if (themeToggleEl) {
  themeToggleEl.textContent =
    document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
}

const languageFilterEl = document.getElementById('languageFilter');
const categoryFilterEl = document.getElementById('categoryFilter');
const updatedWithinEl = document.getElementById('updatedWithin');

advancedSearchToggleEl?.addEventListener('click', () => {
  const isOpen = advancedSearchToggleEl.getAttribute('aria-expanded') === 'true';
  advancedSearchToggleEl.setAttribute('aria-expanded', String(!isOpen));
  if (filtersPanelEl) filtersPanelEl.hidden = isOpen;
});

const CONFIG_URL = './config.json';

const TRANSLATION_BATCH_SIZE = 50;
const translationCacheByLang = new Map();
const translationInFlightByLang = new Map();

const UI_META_LABELS = ['Language', 'Updated', 'Archived', 'Stars', 'Forks'];

// Lightweight, client-side UI translations for GitHub Pages / no-backend mode.
// This intentionally covers only the app chrome (labels, buttons, status messages).
const BUILTIN_UI_TRANSLATIONS = {
  es: {
    Search: 'Buscar',
    'name, description, topics, language': 'nombre, descripción, temas, idioma',
    Translate: 'Traducir',
    Auto: 'Automático',
    English: 'Inglés',
    Español: 'Español',
    Português: 'Portugués',
    Français: 'Francés',
    中文: 'Chino',
    日本語: 'Japonés',
    한국어: 'Coreano',
    Pipeline: 'Canalización',
    'Owner/Founder': 'Propietario/Fundador',
    Public: 'Público',
    Private: 'Privado',
    Filters: 'Filtros',
    Language: 'Idioma',
    Category: 'Categoría',
    Updated: 'Actualizado',
    Generated: 'Generado',
    Archived: 'Archivado',
    Stars: 'Estrellas',
    Forks: 'Bifurcaciones',
    All: 'Todos',
    'Any time': 'Cualquier momento',
    'Last 7 days': 'Últimos 7 días',
    'Last 30 days': 'Últimos 30 días',
    'Last 90 days': 'Últimos 90 días',
    'Last 365 days': 'Últimos 365 días',
    of: 'de',
    repositories: 'repositorios',
    public: 'públicos',
    private: 'privados',
    'Loading public catalog…': 'Cargando catálogo público…',
    'Could not load catalog.json. Run the GitHub Action to generate it.':
      'No se pudo cargar catalog.json. Ejecuta la acción de GitHub para generarlo.',
    'Could not determine org name. Regenerate catalog.json.':
      'No se pudo determinar el nombre de la organización. Vuelve a generar catalog.json.',
    'Opened GitHub private repositories in a new tab.':
      'Se abrieron los repositorios privados de GitHub en una nueva pestaña.',



    'Experimentation and playful learning, inviting users to try out Microsoft technology without fear of breaking things.':
      'Experimentación y aprendizaje lúdico, invitando a los usuarios a probar tecnología de Microsoft sin miedo a romper nada.',
  },
  pt: {
    Search: 'Pesquisar',
    'name, description, topics, language': 'nome, descrição, tópicos, idioma',
    Translate: 'Traduzir',
    Auto: 'Automático',
    English: 'Inglês',
    Español: 'Espanhol',
    Português: 'Português',
    Français: 'Francês',
    中文: 'Chinês',
    日本語: 'Japonês',
    한국어: 'Coreano',
    Pipeline: 'Pipeline',
    'Owner/Founder': 'Proprietário/Fundador',
    Public: 'Público',
    Private: 'Privado',
    Filters: 'Filtros',
    Language: 'Idioma',
    Category: 'Categoria',
    Updated: 'Atualizado',
    Generated: 'Gerado',
    Archived: 'Arquivado',
    Stars: 'Estrelas',
    Forks: 'Forks',
    All: 'Todos',
    'Any time': 'Qualquer momento',
    'Last 7 days': 'Últimos 7 dias',
    'Last 30 days': 'Últimos 30 dias',
    'Last 90 days': 'Últimos 90 dias',
    'Last 365 days': 'Últimos 365 dias',
    of: 'de',
    repositories: 'repositórios',
    public: 'públicos',
    private: 'privados',
    'Loading public catalog…': 'Carregando catálogo público…',
    'Could not load catalog.json. Run the GitHub Action to generate it.':
      'Não foi possível carregar catalog.json. Execute a GitHub Action para gerá-lo.',
    'Could not determine org name. Regenerate catalog.json.':
      'Não foi possível determinar o nome da organização. Regenere o catalog.json.',
    'Opened GitHub private repositories in a new tab.':
      'Os repositórios privados do GitHub foram abertos em uma nova aba.',



    'Experimentation and playful learning, inviting users to try out Microsoft technology without fear of breaking things.':
      'Experimentação e aprendizagem lúdica, convidando os usuários a experimentar tecnologia da Microsoft sem medo de quebrar nada.',
  },
  fr: {
    Search: 'Rechercher',
    'name, description, topics, language': 'nom, description, sujets, langue',
    Translate: 'Traduire',
    Auto: 'Auto',
    English: 'Anglais',
    Español: 'Espagnol',
    Português: 'Portugais',
    Français: 'Français',
    中文: 'Chinois',
    日本語: 'Japonais',
    한국어: 'Coréen',
    Pipeline: 'Pipeline',
    'Owner/Founder': 'Propriétaire/Fondateur',
    Public: 'Public',
    Private: 'Privé',
    Filters: 'Filtres',
    Language: 'Langue',
    Category: 'Catégorie',
    Updated: 'Mis à jour',
    Generated: 'Généré',
    Archived: 'Archivé',
    Stars: 'Etoiles',
    Forks: 'Forks',
    All: 'Tous',
    'Any time': "N'importe quand",
    'Last 7 days': '7 derniers jours',
    'Last 30 days': '30 derniers jours',
    'Last 90 days': '90 derniers jours',
    'Last 365 days': '365 derniers jours',
    of: 'sur',
    repositories: 'dépôts',
    public: 'publics',
    private: 'privés',
    'Loading public catalog…': 'Chargement du catalogue public…',
    'Could not load catalog.json. Run the GitHub Action to generate it.':
      "Impossible de charger catalog.json. Exécutez l'action GitHub pour le générer.",
    'Could not determine org name. Regenerate catalog.json.':
      "Impossible de déterminer le nom de l'organisation. Régénérez catalog.json.",
    'Opened GitHub private repositories in a new tab.':
      "Ouverture des dépôts privés GitHub dans un nouvel onglet.",



    'Experimentation and playful learning, inviting users to try out Microsoft technology without fear of breaking things.':
      "Expérimentation et apprentissage ludique, invitant les utilisateurs à essayer la technologie Microsoft sans crainte de tout casser.",
  },
  zh: {
    Search: '搜索',
    'name, description, topics, language': '名称、描述、主题、语言',
    Translate: '翻译',
    Auto: '自动',
    English: '英语',
    Español: '西班牙语',
    Português: '葡萄牙语',
    Français: '法语',
    中文: '中文',
    日本語: '日语',
    한국어: '韩语',
    Pipeline: '流水线',
    'Owner/Founder': '所有者/创始人',
    Public: '公开',
    Private: '私有',
    Filters: '筛选',
    Language: '语言',
    Category: '类别',
    Updated: '更新',
    Generated: '生成',
    Archived: '已归档',
    Stars: '星标',
    Forks: '分叉',
    All: '全部',
    'Any time': '任何时间',
    'Last 7 days': '最近7天',
    'Last 30 days': '最近30天',
    'Last 90 days': '最近90天',
    'Last 365 days': '最近365天',
    of: '/',
    repositories: '仓库',
    public: '公开',
    private: '私有',
    'Loading public catalog…': '正在加载公共目录…',
    'Could not load catalog.json. Run the GitHub Action to generate it.':
      '无法加载 catalog.json。请运行 GitHub Action 生成它。',
    'Could not determine org name. Regenerate catalog.json.':
      '无法确定组织名称。请重新生成 catalog.json。',
    'Opened GitHub private repositories in a new tab.':
      '已在新标签页中打开 GitHub 私有仓库。',
    'Experimentation and playful learning, inviting users to try out Microsoft technology without fear of breaking things.':
      '鼓励实验和趣味学习，邀请用户在不担心出错的情况下试用 Microsoft 技术。',
  },
  ja: {
    Search: '検索',
    'name, description, topics, language': '名前、説明、トピック、言語',
    Translate: '翻訳',
    Auto: '自動',
    English: '英語',
    Español: 'スペイン語',
    Português: 'ポルトガル語',
    Français: 'フランス語',
    中文: '中国語',
    日本語: '日本語',
    한국어: '韓国語',
    Pipeline: 'パイプライン',
    'Owner/Founder': 'オーナー/創設者',
    Public: '公開',
    Private: '非公開',
    Filters: 'フィルター',
    Language: '言語',
    Category: 'カテゴリ',
    Updated: '更新',
    Generated: '生成',
    Archived: 'アーカイブ済み',
    Stars: 'スター',
    Forks: 'フォーク',
    All: 'すべて',
    'Any time': 'いつでも',
    'Last 7 days': '過去7日',
    'Last 30 days': '過去30日',
    'Last 90 days': '過去90日',
    'Last 365 days': '過去365日',
    of: '/',
    repositories: 'リポジトリ',
    public: '公開',
    private: '非公開',
    'Loading public catalog…': '公開カタログを読み込んでいます…',
    'Could not load catalog.json. Run the GitHub Action to generate it.':
      'catalog.json を読み込めませんでした。GitHub Action を実行して生成してください。',
    'Could not determine org name. Regenerate catalog.json.':
      '組織名を特定できませんでした。catalog.json を再生成してください。',
    'Opened GitHub private repositories in a new tab.':
      'GitHub の非公開リポジトリを新しいタブで開きました。',
    'Experimentation and playful learning, inviting users to try out Microsoft technology without fear of breaking things.':
      'Microsoft 技術を壊す心配なく試せるよう、実験と遊び心のある学びを促します。',
  },
  ko: {
    Search: '검색',
    'name, description, topics, language': '이름, 설명, 주제, 언어',
    Translate: '번역',
    Auto: '자동',
    English: '영어',
    Español: '스페인어',
    Português: '포르투갈어',
    Français: '프랑스어',
    中文: '중국어',
    日本語: '일본어',
    한국어: '한국어',
    Pipeline: '파이프라인',
    'Owner/Founder': '소유자/설립자',
    Public: '공개',
    Private: '비공개',
    Filters: '필터',
    Language: '언어',
    Category: '카테고리',
    Updated: '업데이트',
    Generated: '생성',
    Archived: '보관됨',
    Stars: '스타',
    Forks: '포크',
    All: '전체',
    'Any time': '전체 기간',
    'Last 7 days': '지난 7일',
    'Last 30 days': '지난 30일',
    'Last 90 days': '지난 90일',
    'Last 365 days': '지난 365일',
    of: '/',
    repositories: '리포지토리',
    public: '공개',
    private: '비공개',
    'Loading public catalog…': '공개 카탈로그를 불러오는 중…',
    'Could not load catalog.json. Run the GitHub Action to generate it.':
      'catalog.json을 불러올 수 없습니다. GitHub Action을 실행해 생성하세요.',
    'Could not determine org name. Regenerate catalog.json.':
      '조직 이름을 확인할 수 없습니다. catalog.json을 다시 생성하세요.',
    'Opened GitHub private repositories in a new tab.':
      'GitHub 비공개 리포지토리를 새 탭에서 열었습니다.',
    'Experimentation and playful learning, inviting users to try out Microsoft technology without fear of breaking things.':
      'Microsoft 기술을 망가뜨릴 걱정 없이 시험해 볼 수 있도록 실험과 놀이형 학습을 장려합니다.',
  },
};

function normalizeUiText(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureI18nSource(el) {
  if (!el) return '';
  if (typeof el.dataset.srcText !== 'string' || !el.dataset.srcText) {
    el.dataset.srcText = el.textContent || '';
  }
  if (typeof el.dataset.srcKey !== 'string' || !el.dataset.srcKey) {
    el.dataset.srcKey = normalizeUiText(el.dataset.srcText);
  }
  return el.dataset.srcKey;
}

function seedBuiltinTranslations(lang) {
  const to = String(lang || '').toLowerCase();
  const builtin = BUILTIN_UI_TRANSLATIONS[to];
  if (!builtin) return;
  const cache = getLangTranslationCache(to);
  for (const [src, dst] of Object.entries(builtin)) {
    if (!cache.has(src)) cache.set(src, dst);
    const key = normalizeUiText(src);
    if (key && !cache.has(key)) cache.set(key, dst);
  }
}

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

  // Tab title
  if (document?.title) {
    const src = normalizeUiText(document.title);
    document.title = translateText(to, src);
  }

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = ensureI18nSource(el);
    if (!key) continue;
    el.textContent = translateText(to, key);
  }


  const subtitleEl = document.querySelector('.subtitle');
  if (subtitleEl) {
    const key = ensureI18nSource(subtitleEl);
    if (key) subtitleEl.textContent = translateText(to, key);
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
    statusEl.textContent = translateText(to, normalizeUiText(lastStatusSource));
  }

  updateFooterMeta();
}

function collectUiSourceTexts() {
  const texts = [];

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = ensureI18nSource(el);
    if (key) texts.push(key);
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
  texts.push('Generated');

  return texts;
}

function applyTranslations() {
  captureUiStrings();
  restoreUiToSource();

  seedBuiltinTranslations(activeUiLang);

  const baseUrl = getTranslationBaseUrl();
  if (uiLangEl) {
    uiLangEl.disabled = false;
    uiLangEl.title = '';
  }

  updateFooterMeta();

  if (activeUiLang === 'en') return;

  applyUiTranslationsFromCache(activeUiLang);

  // If there's no backend translator configured, we still translate UI chrome
  // using the built-in dictionary.
  if (!baseUrl) return;

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
  const supported = ['en', 'es', 'pt', 'fr', 'zh', 'ja', 'ko'];

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

let warnedMissingWorkerForTranslation = false;

function captureUiStrings() {
  if (uiCaptured) return;
  uiCaptured = true;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    if (!el.dataset.srcText) el.dataset.srcText = el.textContent || '';
    if (!el.dataset.srcKey) el.dataset.srcKey = normalizeUiText(el.dataset.srcText);
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

/** @typedef {{name:string, fullName:string, url:string, description:string, topics:string[], language:string|null, updatedAt:string, archived:boolean, private:boolean, stargazersCount?:number, forksCount?:number, imageUrl?:string|null}} Repo */

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
    const title = String(repo?.title || repo?.name || '').trim();
    if (title && !cache.has(title)) needed.add(title);

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
    const srcTitle = String(repo?.title || repo?.name || '').trim();

    // Build-time translations (preferred): scripts/fetch-catalog.mjs can embed
    // per-language content into catalog.json (no runtime backend required).
    const embedded = repo?.i18n && repo.i18n[to] ? repo.i18n[to] : null;
    const embeddedTitle = typeof embedded?.title === 'string' ? embedded.title : '';
    const embeddedDesc = typeof embedded?.description === 'string' ? embedded.description : '';
    const embeddedTopics = Array.isArray(embedded?.topics) ? embedded.topics : null;

    return {
      ...repo,
      title: embeddedTitle || translateText(to, srcTitle),
      description: embeddedDesc || translateText(to, repo?.description),
      topics: embeddedTopics || topics.map((t) => translateText(to, t)),
    };
  });
}

function setStatus(message) {
  lastStatusSource = String(message || '');
  statusEl.textContent =
    activeUiLang === 'en' ? lastStatusSource : translateText(activeUiLang, normalizeUiText(lastStatusSource));

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

function formatCountStatus({ filteredCount, totalCount, view }) {
  const to = String(activeUiLang || '').toLowerCase();
  const viewWord = view === 'private' ? 'private' : 'public';
  const parts = [
    String(filteredCount),
    translateText(to, 'of'),
    String(totalCount),
    translateText(to, viewWord),
    translateText(to, 'repositories'),
  ];
  return parts.filter(Boolean).join(' ');
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
  const forks = typeof repo.forksCount === 'number' ? repo.forksCount : 0;
  score += Math.min(stars, 50) / 10;
  score += Math.min(forks, 50) / 15;

  return score;
}

function toTimeMs(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? t : 0;
}

function toCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatCount(value) {
  return new Intl.NumberFormat(undefined).format(value);
}

function sortByPopularity(list) {
  return Array.from(list).sort((a, b) => {
    const starsDiff = toCount(b?.stargazersCount) - toCount(a?.stargazersCount);
    if (starsDiff) return starsDiff;
    const forksDiff = toCount(b?.forksCount) - toCount(a?.forksCount);
    if (forksDiff) return forksDiff;
    return toTimeMs(b?.updatedAt) - toTimeMs(a?.updatedAt);
  });
}

function getFilters() {
  const language = (languageFilterEl?.value || '').trim();
  const category = (categoryFilterEl?.value || '').trim();
  const updatedWithinDaysRaw = (updatedWithinEl?.value || '').trim();
  const updatedWithinDays = updatedWithinDaysRaw && updatedWithinDaysRaw !== 'any' ? Number(updatedWithinDaysRaw) : 0;
  const includeArchived = false;
  return {
    language: language && language !== 'all' ? language : '',
    category: category && category !== 'all' ? category : '',
    updatedWithinDays,
    includeArchived,
  };
}

function repoPassesFilters(repo, filters) {
  if (!filters.includeArchived && repo.archived) return false;
  if (filters.language && String(repo.language || '') !== filters.language) return false;

  if (filters.category) {
    const topics = Array.isArray(repo.topics) ? repo.topics : [];
    const categories = Array.isArray(repo.categories) ? repo.categories : [];
    const want = String(filters.category || '').toLowerCase();
    const hay = [...categories, ...topics];
    if (!hay.some((t) => String(t || '').toLowerCase() === want)) return false;
  }

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
  const starsLabel = translateText(activeUiLang, 'Stars');
  const forksLabel = translateText(activeUiLang, 'Forks');

  gridEl.replaceChildren(
    ...list.map((repo) => {
      const card = document.createElement('a');
      card.className = 'card';
      const destination = String(repo.pagesUrl || repo.url || '');
      card.href = destination;
      card.target = '_blank';
      card.rel = 'noreferrer';
      card.title = repo.pagesUrl ? 'Open GitHub Pages site' : 'Open GitHub repository';

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
      title.textContent = String(repo.title || repo.name || '');

      const desc = document.createElement('p');
      desc.className = 'cardDesc';
      desc.textContent = repo.description || '—';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const language = repo.language ? `${langLabel}: ${repo.language}` : `${langLabel}: —`;
      const updated = repo.updatedAt ? `${updatedLabel}: ${formatDate(repo.updatedAt)}` : `${updatedLabel}: —`;
      const archived = repo.archived ? archivedLabel : '';
      meta.textContent = [language, updated, archived].filter(Boolean).join(' • ');

      const stats = document.createElement('div');
      stats.className = 'stats';

      const starsValue = toCount(repo.stargazersCount);
      const forksValue = toCount(repo.forksCount);

      const starStat = document.createElement('span');
      starStat.className = 'stat';
      starStat.textContent = `★ ${formatCount(starsValue)}`;
      starStat.title = `${starsLabel}: ${formatCount(starsValue)}`;
      starStat.setAttribute('aria-label', starStat.title);

      const forkStat = document.createElement('span');
      forkStat.className = 'stat';
      forkStat.textContent = `⎇ ${formatCount(forksValue)}`;
      forkStat.title = `${forksLabel}: ${formatCount(forksValue)}`;
      forkStat.setAttribute('aria-label', forkStat.title);

      stats.append(starStat, forkStat);

      card.append(title, desc, meta, stats);

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
      const starsDiff = toCount(b.repo?.stargazersCount) - toCount(a.repo?.stargazersCount);
      if (starsDiff) return starsDiff;
      const forksDiff = toCount(b.repo?.forksCount) - toCount(a.repo?.forksCount);
      if (forksDiff) return forksDiff;
      return toTimeMs(b.repo.updatedAt) - toTimeMs(a.repo.updatedAt);
    });

    filtered = scored.map((x) => x.repo);
  } else {
    filtered = sortByPopularity(filtered);
  }

  const label = activeView === 'public' ? 'public' : 'private';
  setStatus(formatCountStatus({ filteredCount: filtered.length, totalCount: list.length, view: label }));
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

function updateFooterMeta() {
  if (!footerMetaEl) return;

  const org = publicCatalog.org ? `@${publicCatalog.org}` : '';
  const generatedAt = publicCatalog.generatedAt ? new Date(publicCatalog.generatedAt).toLocaleString() : '';
  const generatedLabel = translateText(activeUiLang, 'Generated');

  footerMetaEl.textContent = [org, generatedAt ? `${generatedLabel}: ${generatedAt}` : '']
    .filter(Boolean)
    .join(' • ');
}

async function loadPublicCatalog() {
  setStatus('Loading public catalog…');

  try {
    publicCatalog = await fetchJson(`./catalog.json?ts=${Date.now()}`, { cache: 'no-store' });
  } catch {
    setStatus('Could not load catalog.json. Run the GitHub Action to generate it.');
    return;
  }

  publicRepos = (publicCatalog.repos ?? []).filter((r) => !r.private);

  updateFooterMeta();

  setActiveView('public');
}

async function loadConfig() {
  try {
    config = await fetchJson(CONFIG_URL, undefined);
  } catch {
    config = {};
  }
}

function getOrgPrivateReposUrl() {
  const org = String(publicCatalog?.org || '').trim();
  if (!org) return '';
  const url = new URL(`https://github.com/orgs/${encodeURIComponent(org)}/repositories`);
  url.searchParams.set('type', 'private');
  url.searchParams.set('q', 'visibility:private archived:false');
  return url.toString();
}

// Events
themeToggleEl?.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('orgCatalogTheme', 'light'); } catch (e) {}
    themeToggleEl.textContent = '🌙';
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.setItem('orgCatalogTheme', 'dark'); } catch (e) {}
    themeToggleEl.textContent = '☀️';
  }
});

qEl.addEventListener('input', update);

languageFilterEl?.addEventListener('change', update);
categoryFilterEl?.addEventListener('change', update);
updatedWithinEl?.addEventListener('change', update);

viewPublicEl.addEventListener('click', () => setActiveView('public'));
viewPrivateEl.addEventListener('click', () => {
  const url = getOrgPrivateReposUrl();
  if (!url) {
    setStatus('Could not determine org name. Regenerate catalog.json.');
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
  setStatus('Opened GitHub private repositories in a new tab.');
});

// Boot

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
applyTranslations();
await loadPublicCatalog();
