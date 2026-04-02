import express from "express";
import cors from "cors";
import { createSchema } from "./db/schema.js";
import { seedDatabase } from "./db/seed.js";
import { apiAccessTokenMiddleware, authMiddleware } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import dashboardRouter from "./routes/dashboard.js";
import userRouter from "./routes/user.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", apiAccessTokenMiddleware);

app.use("/api/userauthentication/admin", authRouter);

app.use("/api/admin/home", authMiddleware, dashboardRouter);

app.use("/api/admin/user", apiAccessTokenMiddleware, userRouter);

async function start() {
  try {
    await createSchema();
    console.log("Database schema created");

    await seedDatabase();
    console.log("Database seeded");

    app.listen(PORT, "localhost", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
