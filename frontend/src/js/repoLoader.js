import { showToast } from "./toast.js";
import { fetchAndRenderFiles } from "./fileViewer.js";

/**
 * Load repo tree from backend
 * @param {string} owner
 * @param {string} repo
 * @param {HTMLElement} container
 * @param githubToken
 */
export async function loadRepo(owner, repo, container, githubToken) {
  if (!owner || !repo) return showToast("Owner or repo not specified");

  container.innerHTML = ""; 

  try {
    await fetchAndRenderFiles(owner, repo, "", container, githubToken);
  } catch (err) {
    console.error("Error loading repository:", err);
    showToast("Failed to load repository files");
  }
}

