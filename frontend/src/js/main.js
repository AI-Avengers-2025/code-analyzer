import { showToast } from "./toast.js";
import { BASE_URL } from "../config.js";
import {loadRepo} from "./repoLoader.js";

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

document.getElementById("goToCodeBtn").addEventListener("click", async () => {
  const repoUrl = document.getElementById("repoUrl").value.trim();
  if (!repoUrl) return showToast("Please enter a GitHub repository URL");

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return showToast("Invalid GitHub repo URL");

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");

  sessionStorage.setItem("repoOwner", owner);
  sessionStorage.setItem("repoName", repo);

  document.getElementById('code-section').classList.remove('hidden');

  document.getElementById("summaryContent").innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; padding:20px;">
      <div class="loader"></div>
      <span style="margin-left:10px;">Loading repository summary...</span>
    </div>
  `;

  document.getElementById("no-repo-loaded-msg").classList.add('hidden');

  try {
    await nonTechnicalSummary(repoUrl);

    const res = await fetch(`${BASE_URL}/api/repo/${owner}/${repo}/summary`);
    const data = await res.json();

    if (data.error) {
      document.getElementById(
        "summaryContent"
      ).innerHTML = `<p style="color:red">Error: ${data.error}</p>`;
      return;
    }

    document.getElementById('repoSummary').classList.remove('hidden');
    document.getElementById('code-section').classList.remove('hidden');
    document.getElementById('explorer').classList.remove('hidden');
    document.getElementById('viewer').classList.remove('hidden');
    document.getElementById('analysis').classList.remove('hidden');

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

    const fileContainer = document.getElementById("fileList");

    if (owner && repo) {
      await loadRepo(owner, repo, fileContainer);
    }
  } catch (err) {
    showToast("Failed to fetch repository summary");
    console.error(err);
  }
});

async function nonTechnicalSummary(repoUrl) {
  const githubUrl = repoUrl.replace(".git", "");

  document.getElementById('progress-container').classList.remove('hidden');

  const endpointUrl = `${BASE_URL}/api/summary?githubUrl=${encodeURIComponent(githubUrl)}`;

  const eventSource = new EventSource(endpointUrl);

  eventSource.onopen = (event) => {
    console.log("Connection to server opened.");
    updateUIStatus('Starting summarization...');
  };

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.status === 'progress') {
      console.log(`Progress: ${data.message}`);
      updateUIProgress(data.current, data.total);
    } else if (data.status === 'generating_final_summary' || data.status === 'started') {
      console.log(data.message);
      updateUIStatus(data.message);
    } else if (data.status === 'complete') {
      console.log('Final Summary:', data.finalSummary);
      updateUIStatus('Summarization complete!');
      displayFinalSummary(data.finalSummary);
      eventSource.close();
    }
  };

  eventSource.onerror = (error) => {
    console.error('EventSource failed:', error);
    updateUIStatus('An error occurred during summarization.');
    eventSource.close();
  };
}

function updateUIStatus(message) {
  document.getElementById('status-message').textContent = message;
}

function updateUIProgress(current, total) {
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const percentage = (current / total) * 100;

  progressBar.style.width = `${percentage}%`;
  progressText.textContent = `${current}/${total} files processed`;
}

function displayFinalSummary(summary) {
  document.getElementById('progress-bar').classList.add('hidden');
  document.getElementById('progress-text').classList.add('hidden');

  const overallAnalysis = document.getElementById('overallAnalysis');
  const overallAnalysisContent = document.getElementById('analysisContent');

  const collapsibleButton = document.getElementById("collapsible");

  collapsibleButton.classList.remove('hidden');

  collapsibleButton.addEventListener("click", function() {
    this.classList.toggle("active");
    if (overallAnalysis.style.display === "block") {
      overallAnalysis.style.display = "none";
    } else {
      overallAnalysis.style.display = "block";
      overallAnalysis.classList.remove('hidden');
      overallAnalysisContent.classList.remove('hidden');
    }
  });

  overallAnalysisContent.innerHTML = marked.parse(summary);

}

