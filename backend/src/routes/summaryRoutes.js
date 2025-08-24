import { Router } from "express";
import {getFileSummary, streamSummariesToFrontend} from "../controllers/summaryController.js";

const router = Router();

router.get("/", streamSummariesToFrontend);
router.post("/file", getFileSummary);

export default router;

