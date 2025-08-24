import { Router } from "express";
import { getRepoContents, getFileContent, getRepoSummary } from "../controllers/repoController.js";

const router = Router();

router.get("/file", getFileContent);


// endpoint for summary
router.get("/:owner/:repo/summary", getRepoSummary);

// Repo contents (files/folders)
router.get("/:owner/:repo", getRepoContents);
router.get("/:owner/:repo/*", getRepoContents);

export default router;

