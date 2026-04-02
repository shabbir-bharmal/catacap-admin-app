import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import pool from "../db/pool.js";
import { JWT_SECRET } from "../middleware/auth.js";

const router = Router();

router.get("/by-token", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ message: "Token is required" });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.username, u.email, r.name as role
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const user = result.rows[0];

    res.json({
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      userName: user.username,
      roleName: user.role,
      isSuperAdmin: user.role === "Admin",
      hasInvestments: false,
      pictureFileName: "",
      isApprouveRequired: false,
      isUserHidden: false,
      emailFromUsersOn: false,
      emailFromGroupsOn: false,
      optOutEmailNotifications: false,
      isAnonymousInvestment: false,
      consentToShowAvatar: true,
      permissions: [
        { moduleId: 1, moduleName: "Dashboard", isManage: true, isDelete: false },
        { moduleId: 2, moduleName: "Users", isManage: true, isDelete: true },
        { moduleId: 3, moduleName: "Investments", isManage: true, isDelete: true },
        { moduleId: 4, moduleName: "Groups", isManage: true, isDelete: true },
        { moduleId: 5, moduleName: "Finance", isManage: true, isDelete: false },
        { moduleId: 6, moduleName: "Settings", isManage: true, isDelete: false },
        { moduleId: 7, moduleName: "Pending Grants", isManage: true, isDelete: true },
        { moduleId: 8, moduleName: "Completed Investments", isManage: true, isDelete: true },
        { moduleId: 9, moduleName: "Account History", isManage: true, isDelete: true },
        { moduleId: 10, moduleName: "Disbursal Requests", isManage: true, isDelete: false },
        { moduleId: 11, moduleName: "Recommendations", isManage: true, isDelete: true },
        { moduleId: 12, moduleName: "Investment Returns", isManage: true, isDelete: true },
        { moduleId: 13, moduleName: "Form Submissions", isManage: true, isDelete: false },
        { moduleId: 14, moduleName: "Email Templates", isManage: true, isDelete: true },
        { moduleId: 15, moduleName: "Site Configuration", isManage: true, isDelete: true },
        { moduleId: 16, moduleName: "News", isManage: true, isDelete: true },
        { moduleId: 17, moduleName: "Events", isManage: true, isDelete: true },
        { moduleId: 18, moduleName: "FAQs", isManage: true, isDelete: true },
        { moduleId: 19, moduleName: "Testimonials", isManage: true, isDelete: true },
        { moduleId: 20, moduleName: "Team", isManage: true, isDelete: true },
        { moduleId: 21, moduleName: "Roles", isManage: true, isDelete: true },
        { moduleId: 22, moduleName: "Other Assets", isManage: true, isDelete: true },
        { moduleId: 23, moduleName: "Archived Records", isManage: true, isDelete: false },
      ],
    });
  } catch (error) {
    console.error("By-token error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
