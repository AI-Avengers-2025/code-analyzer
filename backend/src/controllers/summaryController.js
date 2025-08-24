import {readExistingSummaries, saveSummaryToFile, summarizeRepo} from "../services/summaryService.js";
import {getContentsOfRepo} from "../api/github.js";
import {sendToGemini} from "../api/gemini.js";
import dotenv from "dotenv";

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

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

const metaPrompt = `
    You have been given a series of file-level summaries from a large GitHub repository. 
    Combine them into a single, comprehensive summary of the entire repository. 
    Focus on the project's overall purpose, architecture, and key technologies used.
    Combined Summaries: `;

export const getRepoSummary = async (req, res) => {
  const { githubUrl, githubToken } = req.body;
  try {
    const summary = await summarizeRepo(githubUrl, githubToken);
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}


export const streamSummariesToFrontend = async(req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let { githubUrl, githubToken} = req.query;

  if (!githubToken) {
    githubToken = GITHUB_TOKEN;
  }

  const repoPath = githubUrl.replace('https://github.com/', '');
  const [owner, repo] = repoPath.split('/');

  const startingMessage = {
    status: 'started',
    message: `Generating overall summary for ${repo}`
  };
  res.write('data: ' + JSON.stringify(startingMessage) + '\n\n');

  console.log('githubUrl', githubUrl);

  console.log('Started reading github repo...');
  const repoFileContents = await getContentsOfRepo(githubUrl, githubToken);
  console.log('Completed reading github repo...');
  const fileCount = Object.keys(repoFileContents).length;

  res.write('data: ' + JSON.stringify({ totalFiles: fileCount }) + '\n\n');

  const repoFileSummaries = [];
  let i = 1;
  const outputFileName = `${repo}.json`;
  const existingSummaries = readExistingSummaries(outputFileName);

  for (const [filePath, fileContents] of Object.entries(repoFileContents)) {
    const progressMessage = {
      status: 'progress',
      message: `Summarizing file ${i} of ${fileCount}: ${filePath}`,
      current: i,
      total: fileCount
    };
    res.write('data: ' + JSON.stringify(progressMessage) + '\n\n');

    const existingSummary = existingSummaries.find(s => s.filename === filePath);

    if (existingSummary) {
      console.log(`Summary for ${filePath} already exists. Skipping Gemini call.`);
      repoFileSummaries.push(existingSummary);
      i++;
      continue;
    }

    const summaryObject = await getAndSaveSummary(fileLevelPrompt, fileContents, filePath, outputFileName, 'file')

    repoFileSummaries.push(summaryObject);

    i++;
  }

  res.write('data: ' + JSON.stringify({ status: 'generating_final_summary', message: 'Generating overall repository summary...' }) + '\n\n');

  let finalSummary = existingSummaries.find(s => s.filename === '' && s.summaryLevel === 'repo')?.summary;

  if (!finalSummary) {
    const combinedSummaries = repoFileSummaries.map(item => item.summary).join('\n\n--- File Summary ---\n\n');

    const finalSummaryObject = await getAndSaveSummary(metaPrompt + combinedSummaries, '', '', outputFileName, 'repo')

    finalSummary = finalSummaryObject.summary;
  }

  const finalMessage = {
    status: 'complete',
    message: 'Summary complete!',
    finalSummary: finalSummary
  };

  res.write('data: ' + JSON.stringify(finalMessage) + '\n\n');
  res.end();
}

const getAndSaveSummary = async (prompt, fileContents, filePath, outputFileName, summaryLevel) => {
  const summary = await sendToGemini(prompt + fileContents);

  const summaryObject = {
    date: new Date().toISOString(),
    filename: filePath,
    summaryLevel: summaryLevel,
    summary: summary
  };

  saveSummaryToFile(outputFileName, summaryObject);

  return summaryObject;
}


export const getFileSummary = async (req, res) => {
  try {
    const { repoName, filePath, fileContents } = req.body;

    console.log('repoName', repoName);

    const outputFileName = `${repoName}.json`;
    const existingSummaries = readExistingSummaries(outputFileName);

    console.log('existingSummaries', existingSummaries);

    const existingSummary = existingSummaries.find(s => s.filename === filePath);
    console.log('existingSummary', existingSummary);

    if (!existingSummary) {
      const summaryObject = await getAndSaveSummary(fileLevelPrompt, fileContents, filePath, outputFileName, 'file')

      res.json({ summary: summaryObject.summary });
    }
    else {
      res.json({ summary: existingSummary?.summary });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}