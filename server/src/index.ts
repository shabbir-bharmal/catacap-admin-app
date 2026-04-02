import express from "express";
import cors from "cors";
import { testConnection } from "./db.js";
import { apiAccessTokenMiddleware } from "./middleware/apiAccessToken.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import dashboardRoutes from "./routes/dashboard.js";
import eventRoutes from "./routes/events.js";
import faqRoutes from "./routes/faqs.js";
import newsRoutes from "./routes/news.js";
import teamRoutes from "./routes/teams.js";
import testimonialRoutes from "./routes/testimonials.js";
import siteConfigRoutes from "./routes/siteConfiguration.js";
import publicEventRoutes from "./routes/publicEvents.js";
import publicSiteConfigRoutes from "./routes/publicSiteConfiguration.js";
import formSubmissionRoutes from "./routes/formSubmission.js";
import adminFormSubmissionRoutes from "./routes/adminFormSubmission.js";
import adminUserRoutes from "./routes/adminUsers.js";
import moduleAccessPermissionRoutes from "./routes/moduleAccessPermission.js";
import transactionHistoryRoutes from "./routes/transactionHistory.js";
import accountHistoryRoutes from "./routes/accountHistory.js";
import financeRoutes from "./routes/finance.js";
import { jwtAuthMiddleware } from "./middleware/jwtAuth.js";

const app = express();
const PORT = parseInt(process.env.SERVER_PORT || "8200", 10);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", apiAccessTokenMiddleware);

app.use("/api/userauthentication", authRoutes);
app.use("/api/event", publicEventRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/home", jwtAuthMiddleware, dashboardRoutes);
app.use("/api/admin/event", jwtAuthMiddleware, eventRoutes);
app.use("/api/admin/faq", jwtAuthMiddleware, faqRoutes);
app.use("/api/admin/news", jwtAuthMiddleware, newsRoutes);
app.use("/api/admin/team", jwtAuthMiddleware, teamRoutes);
app.use("/api/admin/testimonial", jwtAuthMiddleware, testimonialRoutes);
app.use("/api/admin/site-configuration", jwtAuthMiddleware, siteConfigRoutes);
app.use("/api/SiteConfiguration", publicSiteConfigRoutes);
app.use("/api/form-submission", formSubmissionRoutes);
app.use("/api/admin/form-submission", jwtAuthMiddleware, adminFormSubmissionRoutes);
app.use("/api/admin/user", jwtAuthMiddleware, adminUserRoutes);
app.use("/api/module-access-permission", jwtAuthMiddleware, moduleAccessPermissionRoutes);
app.use("/api/admin/transaction-history", jwtAuthMiddleware, transactionHistoryRoutes);
app.use("/api/admin/finance", jwtAuthMiddleware, financeRoutes);
app.use("/api/AccountBalanceHistory", accountHistoryRoutes);

async function start() {
  try {
    await testConnection();
    console.log("Database connection verified.");
  } catch (err) {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
