import { showToast } from './toast.js';
import { BASE_URL } from "../config.js";

const DEBUG_HIGHLIGHT =
  (typeof window !== "undefined" && window.DEBUG_HIGHLIGHT) || false;

export async function fetchAndRenderFiles(owner, repo, path, container, githubToken) {
  const apiUrl = `http://localhost:4000/api/repo/${owner}/${repo}/${encodeURIComponent(
    path
  )}${githubToken ? `?githubToken=${githubToken}`: ''}`;
  try {
    const res = await fetch(apiUrl);
    const files = await res.json();
    if (!Array.isArray(files))
      return showToast("Could not fetch repo files (maybe private repo?)");
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
          if (nestedUl.childElementCount === 0)
            await fetchAndRenderFiles(owner, repo, file.path, nestedUl, githubToken);
          nestedUl.classList.toggle("hidden");
        });
      } else if (file.type === 'file') {
        span.addEventListener('click', () => loadFile(repo, file));
        li.appendChild(span);
      }
      container.appendChild(li);
    });
  } catch (err) {
    console.error("Error fetching files:", err);
    showToast("Error fetching files from backend");
  }
}

export async function loadFile(repoName, file) {
  try {
    if (!file.download_url) {
      document.getElementById("fileContent").textContent =
        "// Cannot preview this file";
      document.getElementById("analysisResults").innerHTML =
        "<p>No analysis available.</p>";
      return;
    }
    const res = await fetch(`${BASE_URL}/api/repo/file?url=${encodeURIComponent(file.download_url)}`);
    if (!res.ok) throw new Error('File fetch failed');
    const content = await res.text();
    const normalizedContent = String(content)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    await renderFilePerLine(normalizedContent);
    const analysisEl = document.getElementById("analysisResults");
    analysisEl.innerHTML = `<div class="analysis-loading"><p><strong>${escapeHtml(
      file.name
    )}</strong> loaded.</p><span>Analyzing...</span><span class="spinner" aria-hidden="true"></span></div>`;
    try {
      const analyzeRes = await fetch(`${BASE_URL}/api/analysis/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: file.path || file.name, fileContent: normalizedContent, language: 'auto', callGemini: true })
      });
      if (!analyzeRes.ok) {
        const txt = await analyzeRes.text();
        throw new Error(`Analyze failed: ${analyzeRes.status} ${txt}`);
      }
      const payload = await analyzeRes.json();
      let analysisObj = null;
      if (payload?.analysis?.json) analysisObj = payload.analysis.json;
      else if (payload?.analysis?.parsed) analysisObj = payload.analysis.parsed;
      else if (payload?.analysis) analysisObj = payload.analysis;
      else if (payload?.geminiResponse?.parsed)
        analysisObj = payload.geminiResponse.parsed;
      else if (payload?.geminiResponse?.raw)
        analysisObj = payload.geminiResponse.raw;
      payload._originalContent = normalizedContent;
      renderAnalysis(analysisEl, analysisObj, payload);
    } catch (analysisErr) {
      console.error("Analysis error:", analysisErr);
      analysisEl.innerHTML = `<p style="color:orange;">Analysis failed: ${escapeHtml(
        String(analysisErr.message || analysisErr)
      )}</p>`;
    }

    await retrieveNonTechnicalSummary(repoName, file.path, normalizedContent)
  } catch (err) {
    console.error("Error loading file:", err);
    document.getElementById(
      "analysisResults"
    ).innerHTML = `<p style="color:red;">Error loading ${file.name}</p>`;
    document.getElementById("fileContent").textContent =
      "// Could not load file";
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderAnalysis(container, analysisObj, fullPayload) {
  if (!analysisObj) {
    const rawText =
      fullPayload?.geminiResponse?.text || fullPayload?.analysis?.text || null;
    if (rawText) {
      container.innerHTML = `
        <h3>Raw analysis output</h3>
        <pre style="white-space:pre-wrap;max-height:300px;overflow:auto;">${escapeHtml(
          rawText
        )}</pre>
      `;
      return;
    }
    container.innerHTML = "<p>No analysis available.</p>";
    return;
  }
  const filePath = analysisObj.filePath || "";
  const language = analysisObj.language || analysisObj.inferredLanguage || "";
  const fileSummary = analysisObj.fileSummary || {};
  const fileAnalysis = analysisObj.fileAnalysis || {};
  const symbols = Array.isArray(analysisObj.symbols) ? analysisObj.symbols : [];
  const summaryHtml = `
    <div class="analysis-header">
      <h3>${escapeHtml(filePath || "File")}</h3>
      <p><strong>Language:</strong> ${escapeHtml(language)}</p>
      <p>${escapeHtml(
        fileSummary.shortDescription || fileSummary.purpose || ""
      )}</p>
    </div>
  `;
  const analysisHtml = `
    <div class="analysis-body">
      <h4>Analysis</h4>
      <p>${escapeHtml(fileAnalysis || '')}</p>
    </div>
  `;
  const symbolsWrapper = document.createElement("div");
  symbolsWrapper.className = "analysis-symbols";
  const symbolsHeader = document.createElement("h4");
  symbolsHeader.textContent = "Symbols";
  symbolsWrapper.appendChild(symbolsHeader);
  if (symbols.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No symbols found.";
    symbolsWrapper.appendChild(p);
  } else {
    const ul = document.createElement("ul");
    symbols.forEach((sym, idx) => {
      try {
        if (DEBUG_HIGHLIGHT) console.debug("ANALYSIS SYMBOL", idx, sym);
      } catch (e) {}
      const rawParams = Array.isArray(sym.params) ? sym.params : [];
      const paramsList = rawParams
        .map((p) => {
          if (!p) return null;
          if (typeof p === "string")
            return {
              name: p,
              inferredType: null,
              typeConfidence: null,
              description: "",
            };
          const inferredType =
            p.inferredType || p.type || p.inferred_type || null;
          const typeConfidence =
            typeof p.typeConfidence === "number"
              ? p.typeConfidence
              : typeof p.confidence === "number"
              ? p.confidence
              : typeof p.confidence === "string"
              ? parseFloat(p.confidence)
              : null;
          return {
            name: p.name || p.param || "",
            inferredType,
            typeConfidence,
            description: p.description || p.desc || "",
          };
        })
        .filter(Boolean);
      function inferParamType(name, symObj, originalContent) {
        if (!name) return null;
        const s = String(symObj.snippet || "");
        const tsMatch = s.match(
          new RegExp(name + "\\s*:\\s*([A-Za-z0-9_<>" + "\\[\\]\\\\.|]+)")
        );
        if (tsMatch) return tsMatch[1];
        const defMatch = s.match(new RegExp(name + "\\s*=\\s*([^,)+\\)]*)"));
        if (defMatch) {
          const dv = defMatch[1].trim();
          if (/^["'`]/.test(dv)) return "string";
          if (/^\d+$/.test(dv) || /^\d+\.\d+$/.test(dv)) return "number";
          if (/^\[/.test(dv)) return "Array";
          if (/^\{/.test(dv)) return "object";
          if (/^(true|false)$/.test(dv)) return "boolean";
          if (/^null$/.test(dv)) return "null";
        }
        if (name === "req" || name === "request") return "Request";
        if (name === "res" || name === "response") return "Response";
        if (name === "cb" || name === "callback" || name === "next")
          return "Function";
        if (originalContent) {
          const usageRe = new RegExp(name + "\\s*\\.\\s*([A-Za-z0-9_]+)", "g");
          if (usageRe.test(originalContent)) return "object";
          const callRe = new RegExp(name + "\\s*\\(");
          if (callRe.test(originalContent)) return "Function";
        }
        return null;
      }
      const originalContent = fullPayload?._originalContent || null;
      const paramsHtml = paramsList.length
        ? paramsList
            .map((p) => {
              if (!p.inferredType) {
                const inferred = inferParamType(p.name, sym, originalContent);
                if (inferred) p.inferredType = inferred;
              }
              const typePart = p.inferredType
                ? `: <code>${escapeHtml(p.inferredType)}</code>`
                : "";
              const descPart = p.description
                ? ` - ${escapeHtml(p.description)}`
                : "";
              return `<div class="param"><code>${escapeHtml(
                p.name
              )}</code>${typePart}${descPart}</div>`;
            })
            .join("")
        : '<div class="param"><em>none</em></div>';
      const kindStr = String(sym.kind || sym.type || "").toLowerCase();
      const isFunctionLike =
        kindStr.includes("function") ||
        kindStr.includes("method") ||
        kindStr.includes("constructor");
      const hasParams = paramsList.length > 0;
      const showParamsSummary = hasParams || isFunctionLike;
      let returnTypeHtml = "";
      if (sym.returnType) {
        const returnLabel = isFunctionLike ? "Returns" : "Type";
        if (typeof sym.returnType === "string") {
          returnTypeHtml = `<div class="return"><strong>${escapeHtml(
            returnLabel + ":"
          )}</strong> ${escapeHtml(sym.returnType)}</div>`;
        } else if (typeof sym.returnType === "object") {
          const rt = sym.returnType.type || sym.returnType.name || null;
          returnTypeHtml = `<div class="return"><strong>${escapeHtml(
            returnLabel + ":"
          )}</strong> ${escapeHtml(String(rt || "unknown"))}</div>`;
        }
      }
      const returnBlockHtml = returnTypeHtml
        ? `<div class="symbol-returns">${returnTypeHtml
            .replace(/<div class="return">/, "")
            .replace(/<\/div>/, "")}</div>`
        : "";
      const suggestions = (sym.suggestions || [])
        .map((s) => {
          if (typeof s === "string") return `<li>${escapeHtml(s)}</li>`;
          if (s && typeof s === "object") {
            const text =
              s.text ||
              s.title ||
              s.description ||
              s.message ||
              s.detail ||
              s.explanation ||
              JSON.stringify(s);
            return `<li>${escapeHtml(String(text))}</li>`;
          }
          return `<li>${escapeHtml(String(s))}</li>`;
        })
        .join("");
      const startAttr = sym.startLine ? String(sym.startLine) : "";
      const endAttr = sym.endLine ? String(sym.endLine) : startAttr;
      const compactParams = showParamsSummary
        ? paramsList
            .map(
              (p) =>
                `${escapeHtml(p.name)}${
                  p.inferredType || p.type
                    ? ": " + escapeHtml(p.inferredType || p.type)
                    : ""
                }`
            )
            .join(", ")
        : "";
      const snippetAttr = encodeURIComponent(sym.snippet || "");
      const li = document.createElement("li");
      const header = document.createElement("div");
      header.className = "symbol-header";
      const strong = document.createElement("strong");
      strong.innerHTML = escapeHtml(sym.name || "symbol" + idx);
      const em = document.createElement("em");
      em.innerHTML = escapeHtml(sym.kind || sym.type || "");
      header.appendChild(strong);
      header.appendChild(document.createTextNode(" "));
      header.appendChild(em);
      li.appendChild(header);
      if (returnBlockHtml) {
        const rb = document.createElement("div");
        rb.className = "symbol-returns";
        rb.innerHTML = returnBlockHtml
          .replace(/<div class="return">/, "")
          .replace(/<\/div>/, "");
        li.appendChild(rb);
      }
      const desc = document.createElement("div");
      desc.className = "symbol-desc";
      desc.innerHTML = escapeHtml(sym.shortDescription || "");
      li.appendChild(desc);
      const meta = document.createElement("div");
      meta.className = "symbol-meta";
      meta.style.display = "none";
      const metaParams = document.createElement("div");
      metaParams.className = "meta-params";
      metaParams.innerHTML = paramsHtml;
      meta.appendChild(metaParams);
      if (returnTypeHtml) {
        const rtWrap = document.createElement("div");
        rtWrap.innerHTML = returnTypeHtml;
        meta.appendChild(rtWrap);
      }
      li.appendChild(meta);
      if (compactParams) {
        const pc = document.createElement("div");
        pc.className = "params-compact";
        pc.innerHTML = `<small>params: ${compactParams}</small>`;
        li.appendChild(pc);
      }
      const btnWrap = document.createElement("div");
      const btn = document.createElement("button");
      btn.className = "jump-to-line";
      if (startAttr) btn.setAttribute("data-start", startAttr);
      if (endAttr) btn.setAttribute("data-end", endAttr);
      if (snippetAttr) btn.setAttribute("data-snippet", snippetAttr);
      btn.textContent = "Jump to line";
      btnWrap.appendChild(btn);
      li.appendChild(btnWrap);
      if (suggestions) {
        const detailCount = Array.isArray(sym.suggestions)
          ? sym.suggestions.length
          : suggestions
          ? 1
          : 0;
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.className = "suggestions-summary";
        summary.textContent = "Suggestions";
        const badge = document.createElement("span");
        badge.className = "suggestion-badge";
        badge.textContent = String(detailCount);
        summary.appendChild(document.createTextNode(" "));
        summary.appendChild(badge);
        details.appendChild(summary);
        const ulSug = document.createElement("ul");
        (sym.suggestions || []).forEach((s) => {
          const liSug = document.createElement("li");
          if (typeof s === "string") liSug.textContent = s;
          else if (s && typeof s === "object") {
            const text =
              s.text ||
              s.title ||
              s.description ||
              s.message ||
              s.detail ||
              s.explanation ||
              JSON.stringify(s);
            liSug.textContent = String(text);
          } else {
            liSug.textContent = String(s);
          }
          ulSug.appendChild(liSug);
        });
        details.appendChild(ulSug);
        li.appendChild(details);
      }
      ul.appendChild(li);
    });
    symbolsWrapper.appendChild(ul);
  }
  container.innerHTML = summaryHtml + analysisHtml;
  container.appendChild(symbolsWrapper);
  try {
    container.dataset.original = encodeURIComponent(
      fullPayload?._originalContent || ""
    );
  } catch (e) {
    container.dataset.original = "";
  }
  container.querySelectorAll(".jump-to-line").forEach((btn) => {
    btn.addEventListener("click", () => {
      const start = parseInt(btn.getAttribute("data-start") || "1", 10) || 1;
      const end = parseInt(btn.getAttribute("data-end") || start, 10) || start;
      jumpToLine(start);
      highlightLines(start, end);
    });
  });
  wireSymbolInteractions(container);
}

