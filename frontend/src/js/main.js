import { loadRepo } from "./repoLoader.js";

document.getElementById("loadRepoBtn").addEventListener("click", async () => {
  const repoUrl = document.getElementById("repoUrl").value.trim();
  await loadRepo(repoUrl);
});
