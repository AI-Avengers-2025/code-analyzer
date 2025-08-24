import {readExistingSummaries, saveSummaryToFile, summarizeRepo} from "../services/summaryService.js";
import {getContentsOfRepo} from "../api/github.js";
import {sendToGemini} from "../api/gemini.js";

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

  const { githubUrl, githubToken} = req.query;

  const repoPath = githubUrl.replace('https://github.com/', '');
  const [owner, repo] = repoPath.split('/');

  const startingMessage = {
    status: 'started',
    message: `Creating summaries for ${repo}`
  };
  res.write('data: ' + JSON.stringify(startingMessage) + '\n\n');

  console.log('githubUrl', githubUrl);

  console.log('Started reading github repo...');
  const repoFileContents = await getContentsOfRepo(githubUrl, githubToken);
  console.log('Completed reading github repo...');
  const fileCount = Object.keys(repoFileContents).length;

  res.write('data: ' + JSON.stringify({ totalFiles: fileCount }) + '\n\n');

  const fileLevelPrompt = `
    I want to create a story of the repo for non-technical people to easily understand.
    This is one file in in number of files from that Github repository. 
    Please provide a high-level, non-technical summary of this file's contents.
    After all files are summarised, I'll provide you with the summaries and ask you to provide folder-level summaries,
    so please keep note of the relationships between these files.
    Please focus on the purpose of the project, its key features, and the technologies used. 
    Please don't reply to the prompt in a conversational manner, on reply with the summary.
    File Contents: 
    `;

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

    const summary = await sendToGemini(fileLevelPrompt + fileContents);

    const summaryObject = {
      date: new Date().toISOString(),
      filename: filePath,
      summaryLevel: 'file',
      summary: summary
    };
    repoFileSummaries.push(summaryObject);

    saveSummaryToFile(outputFileName, summaryObject);

    i++;
  }

  res.write('data: ' + JSON.stringify({ status: 'generating_final_summary', message: 'Generating overall repository summary...' }) + '\n\n');

  const combinedSummaries = repoFileSummaries.map(item => item.summary).join('\n\n--- File Summary ---\n\n');
  const finalSummary = await sendToGemini(combinedSummaries);

  const finalMessage = {
    status: 'complete',
    message: 'Summary complete!',
    finalSummary: finalSummary
  };
  res.write('data: ' + JSON.stringify(finalMessage) + '\n\n');
  res.end(); // Close the connection
}