import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

export const sendToGemini = async (prompt) => {

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GOOGLE_API_KEY}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
    },
  };

  const MAX_RETRIES = 5;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        console.warn(`Rate limit exceeded (429). Retrying in ${Math.round(delay / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        return result.candidates[0].content.parts[0].text;
      } else {
        console.error('Gemini API response was not in the expected format:', result);
        return 'Failed to generate a summary.';
      }

    } catch (error) {
      console.error('Failed to call Gemini API:', error);
      return 'Failed to generate a summary.';
    }
  }

  console.error(`Exceeded maximum retry attempts (${MAX_RETRIES}). Final request failed.`);
  return 'Failed to generate a summary after multiple retries.';
}