function jumpToLine(lineNumber) {
  const container = document.getElementById("fileContent");
  if (!container) return;

  let target = container.querySelector(`.code-line[data-line="${lineNumber}"]`);
  let actualLine = lineNumber;

  if (!target) {
    const available = Array.from(container.querySelectorAll(".code-line"))
      .map((x) => parseInt(x.getAttribute("data-line"), 10))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    if (available.length > 0) {
      actualLine = available.reduce((closest, current) =>
        Math.abs(current - lineNumber) < Math.abs(closest - lineNumber)
          ? current
          : closest
      );
      target = container.querySelector(`.code-line[data-line="${actualLine}"]`);

      if (DEBUG_HIGHLIGHT) {
        console.debug("jumpToLine: using closest line", {
          requested: lineNumber,
          actual: actualLine,
        });
        debugOverlayLog(`jump ${lineNumber}->${actualLine}`);
      }
    }
  }

  if (target) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });

    target.classList.add("highlight");
    setTimeout(() => target.classList.remove("highlight"), 900);
  }
}

async function renderFilePerLine(content) {
  const container = document.getElementById("fileContent");
  if (!container) return;
  container.innerHTML = "";
  const lines = content.split(/\r?\n/);
  const total = lines.length;
  const CHUNK = total > 2000 ? 500 : total > 800 ? 200 : 0;
  if (!CHUNK) {
    const frag = document.createDocumentFragment();
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const line = document.createElement("div");
      line.className = "code-line";
      line.setAttribute("data-line", lineNum);
      const ln = document.createElement("span");
      ln.className = "line-number";
      ln.textContent = lineNum;
      const code = document.createElement("span");
      code.className = "line-text";
      code.innerHTML = lineText ? escapeHtml(lineText) : "\u200B";
      line.appendChild(ln);
      line.appendChild(code);
      frag.appendChild(line);
      line.onmouseenter = (e) => {
        container.querySelectorAll('.code-line.hovered').forEach(el => el.classList.remove('hovered'));
        e.target.classList.add("hovered");
      }
      line.onmouseleave = (e) => {
        e.target.classList.remove("hovered");
      }
    });
    container.appendChild(frag);
    return;
  }
  let idx = 0;
  while (idx < total) {
    const frag = document.createDocumentFragment();
    const end = Math.min(total, idx + CHUNK);
    for (let i = idx; i < end; i++) {
      const lineText = lines[i];
      const lineNum = i + 1;
      const line = document.createElement("div");
      line.className = "code-line";
      line.setAttribute("data-line", lineNum);
      const ln = document.createElement("span");
      ln.className = "line-number";
      ln.textContent = lineNum;
      const code = document.createElement("span");
      code.className = "line-text";
      code.innerHTML = lineText ? escapeHtml(lineText) : "\u200B";
      line.appendChild(ln);
      line.appendChild(code);
      frag.appendChild(line);
    }
    container.appendChild(frag);
    await new Promise((r) => requestAnimationFrame(r));
    idx = end;
  }
}

