import fs from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`\nOrg catalog generator\n\nEnv vars:\n  ORG_NAME                       GitHub org to index\n  GITHUB_TOKEN                   Optional GitHub token (higher rate limits)\n\nOptional: build-time translations (no runtime backend)\n  AZURE_TRANSLATOR_KEY           Azure AI Translator key\n  AZURE_TRANSLATOR_REGION        Azure region (e.g. eastus)\n  AZURE_TRANSLATOR_ENDPOINT      Optional (default: https://api.cognitive.microsofttranslator.com)\n  TRANSLATE_TO                   Optional comma list (default: es,pt,fr)\n\nUsage:\n  node scripts/fetch-catalog.mjs\n`);
  process.exit(0);
}

const DEFAULT_ORG = 'MicrosoftCloudEssentials-LearningHub';
const ORG_NAME = (process.env.ORG_NAME || DEFAULT_ORG).trim();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const AZURE_TRANSLATOR_KEY = String(process.env.AZURE_TRANSLATOR_KEY || '').trim();
const AZURE_TRANSLATOR_REGION = String(process.env.AZURE_TRANSLATOR_REGION || '').trim();
const AZURE_TRANSLATOR_ENDPOINT = String(
  process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com'
).trim().replace(/\/$/, '');

const TRANSLATE_TO = String(process.env.TRANSLATE_TO || 'es,pt,fr')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
  .filter((s, i, a) => a.indexOf(s) === i)
  .filter((s) => s !== 'en');

const TRANSLATE_BATCH_SIZE = 50;

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
    const res = await fetch(nextUrl, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error: HTTP ${res.status}. ${text}`);
    }

    const page = await res.json();
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
    imageUrl: r.imageUrl ?? null,
  };
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
  const res = await fetch(url, { headers });
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
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

function hasTranslatorConfigured() {
  return Boolean(AZURE_TRANSLATOR_KEY && AZURE_TRANSLATOR_REGION);
}

async function azureTranslateMany({ texts, to }) {
  if (!hasTranslatorConfigured()) throw new Error('translator_not_configured');
  if (!Array.isArray(texts) || !texts.length) return new Map();
  if (!Array.isArray(to) || !to.length) return new Map();

  const out = new Map();
  const baseUrl = `${AZURE_TRANSLATOR_ENDPOINT}/translate?api-version=3.0`;
  const url = `${baseUrl}${to.map((l) => `&to=${encodeURIComponent(l)}`).join('')}`;

  for (const batch of chunkArray(texts, TRANSLATE_BATCH_SIZE)) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION,
      },
      body: JSON.stringify(batch.map((t) => ({ Text: String(t || '') }))),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) {
      const details = typeof data === 'object' && data ? JSON.stringify(data).slice(0, 500) : '';
      throw new Error(`translate_http_${res.status}${details ? `: ${details}` : ''}`);
    }

    for (let i = 0; i < batch.length; i++) {
      const src = String(batch[i] || '');
      const item = data[i];
      const translations = Array.isArray(item?.translations) ? item.translations : [];
      const perLang = {};
      for (const tr of translations) {
        const lang = String(tr?.to || '').toLowerCase();
        const text = String(tr?.text || '');
        if (lang && text) perLang[lang] = text;
      }
      out.set(src, perLang);
    }
  }

  return out;
}

async function embedBuildTimeTranslations(repos) {
  if (!hasTranslatorConfigured()) return repos;
  if (!TRANSLATE_TO.length) return repos;

  const unique = new Set();
  for (const r of repos) {
    const desc = String(r?.description || '').trim();
    if (desc) unique.add(desc);

    const topics = Array.isArray(r?.topics) ? r.topics : [];
    for (const t of topics) {
      const s = String(t || '').trim();
      if (s) unique.add(s);
    }
  }

  const texts = Array.from(unique);
  if (!texts.length) return repos;

  console.log(`Translating ${texts.length} unique texts to: ${TRANSLATE_TO.join(', ')}`);
  const map = await azureTranslateMany({ texts, to: TRANSLATE_TO });

  return repos.map((r) => {
    const desc = String(r?.description || '').trim();
    const topics = Array.isArray(r?.topics) ? r.topics : [];

    const i18n = {};
    for (const lang of TRANSLATE_TO) {
      const translatedDesc = desc ? map.get(desc)?.[lang] || '' : '';
      const translatedTopics = topics.map((t) => {
        const s = String(t || '').trim();
        return s ? map.get(s)?.[lang] || s : s;
      });
      i18n[lang] = {
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
          return { ...r, imageUrl };
        }
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
