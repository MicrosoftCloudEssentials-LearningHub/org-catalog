import fs from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`\nOrg catalog generator\n\nEnv vars:\n  ORG_NAME                       GitHub org to index\n  GITHUB_TOKEN                   Optional GitHub token (higher rate limits)\n\nOptional: build-time translations (no runtime backend)\n  MODELS_TOKEN                   GitHub Models token (fallbacks to GITHUB_TOKEN)\n  TRANSLATE_MODEL                Optional (default: openai/gpt-4.1-mini)\n  TRANSLATE_MODEL_FALLBACKS      Optional comma list of fallback models\n  TRANSLATE_MAX_RETRIES          Optional retries per model (default: 0)\n  TRANSLATE_BATCH_SIZE           Optional texts per batch (default: 10)\n  TRANSLATE_REQUEST_SPACING_MS   Optional delay between requests (default: 1500)\n  TRANSLATE_TO                   Optional comma list (default: es,pt,fr,zh,ja,ko)\n  REQUIRE_TRANSLATIONS           Optional (true to fail if translation unavailable)\n\nUsage:\n  node scripts/fetch-catalog.mjs\n`);
  process.exit(0);
}

const DEFAULT_ORG = 'Cloud2BR-MSFTLearningHub';
const ORG_NAME = (process.env.ORG_NAME || DEFAULT_ORG).trim();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const MODELS_TOKEN = String(process.env.MODELS_TOKEN || process.env.GITHUB_TOKEN || '').trim();
const TRANSLATE_MODEL = String(process.env.TRANSLATE_MODEL || 'openai/gpt-4.1-mini').trim();
const TRANSLATE_MODEL_FALLBACKS = String(
  process.env.TRANSLATE_MODEL_FALLBACKS || 'openai/gpt-4.1-nano,openai/gpt-4o-mini,openai/gpt-4o'
).trim();
const REQUIRE_TRANSLATIONS = String(process.env.REQUIRE_TRANSLATIONS || '').trim().toLowerCase() === 'true';

const TRANSLATE_MODELS = [
  TRANSLATE_MODEL,
  ...TRANSLATE_MODEL_FALLBACKS.split(',').map((s) => s.trim()).filter(Boolean),
].filter((s, i, a) => a.indexOf(s) === i);

const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const PUBLISHED_CATALOG_URL = String(
  process.env.PUBLISHED_CATALOG_URL || `https://${ORG_NAME.toLowerCase()}.github.io/${path.basename(process.cwd())}/catalog.json`
).trim();

const TRANSLATE_TO = String(process.env.TRANSLATE_TO || 'es,pt,fr,zh,ja,ko')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
  .filter((s, i, a) => a.indexOf(s) === i)
  .filter((s) => s !== 'en');

const TRANSLATE_BATCH_SIZE = Math.max(1, Number.parseInt(String(process.env.TRANSLATE_BATCH_SIZE || '10'), 10) || 10);
const TRANSLATE_MAX_RETRIES = Math.max(0, Number.parseInt(String(process.env.TRANSLATE_MAX_RETRIES || '0'), 10) || 0);
const REQUEST_TIMEOUT_MS = 45000;
const MAX_RETRY_DELAY_MS = 10000;
const MIN_RETRY_DELAY_MS = 800;
const TRANSLATE_REQUEST_SPACING_MS = Math.max(0, Number.parseInt(String(process.env.TRANSLATE_REQUEST_SPACING_MS || '1500'), 10) || 0);

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

if (GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
}

