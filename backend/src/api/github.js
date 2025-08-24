import fetch from 'node-fetch';
import {fetchRepoContents} from "../services/repoService.js";

export const getContentsOfRepo = async (githubUrl, githubToken = undefined)  => {
  try {
    const repoPath = githubUrl.replace('https://github.com/', '');
    const [owner, repo] = repoPath.split('/');
    const contents = {};

    async function getContentsRecursive(currentPath) {
      try {
        const repoData = await fetchRepoContents(owner, repo, currentPath, githubToken);

        for (const item of repoData) {
          if (item.type === 'file') {
            const fileContentResponse = await fetch(item.download_url);
            if (fileContentResponse.ok) {
              contents[item.path] = await fileContentResponse.text();
            }
          }
          else if (item.type === 'dir') {
            await getContentsRecursive(item.path);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch contents for path "${currentPath}":`, error);
      }
    }

    await getContentsRecursive('');

    return contents;
  } catch (error) {
    console.error('Failed to fetch GitHub repository contents:', error);
    return '';
  }
}

