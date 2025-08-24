import { showToast } from './toast.js';

const DEBUG_HIGHLIGHT = (typeof window !== 'undefined' && window.DEBUG_HIGHLIGHT) || false;

export async function fetchAndRenderFiles(owner, repo, path, container) {
  const apiUrl = `http://localhost:4000/api/repo/${owner}/${repo}/${encodeURIComponent(path)}`;
  try {
    const res = await fetch(apiUrl);
    const files = await res.json();
    if (!Array.isArray(files)) return showToast('Could not fetch repo files (maybe private repo?)');
    files.forEach((file) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = file.name;
      span.style.cursor = 'pointer';
      if (file.type === 'dir') {
        span.style.fontWeight = 'bold';
        const nestedUl = document.createElement('ul');
        nestedUl.classList.add('nested', 'hidden');
        li.appendChild(span);
        li.appendChild(nestedUl);
        span.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (nestedUl.childElementCount === 0) await fetchAndRenderFiles(owner, repo, file.path, nestedUl);
          nestedUl.classList.toggle('hidden');
        });
      } else if (file.type === 'file') {
        span.addEventListener('click', () => loadFile(repo, file));
        li.appendChild(span);
      }
      container.appendChild(li);
    });
  } catch (err) {
    console.error('Error fetching files:', err);
    showToast('Error fetching files from backend');
  }
}

