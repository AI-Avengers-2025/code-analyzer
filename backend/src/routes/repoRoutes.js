import { Router } from "express";
import { getRepoContents, getFileContent } from "../controllers/repoController.js";

const router = Router();

router.get("/file", getFileContent);

router.get("/:owner/:repo", getRepoContents);

router.get("/:owner/:repo/*", getRepoContents);

export default router;