async function fetchPaged(url) {
  const results = [];
  let nextUrl = url;

  while (nextUrl) {
    const res = await fetchWithTimeout(nextUrl, { headers }, REQUEST_TIMEOUT_MS);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error: HTTP ${res.status}. ${text}`);
    }

    const page = await withTimeout(res.json(), REQUEST_TIMEOUT_MS, 'github_api_json');
    results.push(...page);

    const link = res.headers.get('link');
    const next = link?.match(/<([^>]+)>;\s*rel="next"/i)?.[1] ?? null;
    nextUrl = next;
  }

  return results;
}

function toRepoModel(r) {
  return {
    name: r.name,
    title: String(r.title || r.name || ''),
    fullName: r.full_name,
    url: r.html_url,
    description: r.description ?? '',
    topics: Array.isArray(r.topics) ? r.topics : [],
    categories: Array.isArray(r.categories) ? r.categories : [],
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
    language: r.language,
    updatedAt: r.pushed_at ?? r.updated_at,
    archived: Boolean(r.archived),
    private: Boolean(r.private),
    stargazersCount: typeof r.stargazers_count === 'number' ? r.stargazers_count : undefined,
    forksCount: typeof r.forks_count === 'number' ? r.forks_count : undefined,
    imageUrl: r.imageUrl ?? null,
  };
}

function cleanMarkdownInlineText(text) {
  let s = String(text || '').trim();
  if (!s) return '';
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/[`*_~]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function extractReadmeTitle(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;

    const atx = line.match(/^#{1,2}\s+(.+)$/);
    if (atx?.[1]) {
      const title = cleanMarkdownInlineText(atx[1]);
      if (title) return title;
    }

    const next = String(lines[i + 1] || '').trim();
    if (/^=+$/.test(next)) {
      const title = cleanMarkdownInlineText(line);
      if (title) return title;
    }
  }

  return '';
}

function stripMarkdownToText(markdown) {
  let s = String(markdown || '');
  // Remove code blocks
  s = s.replace(/```[\s\S]*?```/g, ' ');
  // Remove inline code
  s = s.replace(/`[^`]*`/g, ' ');
  // Remove images
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  // Convert links to link text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Strip HTML tags
  s = s.replace(/<[^>]+>/g, ' ');
  // Strip headings/formatting tokens
  s = s.replace(/[#>*_~]/g, ' ');
  return s;
}

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','can','for','from','has','have','how','i','if','in','into','is','it','its','of','on','or','our','out','see','so','that','the','their','then','there','these','this','to','use','using','was','we','were','what','when','where','which','who','why','will','with','you','your',
  'not','no','yes','all','any','more','most','some','such','than','too','very',
  'project','projects','repo','repository','repositories','example','examples','sample','samples','demo','demos','docs','documentation','guide','guides','tutorial','tutorials','learn','learning','course','courses','lab','labs','workshop','workshops','exercise','exercises',
  'license','licenses','contributing','contribute','contributors','contributor','code','coded','coding','build','builds','run','running','install','installation','setup','configure','configuration','config','usage','getting','started','readme'
]);

function tokenizeText(text) {
  const s = String(text || '').toLowerCase();
  const raw = s.split(/[^a-z0-9]+/g).filter(Boolean);
  const tokens = [];
  for (const t of raw) {
    if (t.length < 3 || t.length > 24) continue;
    if (/^\d+$/.test(t)) continue;
    if (STOPWORDS.has(t)) continue;
    tokens.push(t);
  }
  return tokens;
}

function buildTf(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

function mergeUniquePreserveOrder(arr, limit) {
  const out = [];
  const seen = new Set();
  for (const v of arr) {
    const s = String(v || '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeImageRef(ref) {
  const raw = String(ref || '').trim();
  if (!raw) return '';
  if (raw.startsWith('#')) return '';

  // strip optional surrounding angle brackets
  const noBrackets = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1).trim() : raw;
  // strip optional title part: url "title" or url 'title'
  return noBrackets.split(/\s+/)[0] || '';
}

function isBadgeLikeImageRef(ref) {
  const raw = String(ref || '');
  const lower = raw.toLowerCase();

  // Common badge providers / patterns
  if (lower.includes('shields.io')) return true;
  if (lower.includes('badge.fury.io')) return true;
  if (lower.includes('badgen.net')) return true;
  if (lower.includes('badge.svg')) return true; // includes GitHub Actions badges

  // Relative paths that look like badges
  if (/(^|\/|\\)badge\.(svg|png)$/i.test(raw)) return true;

  return false;
}

function extractFirstImageRef(markdown) {
  const text = String(markdown || '');

  // Iterate in document order across Markdown and HTML image syntaxes
  const refs = [];
  const re = /!\[[^\]]*\]\(([^)]+)\)|<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gim;
  let match;
  while ((match = re.exec(text))) {
    const candidate = normalizeImageRef(match[1] || match[2]);
    if (candidate) refs.push(candidate);
  }

  for (const ref of refs) {
    if (!isBadgeLikeImageRef(ref)) return ref;
  }

  return '';
}

function resolveReadmeImageUrl({ org, repo, branch, readmePath, imageRef }) {
  const ref = String(imageRef || '').trim();
  if (!ref) return '';

  // absolute
  if (/^https?:\/\//i.test(ref) || ref.startsWith('data:')) return ref;

  const cleanRef = ref.replace(/^\.\//, '');

  const readmeDir = String(readmePath || '').includes('/')
    ? String(readmePath).split('/').slice(0, -1).join('/')
    : '';

  let resolvedPath = cleanRef;
  if (cleanRef.startsWith('/')) {
    resolvedPath = cleanRef.slice(1);
  } else if (readmeDir) {
    resolvedPath = `${readmeDir}/${cleanRef}`;
  }

  const encodedPath = resolvedPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  return `https://raw.githubusercontent.com/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
}

async function fetchReadme({ org, repo }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(org)}/${encodeURIComponent(repo)}/readme`;
  const res = await fetchWithTimeout(url, { headers }, REQUEST_TIMEOUT_MS);
  if (!res.ok) return null;

  const data = await withTimeout(res.json(), REQUEST_TIMEOUT_MS, 'readme_json').catch(() => null);
  if (!data?.content || typeof data.content !== 'string') return null;

  const content = Buffer.from(data.content, 'base64').toString('utf8');
  const path = typeof data.path === 'string' ? data.path : 'README.md';
  return { content, path };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => worker());
  await Promise.all(workers);
  return results;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function withTimeout(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label || 'operation'}_timeout`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

function getRetryDelayMs(res, attempt) {
  const retryAfterRaw = res?.headers?.get?.('retry-after');
  const retryAfterNumeric = Number.parseFloat(String(retryAfterRaw || ''));
  if (Number.isFinite(retryAfterNumeric) && retryAfterNumeric > 0) {
    // Some providers return milliseconds-like values in retry-after.
    // Normalize and hard-cap delays so CI cannot appear frozen.
    const interpretedMs = retryAfterNumeric > 1000
      ? Math.round(retryAfterNumeric)
      : Math.round(retryAfterNumeric * 1000);
    return Math.max(MIN_RETRY_DELAY_MS, Math.min(interpretedMs, MAX_RETRY_DELAY_MS));
  }

  const retryAfterDate = Date.parse(String(retryAfterRaw || ''));
  if (Number.isFinite(retryAfterDate)) {
    const fromDateMs = retryAfterDate - Date.now();
    if (fromDateMs > 0) {
      return Math.max(MIN_RETRY_DELAY_MS, Math.min(fromDateMs, MAX_RETRY_DELAY_MS));
    }
  }

  const base = MIN_RETRY_DELAY_MS;
  const backoff = base * (2 ** attempt);
  const jitter = Math.floor(Math.random() * 400);
  const fallbackMs = backoff + jitter;
  return Math.max(MIN_RETRY_DELAY_MS, Math.min(fallbackMs, MAX_RETRY_DELAY_MS));
}

function hasTranslatorConfigured() {
  return Boolean(MODELS_TOKEN);
}

function mergeTranslationEntry(map, srcText, lang, translatedText) {
  const src = String(srcText || '').trim();
  const translated = String(translatedText || '').trim();
  if (!src || !lang || !translated) return;

  if (!map.has(src)) map.set(src, {});
  const current = map.get(src);
  current[lang] = translated;
}

function hasAllLangTranslations(perLang, languages) {
  if (!perLang || typeof perLang !== 'object') return false;
  return languages.every((lang) => {
    const v = String(perLang[lang] || '').trim();
    return Boolean(v);
  });
}

async function loadPublishedTranslationCache() {
  if (!PUBLISHED_CATALOG_URL) return new Map();

  try {
    const url = `${PUBLISHED_CATALOG_URL}${PUBLISHED_CATALOG_URL.includes('?') ? '&' : '?'}ts=${Date.now()}`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, REQUEST_TIMEOUT_MS);
    if (!res.ok) return new Map();

    const data = await withTimeout(res.json(), REQUEST_TIMEOUT_MS, 'published_cache_json').catch(() => null);
    const repos = Array.isArray(data?.repos) ? data.repos : [];
    const cache = new Map();

    for (const repo of repos) {
      const i18n = repo?.i18n && typeof repo.i18n === 'object' ? repo.i18n : null;
      if (!i18n) continue;

      const sourceTitle = String(repo?.title || repo?.name || '').trim();
      const sourceDesc = String(repo?.description || '').trim();
      const sourceTopics = Array.isArray(repo?.topics) ? repo.topics.map((t) => String(t || '').trim()) : [];

      for (const [lang, translated] of Object.entries(i18n)) {
        const tObj = translated && typeof translated === 'object' ? translated : null;
        if (!tObj) continue;

        mergeTranslationEntry(cache, sourceTitle, lang, tObj.title);
        mergeTranslationEntry(cache, sourceDesc, lang, tObj.description);

        const translatedTopics = Array.isArray(tObj.topics) ? tObj.topics : [];
        const topicCount = Math.min(sourceTopics.length, translatedTopics.length);
        for (let i = 0; i < topicCount; i++) {
          mergeTranslationEntry(cache, sourceTopics[i], lang, translatedTopics[i]);
        }
      }
    }

    return cache;
  } catch {
    return new Map();
  }
}