function highlightLines(start, end) {
  const container = document.getElementById("fileContent");
  if (!container) return;

  container
    .querySelectorAll(".code-line.highlight")
    .forEach((el) => el.classList.remove("highlight"));

  if (!start || !end || start > end) return;

  const startLine = Math.max(1, parseInt(start, 10));
  const endLine = Math.max(startLine, parseInt(end, 10));

  const availableLines = Array.from(container.querySelectorAll(".code-line"))
    .map((x) => parseInt(x.getAttribute("data-line"), 10))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
    let targetLine = lineNum;
    let element = container.querySelector(`.code-line[data-line="${lineNum}"]`);

    if (!element && availableLines.length > 0) {
      targetLine = availableLines.reduce((closest, current) =>
        Math.abs(current - lineNum) < Math.abs(closest - lineNum)
          ? current
          : closest
      );
      element = container.querySelector(
        `.code-line[data-line="${targetLine}"]`
      );

      if (DEBUG_HIGHLIGHT && targetLine !== lineNum) {
        console.debug(`highlightLines: line ${lineNum} -> ${targetLine}`);
      }
    }

    if (element) {
      element.classList.add("highlight");
    }
  }
}

let tooltipEl = null;
let tooltipTimeout = null;
let debugOverlayEl = null;

function ensureDebugOverlay() {
  if (!DEBUG_HIGHLIGHT) return;
  if (!debugOverlayEl) {
    debugOverlayEl = document.createElement("div");
    debugOverlayEl.style.cssText = `
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 99999;
      max-width: 320px;
      padding: 8px 10px;
      background: rgba(0,0,0,0.7);
      color: white;
      font-size: 12px;
      border-radius: 6px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      pointer-events: none;
    `;
    document.body.appendChild(debugOverlayEl);
  }
}

