import { showToast } from "./toast.js";
import { fetchAndRenderFiles } from "./fileViewer.js";

/**
 * Load repo tree from backend
 * @param {string} owner
 * @param {string} repo
 * @param {HTMLElement} container 
 */
export async function loadRepo(owner, repo, container) {
  if (!owner || !repo) return showToast("Owner or repo not specified");

  container.innerHTML = ""; 

  try {
    await fetchAndRenderFiles(owner, repo, "", container);
  } catch (err) {
    console.error("Error loading repository:", err);
    showToast("Failed to load repository files");
  }
}

