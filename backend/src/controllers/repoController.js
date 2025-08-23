import { fetchRepoContents, fetchFileContent } from "../services/repoService.js";

export async function getRepoContents(req, res) {
  const { owner, repo } = req.params;

  let path = req.params[0] || "";
  if (path.startsWith("/")) path = path.slice(1);

  try {
    const data = await fetchRepoContents(owner, repo, path);
    res.json(data);
  } catch (err) {
    console.error("Controller Error:", err.message);
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
    console.error("Controller Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
