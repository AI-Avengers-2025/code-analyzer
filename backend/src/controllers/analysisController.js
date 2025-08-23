import path from 'path';

import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

let genaiClient = null;
function getGenAIClient(apiKey = '') {
  const key = apiKey || process.env.GOOGLE_API_KEY || '';
  if (genaiClient && genaiClient.__constructedWithKey === key) return genaiClient;
  const opts = {};
  if (key) opts.apiKey = key;
  genaiClient = new GoogleGenAI(opts);
  genaiClient.__constructedWithKey = key;
  return genaiClient;
}

function extractSymbols(fileContent, language = 'auto') {
  const lines = fileContent.split(/\r?\n/);
  const symbols = [];
  const patterns = {
    js: [
      { type: 'function', re: /^\s*function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{/ },
      { type: 'function', re: /^\s*(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(?([^)]*)\)?\s*=>\s*\{/ },
      { type: 'class', re: /^\s*class\s+([A-Za-z0-9_$]+)/ },
      { type: 'export', re: /^\s*export\s+(?:default\s+)?function\s+([A-Za-z0-9_$]+)/ },
    ],
    py: [
      { type: 'function', re: /^\s*def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*:/ },
      { type: 'class', re: /^\s*class\s+([A-Za-z0-9_]+)\s*[:\(]/ },
    ],
  };
  const lang = (language || 'auto').toLowerCase();
  const chosen = lang.startsWith('py') ? patterns.py : patterns.js;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of chosen) {
      const m = line.match(p.re);
      if (m) {
        const name = m[1];
        const paramsRaw = m[2] || '';
        const params = paramsRaw.split(',').map(s => s.trim()).filter(Boolean).map((p, idx) => ({ name: p.replace(/=.*$/,''), index: idx }));
        symbols.push({
          name,
          type: p.type,
          startLine: i + 1,
          endLine: i + 1,
          params,
          snippet: line.trim()
        });
        break;
      }
    }
  }
  return symbols;
}

function prepareGeminiPayload({ filePath = '', fileContent = '', language = 'auto', symbols = [], fullAnalysis = false } = {}) {
  const fileSummary = {
    filePath,
    language,
    lines: fileContent.split(/\r?\n/).length,
    chars: fileContent.length,
  };
  const parts = [];
  parts.push('Produce a single JSON object (no explanatory text) describing the file and its symbols.');
  parts.push('Top-level requirements:');
  parts.push('- Provide a file-level summary: purpose, inferred language, and shortDescription (1-2 sentences).');
  parts.push("- Provide a longer fileAnalysis explaining responsibilities, important functions/classes, patterns, and any surprising or risky code.");
  parts.push('- For symbols: return an array where each item has:');
  parts.push("  { name, kind (function/class/variable), startLine, endLine,");
  parts.push("    params: [ { name, inferredType (string|null), typeConfidence (0-1), description } ],");
  parts.push("    returnType: { type: string|null, confidence: 0-1 },");
  parts.push("    shortDescription, longDescription, references (list of line numbers), snippet, complexity (low|medium|high), securityConcerns (array), suggestions (array of {type, description, patch?}), confidence (0-1)");
  parts.push('  }');
  parts.push('Output rules:');
  parts.push('- Output must be valid JSON only. Do not include any markdown or commentary.');
  parts.push('- For any inferred types, use common type names (e.g., string, number, boolean, object, Array<string>, Promise<number>, null if unknown).');
  parts.push('- Provide numeric confidence values (0.0 - 1.0) for inferred types and overall symbol confidence.');
  parts.push('- The top-level object MUST include: filePath, language, fileSummary, fileAnalysis, symbols (array).');
  parts.push('');
  parts.push('');
  if (!fullAnalysis && symbols && symbols.length) {
    parts.push('Preliminary symbols (optional hints, the model may refine or ignore):');
    parts.push(JSON.stringify(symbols, null, 2));
    parts.push('');
  }
  parts.push('URI Encoded File content (send full file, truncate only when extremely large):');
  parts.push(encodeURIComponent(fileContent));
  parts.push('');
  parts.push('Produce the final JSON as described above.');
  const prompt = parts.join('\n');
  const payload = {
    model: 'gemini-2.5-flash',
    contents: prompt,
    maxTokens: 1500,
  };
  return { fileSummary, symbols, payload };
}

async function analyzeFile(req, res) {
  const { filePath = '', fileContent = '', language = 'auto', callGemini = false, googleApiKey = '' } = req.body || {};
  if (!fileContent || typeof fileContent !== 'string') {
    return res.status(400).json({ success: false, error: 'fileContent (string) is required in request body' });
  }
  const normalizedContent = String(fileContent).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const symbols = extractSymbols(normalizedContent, language);
  const geminiReady = prepareGeminiPayload({ filePath, fileContent: normalizedContent, language, symbols });
  const enableGeminiEnv = String(process.env.ENABLE_GEMINI || '').toLowerCase() === 'true';
  const shouldCallGemini = enableGeminiEnv || callGemini === true;
  if (shouldCallGemini) {
    try {
      const client = getGenAIClient(googleApiKey);
      const response = await client.models.generateContent({
        model: geminiReady.payload.model,
        contents: geminiReady.payload.contents,
        maxTokens: geminiReady.payload.maxTokens,
      });
      const text = response?.text || (Array.isArray(response?.candidates) && response.candidates[0]?.content) || JSON.stringify(response);
      function extractJsonFromText(s) {
        if (!s || typeof s !== 'string') return { json: null, error: 'no text' };
        const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        let candidate = fenceMatch ? fenceMatch[1].trim() : s.trim();
        const firstBrace = candidate.indexOf('{');
        if (firstBrace !== -1 && candidate[firstBrace] !== undefined) {
          let i = firstBrace;
          let depth = 0;
          let inString = false;
          let escape = false;
          for (; i < candidate.length; i++) {
            const ch = candidate[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') depth++;
            if (ch === '}') {
              depth--;
              if (depth === 0) {
                const jsonText = candidate.slice(firstBrace, i + 1);
                try {
                  const parsed = JSON.parse(jsonText);
                  return { json: parsed };
                } catch (e) {
                  break;
                }
              }
            }
          }
        }
        try {
          const parsed = JSON.parse(candidate);
          return { json: parsed };
        } catch (e) {
          return { json: null, error: String(e) };
        }
      }
      const parseResult = extractJsonFromText(text);
      function validateAnalysisJson(obj) {
        const errors = [];
        if (!obj || typeof obj !== 'object') { errors.push('Top-level JSON must be an object'); return { ok: false, errors }; }
        if (!('filePath' in obj)) errors.push('Missing filePath');
        if (!('language' in obj)) errors.push('Missing language');
        if (!('fileSummary' in obj)) errors.push('Missing fileSummary');
        if (!('fileAnalysis' in obj)) errors.push('Missing fileAnalysis');
        if (!('symbols' in obj)) errors.push('Missing symbols array');
        if (Array.isArray(obj.symbols)) {
          obj.symbols.forEach((s, idx) => {
            if (!s || typeof s !== 'object') { errors.push(`symbols[${idx}] must be an object`); return; }
            if (!s.name) errors.push(`symbols[${idx}].name missing`);
            if (!Number.isInteger(s.startLine)) errors.push(`symbols[${idx}].startLine must be integer`);
            if (!Number.isInteger(s.endLine)) errors.push(`symbols[${idx}].endLine must be integer`);
            if (s.params && !Array.isArray(s.params)) errors.push(`symbols[${idx}].params must be array`);
          });
        } else {
          errors.push('symbols must be an array');
        }
        return { ok: errors.length === 0, errors };
      }
      const validation = parseResult.json ? validateAnalysisJson(parseResult.json) : { ok: false, errors: ['no parsed JSON'] };
      return res.json({ analysis: parseResult });
    } catch (err) {
      return res.status(502).json({ success: false, error: 'Gemini API call failed', details: String(err) });
    }
  }
  return res.json({ success: true, file: geminiReady.fileSummary, preliminarySymbols: symbols, geminiRequest: geminiReady.payload });
}

export { analyzeFile, extractSymbols, prepareGeminiPayload };
