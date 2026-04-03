import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { verifyToken } from "../utils/jwt.js";
import { resolveFileUrl } from "../utils/uploadBase64Image.js";

const router = Router();

router.get("/user/by-token", async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) || req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      res.status(401).json({ message: "Token is required" });
      return;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, email, user_name, first_name, last_name, picture_file_name,
              is_approuve_required, is_user_hidden, email_from_users_on, email_from_groups_on,
              opt_out_email_notifications, is_anonymous_investment, consent_to_show_avatar,
              is_active
       FROM users 
       WHERE id = $1
       LIMIT 1`,
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ message: "User not found" });
      return;
    }

    const user = userResult.rows[0];

    const roleResult = await pool.query(
      `SELECT r.id as role_id, r.name as role_name, r.is_super_admin
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND (ur.is_deleted IS NULL OR ur.is_deleted = false)
       LIMIT 1`,
      [user.id]
    );

    const userRole = roleResult.rows.length > 0 ? roleResult.rows[0] : null;
    const roleName = userRole?.role_name || "";
    const isSuperAdmin = userRole?.is_super_admin === true;

    let permissions: Array<{
      moduleId: number;
      moduleName: string;
      isManage: boolean;
      isDelete: boolean;
    }> = [];

    if (userRole && !isSuperAdmin) {
      const permResult = await pool.query(
        `SELECT m.id as module_id, m.name as module_name, map.manage, map.delete
         FROM module_access_permissions map
         JOIN modules m ON map.module_id = m.id
         WHERE map.role_id = $1`,
        [userRole.role_id]
      );

      permissions = permResult.rows.map((p) => ({
        moduleId: Number(p.module_id),
        moduleName: p.module_name,
        isManage: p.manage === true,
        isDelete: p.delete === true,
      }));
    }

    const responseData = {
      email: user.email,
      firstName: user.first_name || "",
      lastName: user.last_name || "",
      pictureFileName: resolveFileUrl(user.picture_file_name, "users") || "",
      userName: user.user_name || "",
      roleName,
      isSuperAdmin,
      isApprouveRequired: user.is_approuve_required ?? true,
      isUserHidden: user.is_user_hidden ?? false,
      emailFromUsersOn: user.email_from_users_on ?? false,
      emailFromGroupsOn: user.email_from_groups_on ?? false,
      optOutEmailNotifications: user.opt_out_email_notifications ?? false,
      isAnonymousInvestment: user.is_anonymous_investment ?? false,
      consentToShowAvatar: user.consent_to_show_avatar ?? true,
      permissions: isSuperAdmin ? [] : permissions,
    };

    res.json(responseData);
  } catch (err) {
    console.error("Get user by token error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
