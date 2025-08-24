import { showToast } from "./toast.js";
import { BASE_URL } from "../config.js";

window.addEventListener("DOMContentLoaded", async () => {
  const saved = sessionStorage.getItem("repoSummary");
  if (!saved) return;

  try {
    const data = JSON.parse(saved);

    const htmlRes = await fetch("./pages/repoSummary.html");
    const summaryTemplate = await htmlRes.text();
    document.getElementById("summaryContent").innerHTML = summaryTemplate;

    document.getElementById("repo-title").textContent = `${data.owner}/${data.repo}`;
    document.getElementById("defaultBranch").textContent = data.defaultBranch;
    document.getElementById("totalFiles").textContent = data.totalFiles;
    document.getElementById("totalFolders").textContent = data.totalFolders;
    document.getElementById("branches").textContent = data.branches?.join(", ") || "";
    document.getElementById("contributors").textContent = data.contributors
      ?.map((c) => c.login)
      .join(", ") || "";
    document.getElementById("stars").textContent = data.stars;
    document.getElementById("forks").textContent = data.forks;
    document.getElementById("openIssues").textContent = data.openIssues;
    document.getElementById("license").textContent = data.license;

    document.getElementById("analysisContent").innerHTML = `<p>${data.analysis}</p>`;
  } catch (err) {
    console.error("Failed to restore summary:", err);
    sessionStorage.removeItem("repoSummary");
  }
});

document.getElementById("loadRepoBtn").addEventListener("click", async () => {
  const repoUrl = document.getElementById("repoUrl").value.trim();
  if (!repoUrl) return showToast("Please enter a GitHub repository URL");

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return showToast("Invalid GitHub repo URL");

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");

  sessionStorage.setItem("repoOwner", owner);
  sessionStorage.setItem("repoName", repo);

  document.getElementById("summaryContent").innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; padding:20px;">
      <div class="loader"></div>
      <span style="margin-left:10px;">Loading repository summary...</span>
    </div>
  `;

  try {
    const res = await fetch(`${BASE_URL}/api/repo/${owner}/${repo}/summary`);
    const data = await res.json();

    if (data.error) {
      document.getElementById(
        "summaryContent"
      ).innerHTML = `<p style="color:red">Error: ${data.error}</p>`;
      return;
    }

    const htmlRes = await fetch("./pages/repoSummary.html");
    const summaryTemplate = await htmlRes.text();
    document.getElementById("summaryContent").innerHTML = summaryTemplate;

    document.getElementById("repo-title").textContent = `${owner}/${repo}`;
    document.getElementById("defaultBranch").textContent = data.defaultBranch;
    document.getElementById("totalFiles").textContent = data.totalFiles;
    document.getElementById("totalFolders").textContent = data.totalFolders;
    document.getElementById("branches").textContent = data.branches.join(", ");
    document.getElementById("contributors").textContent = data.contributors
      .map((c) => c.login)
      .join(", ");
    document.getElementById("stars").textContent = data.stars;
    document.getElementById("forks").textContent = data.forks;
    document.getElementById("openIssues").textContent = data.openIssues;
    document.getElementById("license").textContent = data.license;

    document.getElementById(
      "analysisContent"
    ).innerHTML = `<p>(Overall repo analysis placeholder)</p>`;

    sessionStorage.setItem(
      "repoSummary",
      JSON.stringify({
        owner,
        repo,
        ...data,
        analysis: "(Overall repo analysis placeholder)",
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
