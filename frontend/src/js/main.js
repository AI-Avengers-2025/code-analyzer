
import { showToast } from "./toast.js";
import { BASE_URL } from "../config.js";

document.getElementById("loadRepoBtn").addEventListener("click", async () => {
  const repoUrl = document.getElementById("repoUrl").value.trim();
  if (!repoUrl) return showToast("Please enter a GitHub repository URL");

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return showToast("Invalid GitHub repo URL");

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");

  sessionStorage.setItem("repoOwner", owner);
  sessionStorage.setItem("repoName", repo);

  try {
    const res = await fetch(`${BASE_URL}/api/repo/${owner}/${repo}`);
    const data = await res.json();

    const summaryHTML = `
      <p>Repo: <strong>${owner}/${repo}</strong></p>
      <p>Total files/folders: ${data.length}</p>
    `;
    document.getElementById("summaryContent").innerHTML = summaryHTML;
    document.getElementById("analysisContent").innerHTML =
      `<p>(Overall repo analysis placeholder)</p>`;

    localStorage.setItem(
      "repoSummary",
      JSON.stringify({
        owner,
        repo,
        totalFiles: data.length,
        analysis: "(Overall repo analysis placeholder)"
      })
    );

  } catch (err) {
    showToast("Failed to fetch repository summary");
    console.error(err);
  }
});

document.getElementById("goToCodeBtn").addEventListener("click", () => {
  window.location.href = "./pages/codeView.html";
});