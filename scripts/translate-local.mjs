import fs from 'node:fs/promises';
import path from 'node:path';

const TRANSLATE_TO = String(process.env.TRANSLATE_TO || 'es,pt,fr,zh,ja,ko')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
  .filter((s, i, a) => a.indexOf(s) === i)
  .filter((s) => s !== 'en');

const INPUT_PATH = path.join(process.cwd(), 'docs', 'catalog.json');
const REQUEST_SPACING_MS = Math.max(0, Number.parseInt(String(process.env.LOCAL_TRANSLATE_SPACING_MS || '200'), 10) || 0);
const MAX_RETRIES = Math.max(0, Number.parseInt(String(process.env.LOCAL_TRANSLATE_MAX_RETRIES || '3'), 10) || 3);
const CONCURRENCY = Math.max(1, Number.parseInt(String(process.env.LOCAL_TRANSLATE_CONCURRENCY || '8'), 10) || 8);
const TRANSLATE_TOPICS = String(process.env.LOCAL_TRANSLATE_TOPICS || 'true').trim().toLowerCase() !== 'false';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateViaGoogle(text, lang) {
  const q = String(text || '').trim();
  if (!q) return '';

  const endpoint = new URL('https://translate.googleapis.com/translate_a/single');
  endpoint.searchParams.set('client', 'gtx');
  endpoint.searchParams.set('sl', 'en');
  endpoint.searchParams.set('tl', lang);
  endpoint.searchParams.set('dt', 't');
  endpoint.searchParams.set('q', q);

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          Accept: 'application/json,text/plain,*/*',
          'User-Agent': 'org-catalog-local-translator/1.0',
        },
      });

      if (!res.ok) {
        throw new Error(`http_${res.status}`);
      }

      const data = await res.json();
      const translated = Array.isArray(data?.[0])
        ? data[0].map((chunk) => String(chunk?.[0] || '')).join('').trim()
        : '';

      if (translated) return translated;
      return q;
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_RETRIES) break;
      await sleep(500 * (2 ** attempt));
    }
  }

  throw lastErr || new Error('translate_failed');
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => worker());
  await Promise.all(workers);
  return out;
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, 'utf8');
  const catalog = JSON.parse(raw);
  const repos = Array.isArray(catalog?.repos) ? catalog.repos : [];

  const unique = new Set();
  for (const repo of repos) {
    const title = String(repo?.title || repo?.name || '').trim();
    const desc = String(repo?.description || '').trim();
    const topics = Array.isArray(repo?.topics) ? repo.topics : [];

    if (title) unique.add(title);
    if (desc) unique.add(desc);
    if (TRANSLATE_TOPICS) {
      for (const t of topics) {
        const s = String(t || '').trim();
        if (s) unique.add(s);
      }
    }
  }

  const texts = Array.from(unique);
  const map = new Map();

  for (const lang of TRANSLATE_TO) {
    console.log(`Translating ${texts.length} texts to ${lang} locally...`);
    const translated = await mapWithConcurrency(texts, CONCURRENCY, async (text) => {
      const result = await translateViaGoogle(text, lang);
      if (REQUEST_SPACING_MS > 0) await sleep(REQUEST_SPACING_MS);
      return result;
    });

    for (let i = 0; i < texts.length; i++) {
      const src = texts[i];
      if (!map.has(src)) map.set(src, {});
      map.get(src)[lang] = translated[i] || src;
    }
  }

  catalog.repos = repos.map((repo) => {
    const title = String(repo?.title || repo?.name || '').trim();
    const desc = String(repo?.description || '').trim();
    const topics = Array.isArray(repo?.topics) ? repo.topics : [];

    const i18n = {};
    for (const lang of TRANSLATE_TO) {
      i18n[lang] = {
        title: title ? map.get(title)?.[lang] || title : '',
        description: desc ? map.get(desc)?.[lang] || desc : '',
        topics: topics.map((t) => {
          const s = String(t || '').trim();
          if (!TRANSLATE_TOPICS) return s;
          return s ? map.get(s)?.[lang] || s : s;
        }),
      };
    }

    return {
      ...repo,
      title: title || String(repo?.name || ''),
      i18n,
    };
  });

  await fs.writeFile(INPUT_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  console.log(`Wrote localized catalog with ${catalog.repos.length} repos to ${INPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