const LANGUAGE_LABELS = {
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
};

function parseJsonArray(text) {
  if (!text) return null;
  let raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) raw = fenced[1].trim();

  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    raw = raw.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function githubModelsTranslateBatch({ texts, lang, modelStartIndex = 0 }) {
  const languageLabel = LANGUAGE_LABELS[lang] || lang;

  const retriesPerModel = TRANSLATE_MAX_RETRIES;
  const totalAttempts = Math.max(1, TRANSLATE_MODELS.length * (retriesPerModel + 1));
  const modelCount = Math.max(1, TRANSLATE_MODELS.length);

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const modelSlot = Math.floor(attempt / (retriesPerModel + 1));
    const modelIndex = (modelStartIndex + modelSlot) % modelCount;
    const model = TRANSLATE_MODELS[modelIndex] || TRANSLATE_MODEL;
    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a translation engine. Return only valid JSON. Do not include commentary or Markdown.',
        },
        {
          role: 'user',
          content: `Translate the following strings into ${languageLabel}. Return a JSON array of strings in the same order.\n\n${JSON.stringify(texts)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    };

    let res;
    try {
      res = await fetchWithTimeout(
        GITHUB_MODELS_ENDPOINT,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${MODELS_TOKEN}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        },
        REQUEST_TIMEOUT_MS
      );
    } catch (err) {
      const isLastAttempt = attempt >= totalAttempts - 1;
      if (isLastAttempt) {
        throw new Error(`translate_network_error: ${err?.name || 'unknown_error'}`);
      }

      const delayMs = getRetryDelayMs(null, attempt);
      console.log(`GitHub Models request error (${err?.name || 'unknown'}) on ${model}. Retry ${attempt + 1}/${totalAttempts} in ${delayMs}ms.`);
      await sleep(delayMs);
      continue;
    }

    let bodyText = '';
    try {
      bodyText = await withTimeout(res.text(), REQUEST_TIMEOUT_MS, 'models_body_text');
    } catch (err) {
      const isLastAttempt = attempt >= totalAttempts - 1;
      if (isLastAttempt) {
        throw new Error(`translate_response_error: ${err?.message || err?.name || 'unknown_error'}`);
      }

      const delayMs = getRetryDelayMs(res, attempt);
      console.log(
        `GitHub Models response read error (${err?.message || err?.name || 'unknown'}) on ${model}. Retry ${attempt + 1}/${totalAttempts} in ${delayMs}ms.`
      );
      await sleep(delayMs);
      continue;
    }

    let data = null;
    if (bodyText) {
      try {
        data = JSON.parse(bodyText);
      } catch {
        data = null;
      }
    }

    if (res.ok) {
      const content = data?.choices?.[0]?.message?.content || bodyText;
      const parsed = parseJsonArray(content);
      if (!parsed || parsed.length !== texts.length) {
        const isLastAttempt = attempt >= totalAttempts - 1;
        if (isLastAttempt) {
          throw new Error('translate_invalid_response');
        }

        const delayMs = getRetryDelayMs(res, attempt);
        console.log(
          `GitHub Models returned invalid translation payload on ${model}. Retry ${attempt + 1}/${totalAttempts} in ${delayMs}ms.`
        );
        await sleep(delayMs);
        continue;
      }
      return parsed.map((item, i) => String(item ?? texts[i] ?? ''));
    }

    const isRetriable = res.status === 429 || (res.status >= 500 && res.status < 600);
    const isLastAttempt = attempt >= totalAttempts - 1;
    if (!isRetriable || isLastAttempt) {
      const details = typeof data === 'object' && data
        ? JSON.stringify(data).slice(0, 500)
        : String(bodyText || '').slice(0, 500);
      throw new Error(`translate_http_${res.status}${details ? `: ${details}` : ''}`);
    }

    const hasAnotherModel = modelSlot < modelCount - 1;
    const delayMs = hasAnotherModel ? 250 : getRetryDelayMs(res, attempt);
    const modeText = hasAnotherModel ? 'switching model' : 'backing off';
    console.log(
      `GitHub Models throttled (HTTP ${res.status}) on ${model}. Retry ${attempt + 1}/${totalAttempts} in ${delayMs}ms (${modeText}).`
    );
    await sleep(delayMs);
  }

  throw new Error('translate_unexpected_retry_exit');
}

async function githubModelsTranslateBatchAdaptive({ texts, lang, modelStartIndex = 0 }) {
  try {
    return await githubModelsTranslateBatch({ texts, lang, modelStartIndex });
  } catch (err) {
    const message = String(err?.message || '');
    const isRateLimited = message.includes('translate_http_429');
    if (!isRateLimited || texts.length <= 1) {
      throw err;
    }

    const mid = Math.floor(texts.length / 2);
    const left = texts.slice(0, mid);
    const right = texts.slice(mid);
    console.log(`Splitting ${texts.length}-item batch after repeated 429 for ${lang}.`);

    const leftOut = await githubModelsTranslateBatchAdaptive({ texts: left, lang, modelStartIndex });
    if (TRANSLATE_REQUEST_SPACING_MS > 0) await sleep(TRANSLATE_REQUEST_SPACING_MS);
    const rightOut = await githubModelsTranslateBatchAdaptive({ texts: right, lang, modelStartIndex: (modelStartIndex + 1) % Math.max(1, TRANSLATE_MODELS.length) });
    return [...leftOut, ...rightOut];
  }
}

async function githubModelsTranslateMany({ texts, to }) {
  if (!hasTranslatorConfigured()) throw new Error('translator_not_configured');
  if (!Array.isArray(texts) || !texts.length) return new Map();
  if (!Array.isArray(to) || !to.length) return new Map();

  const out = new Map();

  for (let langIndex = 0; langIndex < to.length; langIndex++) {
    const lang = to[langIndex];
    const batches = chunkArray(texts, TRANSLATE_BATCH_SIZE);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const modelStartIndex = (langIndex + batchIndex) % Math.max(1, TRANSLATE_MODELS.length);
      const translations = await githubModelsTranslateBatchAdaptive({ texts: batch, lang, modelStartIndex });
      for (let i = 0; i < batch.length; i++) {
        const src = String(batch[i] || '');
        if (!out.has(src)) out.set(src, {});
        const perLang = out.get(src);
        perLang[lang] = String(translations[i] || src);
      }
      if (TRANSLATE_REQUEST_SPACING_MS > 0) await sleep(TRANSLATE_REQUEST_SPACING_MS);
    }
  }

  return out;
}

async function embedBuildTimeTranslations(repos) {
  if (!TRANSLATE_TO.length) {
    if (REQUIRE_TRANSLATIONS) throw new Error('translate_to_empty');
    return repos;
  }
  if (!hasTranslatorConfigured()) {
    if (REQUIRE_TRANSLATIONS) throw new Error('translator_not_configured');
    return repos;
  }

  const translationMap = await loadPublishedTranslationCache();
  const missingTexts = new Set();

  for (const r of repos) {
    const title = String(r?.title || r?.name || '').trim();
    if (title && !hasAllLangTranslations(translationMap.get(title), TRANSLATE_TO)) {
      missingTexts.add(title);
    }

    const desc = String(r?.description || '').trim();
    if (desc && !hasAllLangTranslations(translationMap.get(desc), TRANSLATE_TO)) {
      missingTexts.add(desc);
    }

    const topics = Array.isArray(r?.topics) ? r.topics : [];
    for (const t of topics) {
      const s = String(t || '').trim();
      if (s && !hasAllLangTranslations(translationMap.get(s), TRANSLATE_TO)) {
        missingTexts.add(s);
      }
    }
  }

  const textsToTranslate = Array.from(missingTexts);
  if (textsToTranslate.length) {
    console.log(`Translating ${textsToTranslate.length} missing texts to: ${TRANSLATE_TO.join(', ')}`);
    const generatedMap = await githubModelsTranslateMany({ texts: textsToTranslate, to: TRANSLATE_TO });

    for (const [src, perLang] of generatedMap.entries()) {
      if (!translationMap.has(src)) translationMap.set(src, {});
      Object.assign(translationMap.get(src), perLang);
    }
  } else {
    console.log('Using published translation cache for all texts; no model requests required.');
  }

  return repos.map((r) => {
    const title = String(r?.title || r?.name || '').trim();
    const desc = String(r?.description || '').trim();
    const topics = Array.isArray(r?.topics) ? r.topics : [];

    const i18n = {};
    for (const lang of TRANSLATE_TO) {
      const translatedTitle = title ? translationMap.get(title)?.[lang] || '' : '';
      const translatedDesc = desc ? translationMap.get(desc)?.[lang] || '' : '';
      const translatedTopics = topics.map((t) => {
        const s = String(t || '').trim();
        return s ? translationMap.get(s)?.[lang] || s : s;
      });
      i18n[lang] = {
        title: translatedTitle || title,
        description: translatedDesc || desc,
        topics: translatedTopics,
      };
    }

    return { ...r, i18n };
  });
}

async function main() {
  const repos = await fetchPaged(
    `https://api.github.com/orgs/${encodeURIComponent(ORG_NAME)}/repos?per_page=100&type=public&sort=pushed`
  );

  // Best-effort: extract first README image for each repo.
  // (This keeps UX lightweight while providing a quick visual hint.)
  /** @type {{repo:string, tokens:string[]}[]} */
  const tokenDocs = [];

  const enriched = await mapWithConcurrency(repos, 6, async (r) => {
    const repo = r?.name;
    const branch = r?.default_branch || 'main';
    if (!repo) return r;

    try {
      const readme = await fetchReadme({ org: ORG_NAME, repo });
      if (readme?.content) {
        const readmeTitle = extractReadmeTitle(readme.content);
        const text = stripMarkdownToText(readme.content);
        const tokens = tokenizeText(text);
        tokenDocs.push({ repo, tokens });

        const imageRef = extractFirstImageRef(readme.content);
        if (imageRef) {
          const imageUrl = resolveReadmeImageUrl({
            org: ORG_NAME,
            repo,
            branch,
            readmePath: readme.path,
            imageRef,
          });
          return { ...r, imageUrl, title: readmeTitle || r?.name || '' };
        }

        if (readmeTitle) return { ...r, title: readmeTitle };
      }

      return r;
    } catch {
      return r;
    }
  });

  // Build document frequency for TF-IDF across all repos that had a README.
  const df = new Map();
  const docCount = tokenDocs.length || 1;
  for (const doc of tokenDocs) {
    const unique = new Set(doc.tokens);
    for (const t of unique) df.set(t, (df.get(t) || 0) + 1);
  }

  const tokensByRepo = new Map(tokenDocs.map((d) => [d.repo, d.tokens]));
  const enrichedWithKeywords = enriched.map((r) => {
    const repo = r?.name;
    if (!repo) return r;

    const readmeTokens = tokensByRepo.get(repo) || [];
    const descTokens = tokenizeText(r?.description || '');
    const topicTokens = Array.isArray(r?.topics) ? r.topics.map((t) => String(t || '').toLowerCase()) : [];
    const allTokens = [...readmeTokens, ...descTokens, ...topicTokens];

    if (!allTokens.length) return r;

    const tf = buildTf(allTokens);
    const scored = [];
    for (const [term, count] of tf.entries()) {
      const d = df.get(term) || 1;
      const idf = Math.log((docCount + 1) / (d + 1));
      const score = count * (0.5 + idf);
      scored.push([term, score]);
    }

    scored.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const keywords = mergeUniquePreserveOrder(scored.map(([t]) => t), 12);
    const categories = mergeUniquePreserveOrder(keywords, 6);

    return { ...r, keywords, categories };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    org: ORG_NAME,
    repos: await embedBuildTimeTranslations(enrichedWithKeywords.map(toRepoModel)),
  };

  const outPath = path.join(process.cwd(), 'docs', 'catalog.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  console.log(`Wrote ${payload.repos.length} repos to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
