import fetch from "node-fetch";

const GITHUB_API = "https://api.github.com";

export async function fetchRepoContents(owner, repo, path) {
  const apiUrl = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;
  const response = await fetch(apiUrl, {
    headers: { "User-Agent": "Repo-Analyzer" },
  });
  if (!response.ok)
    throw new Error(`Failed to fetch file content: ${response.status}`);
  return response.json();
}

export async function fetchFileContent(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to fetch file content: ${response.status}`);
  return response.text();
}

export async function fetchRepoSummary(owner, repo) {
  const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: { "User-Agent": "Repo-Analyzer" },
  });
  if (!repoRes.ok)
    throw new Error(`GitHub repo info fetch failed: ${repoRes.status}`);
  const repoData = await repoRes.json();

  const branchesRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/branches`,
    {
      headers: { "User-Agent": "Repo-Analyzer" },
    }
  );
  const branchesData = branchesRes.ok ? await branchesRes.json() : [];

  const contribRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contributors`,
    {
      headers: { "User-Agent": "Repo-Analyzer" },
    }
  );
  const contributorsData = contribRes.ok ? await contribRes.json() : [];

  const treeRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${repoData.default_branch}?recursive=1`,
    {
      headers: { "User-Agent": "Repo-Analyzer" },
    }
  );

  let totalFiles = 0;
  let totalFolders = 0;
  if (treeRes.ok) {
    const treeData = await treeRes.json();
    totalFiles = treeData.tree.filter((item) => item.type === "blob").length; // files
    totalFolders = treeData.tree.filter((item) => item.type === "tree").length; // folders
  }

  return {
    defaultBranch: repoData.default_branch,
    totalFiles,
    totalFolders,
    branches: branchesData.map((b) => b.name),
    contributors: contributorsData.map((c) => ({
      login: c.login,
      contributions: c.contributions,
    })),
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    openIssues: repoData.open_issues_count,
    license: repoData.license?.name ?? "N/A",
  };
}
