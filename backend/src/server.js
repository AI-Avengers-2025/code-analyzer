import express from "express";
import cors from "cors";
import repoRoutes from "./routes/repoRoutes.js";
import dotenv from 'dotenv';
import summaryRoutes from "./routes/summaryRoutes.js";

dotenv.config();

const app = express();
app.use(cors());

app.use(express.json());

app.use("/api/repo", repoRoutes);
app.use("/api/summary", summaryRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
