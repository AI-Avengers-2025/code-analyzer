import { showToast } from "./toast.js";
import { fetchAndRenderFiles } from "./fileViewer.js";

export async function loadRepo(repoUrl) {
  if (!repoUrl) return showToast("Please enter a GitHub repository URL");

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return showToast("Invalid GitHub repo URL");

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");

  const fileListContainer = document.getElementById("fileList");
  fileListContainer.innerHTML = "";

  await fetchAndRenderFiles(owner, repo, "", fileListContainer);
}
