import fetch from "node-fetch"; // if Node < 18; otherwise use global fetch

export async function fetchRepoContents(owner, repo, path, githubToken = undefined) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const headers = {
    "User-Agent": "Repo-Analyzer",
    Accept: "application/vnd.github.v3+json"
  };

  if (githubToken) {
    headers.Authorization = `token ${githubToken}`;
  }

  const response = await fetch(apiUrl, {headers});


  if (!response.ok) {
    throw new Error(`GitHub API failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchFileContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file content: ${response.status}`);
  }
  return response.text();
}
