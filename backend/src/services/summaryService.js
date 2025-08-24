import {sendToGemini} from "../api/gemini.js";
import {getContentsOfRepo} from "../api/github.js";
import fs from 'fs';
import path from 'path';

const savePath = path.resolve();

export const summarizeRepo = async (githubUrl, githubToken) => {

  // todo: remove repeated code
  const repoPath = githubUrl.replace('https://github.com/', '');
  const [owner, repo] = repoPath.split('/');

  const repoFileContents = await getContentsOfRepo(githubUrl, githubToken);

  const fileCount = Object.keys(repoFileContents).length;

  console.log('repoContents', repoFileContents);

  const repoFileSummaries = [];

  const fileLevelPrompt = `
    I want to create a story of the repo for non-technical people to easily understand.
    This is one file in in number of files from that Github repository. 
    Please provide a high-level, non-technical summary of this file's contents.
    After all files are summarized, I'll provide you with the summaries and ask you to provide folder-level summaries,
    so please keep note of the relationships between these files.
    Please focus on the purpose of the project, its key features, and the technologies used. 
    Please don't reply to the prompt in a conversational manner, on reply with the summary.
    File Contents: 
    `;

  let i = 1;
  const outputFileName = `${repo}.json`;
  for (const [filePath, fileContents] of Object.entries(repoFileContents)) {
    console.log(`Summarizing ${i} out of ${fileCount}`);

    const summary = await sendToGemini(fileLevelPrompt + fileContents);

    const summaryObject = {
      date: new Date().toISOString(),
      filename: filePath,
      summaryLevel: 'file',
      summary: summary
    };

    repoFileSummaries.push(summaryObject);

    saveSummaryToFile(outputFileName, summaryObject);

    i++
  }

  console.log('repoFileSummaries', repoFileSummaries);

  const combinedSummaries = repoFileSummaries.map(item => item.summary).join('\n\n--- File Summary ---\n\n');

  if (combinedSummaries.length === 0) {
    return 'Failed to generate any summaries for the repository.';
  }

  const metaPrompt = `
  You have been given a series of file-level summaries from a large GitHub repository. 
  Combine them into a single, comprehensive summary of the entire repository. 
  Focus on the project's overall purpose, architecture, and key technologies used.
  Combined Summaries: ${combinedSummaries}`;

  console.log('Generating final meta-summary...');
  const finalSummary = await sendToGemini(metaPrompt);

  const overallSummaryObject = {
    date: new Date().toISOString(),
    filename: `overall_summary`,
    summaryLevel: 'repo',
    summary: finalSummary
  };
  saveSummaryToFile(outputFileName, overallSummaryObject);

  return finalSummary;
}

export const saveSummaryToFile = (filename, data) => {
  const filePath = path.join(savePath, filename);

  let existingData = [];
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    existingData = JSON.parse(fileContent);
  } catch (error) {
    console.warn(`File not found or invalid at ${filePath}. Starting with a new file.`);
  }

  existingData.push(data);

  try {
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
    console.log(`Successfully appended summary to ${filePath}`);
  } catch (error) {
    console.error(`Error saving file: ${error}`);
  }
}

export const readExistingSummaries = (filename) => {
  const filePath = path.join(savePath, filename);

  if (fs.existsSync(filePath)) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      console.error(`Error reading or parsing existing summary file: ${error}`);
    }
  }
  return [];
}
