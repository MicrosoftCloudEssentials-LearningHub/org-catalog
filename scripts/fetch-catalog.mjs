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
  };
}

async function main() {
  const repos = await fetchPaged(
    `https://api.github.com/orgs/${encodeURIComponent(ORG_NAME)}/repos?per_page=100&type=public&sort=pushed`
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    org: ORG_NAME,
    repos: repos.map(toRepoModel),
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
