import { showToast } from "./toast.js";
import { loadRepo } from "./repoLoader.js";

const owner = sessionStorage.getItem("repoOwner");
const repo = sessionStorage.getItem("repoName");
const githubToken = sessionStorage.getItem("githubToken") || '';
const fileContainer = document.getElementById("fileList");

console.log("Owner:", owner, "Repo:", repo, "Container:", fileContainer);


if (owner && repo) {
  loadRepo(owner, repo, fileContainer, githubToken);
} else {
  showToast("No repository selected. Go back and load a repository first.");
}


