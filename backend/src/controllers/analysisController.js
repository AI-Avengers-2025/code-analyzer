import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

let genaiClient = null;

function getGenAIClient(apiKey = "") {
  const key = apiKey || process.env.GOOGLE_API_KEY || "";
  if (genaiClient && genaiClient.__constructedWithKey === key)
    return genaiClient;
  const opts = {};
  if (key) opts.apiKey = key;
  genaiClient = new GoogleGenAI(opts);
  genaiClient.__constructedWithKey = key;
  return genaiClient;
}

function prepareGeminiPayload({
  filePath = "",
  fileContent = "",
  language = "auto",
} = {}) {
  const fileSummary = {
    filePath,
    language,
    lines: fileContent.split(/\r?\n/).length,
    chars: fileContent.length,
  };
  const parts = [];
  parts.push(
    "Produce a single JSON object (no explanatory text) describing the file and its symbols. do not append a json indicator to the output. it should be parsable as JSON."
  );
  parts.push("Top-level requirements:");
  parts.push(
    "- Provide a file-level summary: purpose, inferred language, and shortDescription (1-2 sentences)."
  );
  parts.push(
    "- Provide a longer fileAnalysis explaining responsibilities, important functions/classes, patterns, and any surprising or risky code."
  );
  parts.push("- For symbols: return an array where each item has:");
  parts.push("  { name, kind (function/class/variable), startLine, endLine,");
  parts.push(
    "    params: [ { name, inferredType (string|null), typeConfidence (0-1), description } ],"
  );
  parts.push("    returnType: { type: string|null, confidence: 0-1 },");
  parts.push(
    "    shortDescription, longDescription, references (list of line numbers), snippet, complexity (low|medium|high), securityConcerns (array), suggestions (array of {type, description, patch?}), confidence (0-1)"
  );
  parts.push("  }");
  parts.push("Output rules:");
  parts.push(
    "- Output must be valid JSON only. Do not include any markdown or commentary."
  );
  parts.push(
    "- Do not add new lines or special characters to stylize the JSON output."
  );
  parts.push(
    "- For any inferred types, use common type names (e.g., string, number, boolean, object, Array<string>, Promise<number>, null if unknown)."
  );
  parts.push(
    "- Provide numeric confidence values (0.0 - 1.0) for inferred types and overall symbol confidence."
  );
  parts.push(
    "- The top-level object MUST include: filePath, language, fileSummary, fileAnalysis, symbols (array)."
  );
  parts.push(
    "URI Encoded File content (send full file, truncate only when extremely large):"
  );

  parts.push(
    "i will number the lines of code for you, code starts after this line:"
  );

  fileContent.split(/\r?\n/).forEach((line, idx) => {
    parts.push(`${idx + 1}: ` + line + " " + "");
  });

  parts.push("Produce the final JSON as described above.");
  const prompt = parts.join("\n");
  const payload = {
    model: "gemini-2.5-flash",
    contents: prompt,
    maxTokens: 400500,
  };

  console.log("Gemini payload:", prompt);
  return { fileSummary, payload };
}

async function analyzeFile(req, res) {
  const {
    filePath = "",
    fileContent = "",
    language = "auto",
    callGemini = false,
    googleApiKey = "",
  } = req.body || {};
  if (!fileContent || typeof fileContent !== "string") {
    return res.status(400).json({
      success: false,
      error: "fileContent (string) is required in request body",
    });
  }
  const normalizedContent = String(fileContent)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const geminiReady = prepareGeminiPayload({
    filePath,
    fileContent: normalizedContent,
    language,
  });
  const enableGeminiEnv =
    String(process.env.ENABLE_GEMINI || "").toLowerCase() === "true";
  const shouldCallGemini = enableGeminiEnv || callGemini === true;
  if (shouldCallGemini) {
    try {
      const client = getGenAIClient(googleApiKey);
      const response = await client.models.generateContent({
        model: geminiReady.payload.model,
        contents: geminiReady.payload.contents,
        maxTokens: geminiReady.payload.maxTokens,
      });
      const text =
        response?.text ||
        (Array.isArray(response?.candidates) &&
          response.candidates[0]?.content) ||
        JSON.stringify(response);
      let _processedText = `${text}`.trim();
      const startIndex = _processedText.indexOf("{");
      if (startIndex > 0) {
        _processedText = _processedText.slice(startIndex);
      }
      return res.json({ analysis: JSON.parse(_processedText) });
    } catch (err) {
      return res.status(502).json({
        success: false,
        error: "Gemini API call failed",
        details: String(err),
      });
    }
  }
  return res.json({
    success: true,
    file: geminiReady.fileSummary,
    preliminarySymbols: symbols,
    geminiRequest: geminiReady.payload,
  });
}

export { analyzeFile, prepareGeminiPayload };
