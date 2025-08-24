import { fetchRepoContents, fetchFileContent, fetchRepoSummary } from "../services/repoService.js";

export async function getRepoContents(req, res) {
  const { owner, repo } = req.params;
  const { githubToken } = req.query;

  let path = req.params[0] || "";
  if (path.startsWith("/")) path = path.slice(1);

  try {
    const data = await fetchRepoContents(owner, repo, path, githubToken);
    res.json(data);
  } catch (err) {
    console.error("Get Repo Contents Controller Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getFileContent(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing file URL" });

  try {
    const content = await fetchFileContent(url);
    res.send(content);
  } catch (err) {
    console.error("Get File Content Controller Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// New controller for repo summary
export async function getRepoSummary(req, res) {
  const { owner, repo } = req.params;
  const { githubToken } = req.query;
  try {
    const summary = await fetchRepoSummary(owner, repo, githubToken);
    res.json(summary);
  } catch (err) {
    console.error("Get Repo Summary Controller Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

