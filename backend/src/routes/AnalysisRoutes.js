import express from 'express';
import { analyzeFile } from '../controllers/analysisController.js';

const router = express.Router();

router.post('/file', analyzeFile);

export default router;