function debugOverlayLog(msg) {
  if (!DEBUG_HIGHLIGHT) return;
  ensureDebugOverlay();
  const now = new Date().toLocaleTimeString();
  debugOverlayEl.textContent = `${now} - ${msg}`;
}

function showSymbolTooltip(html, x, y) {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "symbol-tooltip";

    tooltipEl.style.cssText = `
      position: fixed;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      max-width: 300px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      display: none;
    `;
    document.body.appendChild(tooltipEl);
  }

  tooltipEl.innerHTML = html;
  tooltipEl.style.display = "block";

  const margin = 8;
  let left = x + 12;
  let top = y + 12;

  const rect = tooltipEl.getBoundingClientRect();
  const tooltipW = rect.width;
  const tooltipH = rect.height;

  if (left + tooltipW + margin > window.innerWidth) left = x - tooltipW - 12;
  if (top + tooltipH + margin > window.innerHeight) top = y - tooltipH - 12;
  if (left < margin) left = margin;
  if (top < margin) top = margin;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;

  requestAnimationFrame(() => {
    tooltipEl.style.opacity = "1";
  });
}

function hideSymbolTooltip() {
  if (!tooltipEl) return;

  tooltipEl.style.opacity = "0";
  setTimeout(() => {
    if (tooltipEl) {
      tooltipEl.style.display = "none";
    }
  }, 200);
}

