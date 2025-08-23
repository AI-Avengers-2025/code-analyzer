import express from "express";
import cors from "cors";
import repoRoutes from "./routes/repoRoutes.js";

const app = express();
app.use(cors());

app.use(express.json());

app.use("/api/repo", repoRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
