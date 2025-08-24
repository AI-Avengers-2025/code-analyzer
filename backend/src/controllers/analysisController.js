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
  fileContent = "",
} = {}) {
  const parts = [];

  parts.push(
    "Produce a single JSON object (no explanatory text) describing the file and its symbols. do not append a json indicator to the output. it should be parsable as JSON."
  );
  parts.push("Top-level requirements:");
  parts.push(
    "- Provide a file-level summary: purpose, inferred language, and shortDescription (1-2 sentences)."
  );
  parts.push(
    "- Provide a less than 3 sentence fileAnalysis explaining responsibilities of the code."
  );

  parts.push(
    "Generate a single, valid JSON object for the following code file. The output must contain ONLY the JSON object, with no additional text, markdown, or commentary."
  );

  parts.push("The JSON object schema must be exactly as follows:");
  parts.push("{");
  parts.push('  "filePath": "string",');
  parts.push('  "language": "string",');
  parts.push('  "fileSummary": {');
  parts.push('    "purpose": "string",');
  parts.push('    "inferredLanguage": "string",');
  parts.push('    "shortDescription": "string"');
  parts.push("  },");
  parts.push('  "fileAnalysis": "string",');
  parts.push('  "symbols": [');
  parts.push("    {");
  parts.push('      "name": "string",');
  parts.push('      "kind": "function" | "class" | "variable",');
  parts.push('      "startLine": "number",');
  parts.push('      "endLine": "number",');
  parts.push(
    '      "params": [ { "name": "string", "inferredType": "string", "typeConfidence": "number", "description": "string" } ],'
  );
  parts.push(
    '      "returnType": { "type": "string", "confidence": "number" },'
  );
  parts.push('      "shortDescription": "string",');
  parts.push('      "longDescription": "string",');
  parts.push('      "references": [ "number" ],');
  parts.push('      "snippet": "string",');
  parts.push('      "complexity": "low" | "medium" | "high",');
  parts.push('      "securityConcerns": [ "string" ],');
  parts.push(
    '      "suggestions": [ { "type": "string", "description": "string", "patch": "string" } ],'
  );
  parts.push('      "confidence": "number"');
  parts.push("    }");
  parts.push("  ]");
  parts.push("}");
  parts.push("");

  parts.push("Your response must be **only** a valid JSON object.");
  parts.push(
    "Do **not** include any markdown formatting, such as ```json or ```"
  );
  parts.push(
    "Do **not** include any explanatory text, commentary, or conversational filler"
  );
  parts.push("Your response must be **only** a valid JSON object.");
  parts.push(
    "The output must be a single, raw JSON string, parsable directly by a JSON parser"
  );

  parts.push("File content to analyze:");
  parts.push(
    "i will number the lines of code for you, code starts after this line:"
  );

  fileContent.split(/\r?\n/).forEach((line, idx) => {
    parts.push(`${idx + 1}: ` + line + " " + "");
  });

  parts.push("");
  parts.push(
    "Your response must strictly adhere to the JSON schema provided above."
  );

  const prompt = parts.join("\n");
  const payload = {
    model: "gemini-2.5-flash",
    contents: [{ text: prompt }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1000000, 
    },
  };

  return { payload };
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
      const endIndex = _processedText.lastIndexOf("}");
      if (endIndex > 0) {
        _processedText = _processedText.slice(0, endIndex + 1);
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
