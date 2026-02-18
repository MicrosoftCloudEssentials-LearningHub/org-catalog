import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ORG = 'MicrosoftCloudEssentials-LearningHub';
const ORG_NAME = (process.env.ORG_NAME || DEFAULT_ORG).trim();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

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
    language: r.language,
    updatedAt: r.pushed_at ?? r.updated_at,
    archived: Boolean(r.archived),
    private: Boolean(r.private),
    stargazersCount: typeof r.stargazers_count === 'number' ? r.stargazers_count : undefined,
    imageUrl: r.imageUrl ?? null,
  };
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

async function main() {
  const repos = await fetchPaged(
    `https://api.github.com/orgs/${encodeURIComponent(ORG_NAME)}/repos?per_page=100&type=public&sort=pushed`
  );

  // Best-effort: extract first README image for each repo.
  // (This keeps UX lightweight while providing a quick visual hint.)
  const enriched = await mapWithConcurrency(repos, 6, async (r) => {
    const repo = r?.name;
    const branch = r?.default_branch || 'main';
    if (!repo) return r;

    try {
      const readme = await fetchReadme({ org: ORG_NAME, repo });
      if (!readme) return r;

      const imageRef = extractFirstImageRef(readme.content);
      if (!imageRef) return r;

      const imageUrl = resolveReadmeImageUrl({
        org: ORG_NAME,
        repo,
        branch,
        readmePath: readme.path,
        imageRef,
      });

      return { ...r, imageUrl };
    } catch {
      return r;
    }
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    org: ORG_NAME,
    repos: enriched.map(toRepoModel),
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