export async function loadFile(repoName, file) {
  try {
    if (!file.download_url) {
      document.getElementById('fileContent').textContent = '// Cannot preview this file';
      document.getElementById('analysisResults').innerHTML = '<p>No analysis available.</p>';
      return;
    }
    const res = await fetch(`http://localhost:4000/api/repo/file?url=${encodeURIComponent(file.download_url)}`);
    if (!res.ok) throw new Error('File fetch failed');
    const content = await res.text();
    const normalizedContent = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    await renderFilePerLine(normalizedContent);
    const analysisEl = document.getElementById('analysisResults');
    analysisEl.innerHTML = `<div class="analysis-loading"><p><strong>${escapeHtml(file.name)}</strong> loaded.</p><span>Analyzing...</span><span class="spinner" aria-hidden="true"></span></div>`;
    try {
      const analyzeRes = await fetch('http://localhost:4000/api/analysis/file', {
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
      else if (payload?.geminiResponse?.parsed) analysisObj = payload.geminiResponse.parsed;
      else if (payload?.geminiResponse?.raw) analysisObj = payload.geminiResponse.raw;
      payload._originalContent = normalizedContent;
      renderAnalysis(analysisEl, analysisObj, payload);
    } catch (analysisErr) {
      console.error('Analysis error:', analysisErr);
      analysisEl.innerHTML = `<p style="color:orange;">Analysis failed: ${escapeHtml(String(analysisErr.message || analysisErr))}</p>`;
    }

    await retrieveNonTechnicalSummary(repoName, file.path, normalizedContent)
  } catch (err) {
    console.error('Error loading file:', err);
    document.getElementById('analysisResults').innerHTML = `<p style="color:red;">Error loading ${file.name}</p>`;
    document.getElementById('fileContent').textContent = '// Could not load file';
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderAnalysis(container, analysisObj, fullPayload) {
  if (!analysisObj) {
    const rawText = fullPayload?.geminiResponse?.text || fullPayload?.analysis?.text || null;
    if (rawText) {
      container.innerHTML = `
        <h3>Raw analysis output</h3>
        <pre style="white-space:pre-wrap;max-height:300px;overflow:auto;">${escapeHtml(rawText)}</pre>
      `;
      return;
    }
    container.innerHTML = '<p>No analysis available.</p>';
    return;
  }
  const filePath = analysisObj.filePath || '';
  const language = analysisObj.language || analysisObj.inferredLanguage || '';
  const fileSummary = analysisObj.fileSummary || {};
  const fileAnalysis = analysisObj.fileAnalysis || {};
  const symbols = Array.isArray(analysisObj.symbols) ? analysisObj.symbols : [];
  const summaryHtml = `
    <div class="analysis-header">
      <h3>${escapeHtml(filePath || 'File')}</h3>
      <p><strong>Language:</strong> ${escapeHtml(language)}</p>
      <p>${escapeHtml(fileSummary.shortDescription || fileSummary.purpose || '')}</p>
    </div>
  `;
  const analysisHtml = `
    <div class="analysis-body">
      <h4>Analysis</h4>
      <p>${escapeHtml(fileAnalysis.responsibilities || '')}</p>
      <p>${escapeHtml(fileAnalysis.surprisingOrRiskyCode || fileAnalysis.surprising_or_risky || '')}</p>
    </div>
  `;
  const symbolsWrapper = document.createElement('div');
  symbolsWrapper.className = 'analysis-symbols';
  const symbolsHeader = document.createElement('h4');
  symbolsHeader.textContent = 'Symbols';
  symbolsWrapper.appendChild(symbolsHeader);
  if (symbols.length === 0) {
    const p = document.createElement('p'); p.textContent = 'No symbols found.'; symbolsWrapper.appendChild(p);
  } else {
    const ul = document.createElement('ul');
    symbols.forEach((sym, idx) => {
      try { if (DEBUG_HIGHLIGHT) console.debug('ANALYSIS SYMBOL', idx, sym); } catch (e) {}
      const rawParams = Array.isArray(sym.params) ? sym.params : [];
      const paramsList = rawParams.map(p => {
        if (!p) return null;
        if (typeof p === 'string') return { name: p, inferredType: null, typeConfidence: null, description: '' };
        const inferredType = p.inferredType || p.type || p.inferred_type || null;
        const typeConfidence = (typeof p.typeConfidence === 'number' ? p.typeConfidence : (typeof p.confidence === 'number' ? p.confidence : (typeof p.confidence === 'string' ? parseFloat(p.confidence) : null)));
        return { name: p.name || p.param || '', inferredType, typeConfidence, description: p.description || p.desc || '' };
      }).filter(Boolean);
      function inferParamType(name, symObj, originalContent) {
        if (!name) return null;
        const s = String(symObj.snippet || '');
        const tsMatch = s.match(new RegExp(name + '\\s*:\\s*([A-Za-z0-9_<>' + '\\[\\]\\\\.|]+)'));
        if (tsMatch) return tsMatch[1];
        const defMatch = s.match(new RegExp(name + '\\s*=\\s*([^,)+\\)]*)'));
        if (defMatch) {
          const dv = defMatch[1].trim();
          if (/^["'`]/.test(dv)) return 'string';
          if (/^\d+$/.test(dv) || /^\d+\.\d+$/.test(dv)) return 'number';
          if (/^\[/.test(dv)) return 'Array';
          if (/^\{/.test(dv)) return 'object';
          if (/^(true|false)$/.test(dv)) return 'boolean';
          if (/^null$/.test(dv)) return 'null';
        }
        if (name === 'req' || name === 'request') return 'Request';
        if (name === 'res' || name === 'response') return 'Response';
        if (name === 'cb' || name === 'callback' || name === 'next') return 'Function';
        if (originalContent) {
          const usageRe = new RegExp(name + '\\s*\\.\\s*([A-Za-z0-9_]+)', 'g');
          if (usageRe.test(originalContent)) return 'object';
          const callRe = new RegExp(name + '\\s*\\(');
          if (callRe.test(originalContent)) return 'Function';
        }
        return null;
      }
      const originalContent = fullPayload?._originalContent || null;
      const paramsHtml = paramsList.length ? paramsList.map(p => {
        if (!p.inferredType) {
          const inferred = inferParamType(p.name, sym, originalContent);
          if (inferred) p.inferredType = inferred;
        }
        const typePart = p.inferredType ? `: <code>${escapeHtml(p.inferredType)}</code>` : '';
        const descPart = p.description ? ` - ${escapeHtml(p.description)}` : '';
        return `<div class="param"><code>${escapeHtml(p.name)}</code>${typePart}${descPart}</div>`;
      }).join('') : '<div class="param"><em>none</em></div>';
      const kindStr = String(sym.kind || sym.type || '').toLowerCase();
      const isFunctionLike = kindStr.includes('function') || kindStr.includes('method') || kindStr.includes('constructor');
      const hasParams = paramsList.length > 0;
      const showParamsSummary = hasParams || isFunctionLike;
      let returnTypeHtml = '';
      if (sym.returnType) {
        const returnLabel = isFunctionLike ? 'Returns' : 'Type';
        if (typeof sym.returnType === 'string') {
          returnTypeHtml = `<div class="return"><strong>${escapeHtml(returnLabel + ':')}</strong> ${escapeHtml(sym.returnType)}</div>`;
        } else if (typeof sym.returnType === 'object') {
          const rt = sym.returnType.type || sym.returnType.name || null;
          returnTypeHtml = `<div class="return"><strong>${escapeHtml(returnLabel + ':')}</strong> ${escapeHtml(String(rt || 'unknown'))}</div>`;
        }
      }
      const returnBlockHtml = returnTypeHtml ? `<div class="symbol-returns">${returnTypeHtml.replace(/<div class="return">/, '').replace(/<\/div>/, '')}</div>` : '';
      const suggestions = (sym.suggestions || []).map(s => {
        if (typeof s === 'string') return `<li>${escapeHtml(s)}</li>`;
        if (s && typeof s === 'object') {
          const text = s.text || s.title || s.description || s.message || s.detail || s.explanation || JSON.stringify(s);
          return `<li>${escapeHtml(String(text))}</li>`;
        }
        return `<li>${escapeHtml(String(s))}</li>`;
      }).join('');
      const startAttr = sym.startLine ? String(sym.startLine) : '';
      const endAttr = sym.endLine ? String(sym.endLine) : startAttr;
      const compactParams = showParamsSummary ? paramsList.map(p => `${escapeHtml(p.name)}${(p.inferredType || p.type) ? ': ' + escapeHtml(p.inferredType || p.type) : ''}`).join(', ') : '';
      const snippetAttr = encodeURIComponent(sym.snippet || '');
      const li = document.createElement('li');
      const header = document.createElement('div'); header.className = 'symbol-header';
      const strong = document.createElement('strong'); strong.innerHTML = escapeHtml(sym.name || ('symbol' + idx));
      const em = document.createElement('em'); em.innerHTML = escapeHtml(sym.kind || sym.type || '');
      header.appendChild(strong); header.appendChild(document.createTextNode(' ')); header.appendChild(em);
      li.appendChild(header);
      if (returnBlockHtml) {
        const rb = document.createElement('div'); rb.className = 'symbol-returns'; rb.innerHTML = returnBlockHtml.replace(/<div class="return">/, '').replace(/<\/div>/, '');
        li.appendChild(rb);
      }
      const desc = document.createElement('div'); desc.className = 'symbol-desc'; desc.innerHTML = escapeHtml(sym.shortDescription || ''); li.appendChild(desc);
      const meta = document.createElement('div'); meta.className = 'symbol-meta'; meta.style.display = 'none';
      const metaParams = document.createElement('div'); metaParams.className = 'meta-params'; metaParams.innerHTML = paramsHtml; meta.appendChild(metaParams);
      if (returnTypeHtml) {
        const rtWrap = document.createElement('div'); rtWrap.innerHTML = returnTypeHtml; meta.appendChild(rtWrap);
      }
      li.appendChild(meta);
      if (compactParams) {
        const pc = document.createElement('div'); pc.className = 'params-compact'; pc.innerHTML = `<small>params: ${compactParams}</small>`; li.appendChild(pc);
      }
      const btnWrap = document.createElement('div');
      const btn = document.createElement('button'); btn.className = 'jump-to-line';
      if (startAttr) btn.setAttribute('data-start', startAttr);
      if (endAttr) btn.setAttribute('data-end', endAttr);
      if (snippetAttr) btn.setAttribute('data-snippet', snippetAttr);
      btn.textContent = 'Jump to line';
      btnWrap.appendChild(btn); li.appendChild(btnWrap);
      if (suggestions) {
        const detailCount = Array.isArray(sym.suggestions) ? sym.suggestions.length : (suggestions ? 1 : 0);
        const details = document.createElement('details');
        const summary = document.createElement('summary'); summary.className = 'suggestions-summary'; summary.textContent = 'Suggestions';
        const badge = document.createElement('span'); badge.className = 'suggestion-badge'; badge.textContent = String(detailCount);
        summary.appendChild(document.createTextNode(' ')); summary.appendChild(badge);
        details.appendChild(summary);
        const ulSug = document.createElement('ul');
        (sym.suggestions || []).forEach(s => {
          const liSug = document.createElement('li');
          if (typeof s === 'string') liSug.textContent = s;
          else if (s && typeof s === 'object') {
            const text = s.text || s.title || s.description || s.message || s.detail || s.explanation || JSON.stringify(s);
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
  try { container.dataset.original = encodeURIComponent(fullPayload?._originalContent || ''); } catch (e) { container.dataset.original = ''; }
  container.querySelectorAll('.jump-to-line').forEach(btn => {
    btn.addEventListener('click', () => {
      const start = parseInt(btn.getAttribute('data-start') || btn.getAttribute('data-line') || '1', 10) || 1;
      const end = parseInt(btn.getAttribute('data-end') || start, 10) || start;
      jumpToLine(start);
      highlightLines(start, end);
    });
  });
  wireSymbolInteractions(container);
}

function jumpToLine(lineNumber) {
  const container = document.getElementById('fileContent');
  if (!container) return;
  let target = container.querySelector(`.code-line[data-line="${lineNumber}"]`);
  let usedLine = lineNumber;
  if (!target) {
    const available = Array.from(container.querySelectorAll('.code-line')).map(x => parseInt(x.getAttribute('data-line'), 10)).filter(Number.isFinite);
    if (available.length > 0) {
      const closest = available.reduce((a, b) => Math.abs(b - lineNumber) < Math.abs(a - lineNumber) ? b : a, available[0]);
      target = container.querySelector(`.code-line[data-line="${closest}"]`);
      usedLine = closest;
      if (DEBUG_HIGHLIGHT) {
        console.debug('jumpToLine: exact target not found, using closest', { requested: lineNumber, closest });
        debugOverlayLog(`jump ${lineNumber}->${closest}`);
      }
    }
  }
  if (target) {
    try {
      const offsetTop = getOffsetTopRelativeTo(target, container);
      const firstLineEl = container.querySelector('.code-line[data-line="1"]');
      const firstLineOffset = firstLineEl ? getOffsetTopRelativeTo(firstLineEl, container) : 0;
      const perLineHeight = (() => {
        try {
          const second = container.querySelector('.code-line[data-line="2"]');
          if (firstLineEl && second) return Math.abs(getOffsetTopRelativeTo(second, container) - getOffsetTopRelativeTo(firstLineEl, container));
        } catch (e) {}
        return Math.max(1, target.clientHeight);
      })();
      if (DEBUG_HIGHLIGHT) {
        console.debug('jumpToLine pre-scroll', { requestedLine: lineNumber, usedLine, offsetTop, firstLineOffset, perLineHeight, scrollTop: container.scrollTop, clientHeight: container.clientHeight });
        debugOverlayLog(`pre-scroll ${lineNumber}->${usedLine} off=${Math.round(firstLineOffset / perLineHeight)} lines`);
      }
      if (Math.abs(firstLineOffset) > (perLineHeight * 0.5)) {
        const targetCenter = offsetTop - (container.clientHeight / 2) + (target.clientHeight / 2) - firstLineOffset;
        container.scrollTo({ top: Math.max(0, targetCenter), behavior: 'smooth' });
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    } catch (err) {
      const offsetTop = getOffsetTopRelativeTo(target, container);
      const targetCenter = offsetTop - (container.clientHeight / 2) + (target.clientHeight / 2);
      container.scrollTo({ top: Math.max(0, targetCenter), behavior: 'smooth' });
    }
    target.classList.add('highlight');
    setTimeout(() => target.classList.remove('highlight'), 900);
  }
}

function getOffsetTopRelativeTo(child, ancestor) {
  if (!child || !ancestor) return 0;
  const childRect = child.getBoundingClientRect();
  const ancRect = ancestor.getBoundingClientRect();
  const relativeTop = childRect.top - ancRect.top + ancestor.scrollTop;
  if (DEBUG_HIGHLIGHT) console.debug('getOffsetTopRelativeTo', { childLine: child.getAttribute('data-line'), relativeTop, ancScroll: ancestor.scrollTop, childTop: childRect.top, ancTop: ancRect.top });
  return Math.max(0, Math.round(relativeTop));
}

async function renderFilePerLine(content) {
  const container = document.getElementById('fileContent');
  if (!container) return;
  container.innerHTML = '';
  const lines = content.split(/\r?\n/);
  const total = lines.length;
  const CHUNK = total > 2000 ? 500 : (total > 800 ? 200 : 0);
  if (!CHUNK) {
    const frag = document.createDocumentFragment();
    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const line = document.createElement('div');
      line.className = 'code-line';
      line.setAttribute('data-line', lineNum);
      const ln = document.createElement('span');
      ln.className = 'line-number';
      ln.textContent = lineNum;
      const code = document.createElement('span');
      code.className = 'line-text';
      code.innerHTML = lineText ? escapeHtml(lineText) : '\u200B';
      line.appendChild(ln);
      line.appendChild(code);
      frag.appendChild(line);
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
      const line = document.createElement('div');
      line.className = 'code-line';
      line.setAttribute('data-line', lineNum);
      const ln = document.createElement('span');
      ln.className = 'line-number';
      ln.textContent = lineNum;
      const code = document.createElement('span');
      code.className = 'line-text';
      code.innerHTML = lineText ? escapeHtml(lineText) : '\u200B';
      line.appendChild(ln);
      line.appendChild(code);
      frag.appendChild(line);
    }
    container.appendChild(frag);
    await new Promise(r => requestAnimationFrame(r));
    idx = end;
  }
}

function highlightLines(start, end) {
  const container = document.getElementById('fileContent');
  if (!container) return;
  container.querySelectorAll('.code-line.highlight').forEach(el => el.classList.remove('highlight'));
  if (!start || !end || start > end) return;
  const s = Math.max(1, parseInt(start, 10));
  const e = Math.max(s, parseInt(end, 10));
  for (let n = s; n <= e; n++) {
    let el = container.querySelector(`.code-line[data-line="${n}"]`);
    if (!el) {
      const available = Array.from(container.querySelectorAll('.code-line')).map(x => parseInt(x.getAttribute('data-line'), 10)).filter(Number.isFinite);
      if (available.length > 0) {
        let closest = available.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a, available[0]);
        el = container.querySelector(`.code-line[data-line="${closest}"]`);
        if (DEBUG_HIGHLIGHT) console.debug(`highlightLines: requested ${n} not found, using closest ${closest}`);
      }
    }
    if (el) el.classList.add('highlight');
  }
}

let tooltipEl = null;
let tooltipTimeout = null;
let debugOverlayEl = null;
function ensureDebugOverlay() {
  if (!DEBUG_HIGHLIGHT) return;
  if (!debugOverlayEl) {
    debugOverlayEl = document.createElement('div');
    debugOverlayEl.style.position = 'fixed';
    debugOverlayEl.style.right = '12px';
    debugOverlayEl.style.bottom = '12px';
    debugOverlayEl.style.zIndex = '99999';
    debugOverlayEl.style.maxWidth = '320px';
    debugOverlayEl.style.padding = '8px 10px';
    debugOverlayEl.style.background = 'rgba(0,0,0,0.7)';
    debugOverlayEl.style.color = 'white';
    debugOverlayEl.style.fontSize = '12px';
    debugOverlayEl.style.borderRadius = '6px';
    debugOverlayEl.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
    debugOverlayEl.style.pointerEvents = 'none';
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
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'symbol-tooltip';
    document.body.appendChild(tooltipEl);
  }
  tooltipEl.innerHTML = html;
  tooltipEl.style.display = 'block';
  tooltipEl.classList.remove('show');
  tooltipEl.style.pointerEvents = 'none';
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
  requestAnimationFrame(() => tooltipEl.classList.add('show'));
}

function hideSymbolTooltip() {
  if (!tooltipEl) return;
  if (tooltipTimeout) { clearTimeout(tooltipTimeout); tooltipTimeout = null; }
  tooltipEl.classList.remove('show');
  setTimeout(() => { if (tooltipEl) tooltipEl.style.display = 'none'; }, 160);
}

function positionTooltip(x, y) {
  if (!tooltipEl) return;
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
  const symbols = container.querySelectorAll('.analysis-symbols li');
  symbols.forEach((li) => {
    const btn = li.querySelector('.jump-to-line');
    function normalizeForSearch(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
    function resolveStartEnd() {
      const rawStart = parseInt(btn?.getAttribute('data-start') || btn?.getAttribute('data-line') || '0', 10) || 0;
      const rawEnd = parseInt(btn?.getAttribute('data-end') || rawStart, 10) || rawStart;
      const containerEl = document.getElementById('fileContent');
      if (!containerEl) return { start: rawStart, end: rawEnd };
      if (containerEl.querySelector(`.code-line[data-line="${rawStart}"]`)) return { start: rawStart, end: rawEnd };
      for (let d = 1; d <= 3; d++) {
        if (containerEl.querySelector(`.code-line[data-line="${rawStart + d}"]`)) return { start: rawStart + d, end: rawEnd + d };
        if (rawStart - d > 0 && containerEl.querySelector(`.code-line[data-line="${rawStart - d}"]`)) return { start: rawStart - d, end: rawEnd - d };
      }
      const snippetEnc = btn?.getAttribute('data-snippet') || '';
      const origEnc = li.closest('.analysis-symbols')?.parentElement?.dataset?.original || containerEl.dataset.original || '';
      if (snippetEnc && origEnc) {
        try {
          const snippet = decodeURIComponent(snippetEnc);
          const original = decodeURIComponent(origEnc);
          const firstLineRaw = (snippet || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || '';
          if (firstLineRaw) {
            let idx = original.indexOf(firstLineRaw);
            if (idx < 0) {
              const normFirst = normalizeForSearch(firstLineRaw);
              const normOrig = normalizeForSearch(original);
              idx = normOrig.indexOf(normFirst);
              if (idx >= 0) {
                const token = firstLineRaw.slice(0, Math.min(40, firstLineRaw.length)).trim();
                const rawIdx = token ? original.indexOf(token) : -1;
                if (rawIdx >= 0) idx = rawIdx;
              }
            }
            if (idx < 0) {
              const trimmed = firstLineRaw;
              for (let len = Math.min(80, trimmed.length); len >= 12; len -= 12) {
                const frag = trimmed.slice(0, len);
                idx = original.indexOf(frag);
                if (idx >= 0) break;
              }
            }
            if (idx >= 0) {
              const before = original.slice(0, idx);
              const lineNum = before.split(/\r?\n/).length + 1;
              if (DEBUG_HIGHLIGHT) { console.debug('resolveStartEnd: snippet matched', { rawStart, rawEnd, matchedLine: lineNum, firstLineRaw }); debugOverlayLog(`resolved ${rawStart}->${lineNum}`); }
              return { start: lineNum, end: Math.max(lineNum, rawEnd) };
            }
          }
        } catch (e) { if (DEBUG_HIGHLIGHT) console.debug('resolveStartEnd: snippet search failed', e); }
      }
      if (DEBUG_HIGHLIGHT) { debugOverlayLog(`fallback ${rawStart}->${rawStart}`); }
      return { start: rawStart, end: rawEnd };
    }
    li.addEventListener('mouseenter', (e) => { const { start, end } = resolveStartEnd(); if (start) highlightLines(start, end); });
    li.addEventListener('mouseleave', () => { highlightLines(0,0); });
    if (btn) btn.addEventListener('click', () => { const { start, end } = resolveStartEnd(); jumpToLine(start); highlightLines(start, end); });
  });
  const fileContentEl = document.querySelectorAll('#fileContent .code-line');
  fileContentEl.forEach(lineEl => {
    const ln = parseInt(lineEl.getAttribute('data-line'), 10);
    lineEl.addEventListener('mouseenter', (e) => {
      const symbolLi = Array.from(container.querySelectorAll('.analysis-symbols li')).find(li => {
        const btn = li.querySelector('.jump-to-line');
        const sl = parseInt(btn?.getAttribute('data-start') || btn?.getAttribute('data-line') || '0', 10);
        const el = parseInt(btn?.getAttribute('data-end') || sl || '0', 10);
        return sl && (ln >= sl && ln <= el);
      });
      if (symbolLi) {
        symbolLi.classList.add('highlight');
        const desc = symbolLi.querySelector('div')?.textContent || '';
        showSymbolTooltip(`<h5>${escapeHtml(symbolLi.querySelector('strong').textContent)}</h5><p>${escapeHtml(desc)}</p>`, e.clientX, e.clientY);
      }
    });
    lineEl.addEventListener('mousemove', (e) => { positionTooltip(e.clientX, e.clientY); });
    lineEl.addEventListener('mouseleave', () => { hideSymbolTooltip(); container.querySelectorAll('.analysis-symbols li').forEach(li => li.classList.remove('highlight')); });
  });
  const scrollContainer = document.getElementById('fileContent');
  if (scrollContainer) scrollContainer.addEventListener('scroll', () => { hideSymbolTooltip(); });
  window.addEventListener('scroll', hideSymbolTooltip, { passive: true });
  window.addEventListener('resize', hideSymbolTooltip);
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

