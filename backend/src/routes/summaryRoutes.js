import { Router } from "express";
import {streamSummariesToFrontend} from "../controllers/summaryController.js";

const router = Router();

router.get("/", streamSummariesToFrontend);

export default router;

