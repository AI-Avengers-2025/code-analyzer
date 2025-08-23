import { showToast } from "./toast.js";
import { BASE_URL } from "../config.js";

export async function fetchAndRenderFiles(owner, repo, path, container) {
  const apiUrl = `${BASE_URL}/api/repo/${owner}/${repo}/${encodeURIComponent(
    path
  )}`;

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Backend fetch failed");

    const files = await res.json();

    if (!Array.isArray(files)) return showToast("Could not fetch repo files");

    files.forEach((file) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = file.name;
      span.style.cursor = "pointer";

      if (file.type === "dir") {
        span.style.fontWeight = "bold";
        const nestedUl = document.createElement("ul");
        nestedUl.classList.add("nested", "hidden");
        li.appendChild(span);
        li.appendChild(nestedUl);

        span.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (nestedUl.childElementCount === 0) {
            await fetchAndRenderFiles(owner, repo, file.path, nestedUl);
          }
          nestedUl.classList.toggle("hidden");
        });
      } else if (file.type === "file") {
        span.addEventListener("click", () => loadFile(file));
        li.appendChild(span);
      }

      container.appendChild(li);
    });
  } catch (err) {
    console.error("Error fetching files:", err);
    showToast("Error fetching files from backend");
  }
}

export async function loadFile(file) {
  try {
    if (!file.download_url) {
      document.getElementById("fileContent").textContent =
        "// Cannot preview this file";
      document.getElementById("analysisResults").innerHTML =
        "<p>No analysis available.</p>";
      return;
    }

    const res = await fetch(
      `${BASE_URL}/api/repo/file?url=${encodeURIComponent(
        file.download_url
      )}`
    );
    if (!res.ok) throw new Error("File fetch failed");

    const content = await res.text();

    document.getElementById("fileContent").textContent = content;
    document.getElementById(
      "analysisResults"
    ).innerHTML = `<p><strong>${file.name}</strong> loaded. (AI analysis disabled for now)</p>`;
  } catch (err) {
    console.error("Error loading file:", err);
    document.getElementById(
      "analysisResults"
    ).innerHTML = `<p style="color:red;">Error loading ${file.name}</p>`;
    document.getElementById("fileContent").textContent =
      "// Could not load file";
  }
}