function positionTooltip(x, y) {
  if (!tooltipEl || tooltipEl.style.display === "none") return;

  const rect = tooltipEl.getBoundingClientRect();
  const tooltipW = rect.width || 200;
  const tooltipH = rect.height || 80;
  const margin = 8;

  let left = x + 12;
  let top = y + 12;

  if (left + tooltipW + margin > window.innerWidth) left = x - tooltipW - 12;
  if (top + tooltipH + margin > window.innerHeight) top = y - tooltipH - 12;
  if (left < margin) left = margin;
  if (top < margin) top = margin;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function wireSymbolInteractions(container) {
  const symbols = container.querySelectorAll(".analysis-symbols li");

  symbols.forEach((li) => {
    const btn = li.querySelector(".jump-to-line");

    function getSymbolLineRange() {
      const start = parseInt(btn?.getAttribute("data-start") || "0", 10) || 0;
      const end = parseInt(btn?.getAttribute("data-end") || start, 10) || start;
      return { start, end };
    }

    li.addEventListener("mouseenter", (e) => {
      const { start, end } = getSymbolLineRange();
      if (start) highlightLines(start, end);
    });

    li.addEventListener("mouseleave", () => {
      highlightLines(0, 0);
    });

    if (btn) {
      btn.addEventListener("click", () => {
        const { start, end } = getSymbolLineRange();
        jumpToLine(start);
        highlightLines(start, end);
      });
    }
  });

  const codeLines =
    container.parentElement?.querySelectorAll("#fileContent .code-line") || [];

  codeLines.forEach((lineEl) => {
    const lineNum = parseInt(lineEl.getAttribute("data-line"), 10);

    lineEl.addEventListener("mouseenter", (e) => {
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
      }

      const symbolLi = Array.from(
        container.querySelectorAll(".analysis-symbols li")
      ).find((li) => {
        const btn = li.querySelector(".jump-to-line");
        const start = parseInt(btn?.getAttribute("data-start") || "0", 10);
        const end = parseInt(btn?.getAttribute("data-end") || start, 10);
        return start && lineNum >= start && lineNum <= end;
      });

      if (symbolLi) {
        symbolLi.classList.add("highlight");
        const symbolName = symbolLi.querySelector("strong")?.textContent || "";
        const desc = symbolLi.querySelector(".symbol-desc")?.textContent || "";

        tooltipTimeout = setTimeout(() => {
          showSymbolTooltip(
            `<h5>${escapeHtml(symbolName)}</h5><p>${escapeHtml(desc)}</p>`,
            e.clientX,
            e.clientY
          );
        }, 100);
      }
    });

    lineEl.addEventListener("mousemove", (e) => {
      if (tooltipEl && tooltipEl.style.display !== "none") {
        positionTooltip(e.clientX, e.clientY);
      }
    });

    lineEl.addEventListener("mouseleave", (e) => {
      const relatedTarget = e.relatedTarget;
      if (
        relatedTarget &&
        (relatedTarget === tooltipEl || tooltipEl?.contains(relatedTarget))
      ) {
        return;
      }

      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
      }

      tooltipTimeout = setTimeout(() => {
        hideSymbolTooltip();
        container
          .querySelectorAll(".analysis-symbols li")
          .forEach((li) => li.classList.remove("highlight"));
      }, 150);
    });
  });
  
  const fileContentEl = document.getElementById("fileContent");
  if (fileContentEl) {
    fileContentEl.addEventListener("scroll", () => {
      hideSymbolTooltip();
    });
  }

  window.addEventListener("scroll", hideSymbolTooltip, { passive: true });
  window.addEventListener("resize", hideSymbolTooltip);
}

async function retrieveNonTechnicalSummary(repoName, filePath, fileContents) {
  const fileSummaryContent = document.getElementById('file-summary-content');

  fileSummaryContent.innerHTML = '<p id="file-summary-content">Summarizing file...</p>';

  const response = await fetch('http://localhost:4000/api/summary/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoName, filePath, fileContents })
  });

  const nonTechnicalSummary = await response.json();

  fileSummaryContent.innerHTML = marked.parse(nonTechnicalSummary.summary);

}