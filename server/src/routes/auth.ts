import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { verifyAspNetIdentityV3Hash } from "../utils/aspnetIdentityHash.js";
import { generateToken } from "../utils/jwt.js";
import { generateTwoFactorCode, verifyTwoFactorCode } from "../utils/twoFactor.js";
import { jwtAuthMiddleware } from "../middleware/jwtAuth.js";

const router = Router();

interface UserRole {
  role_id: string;
  role_name: string;
  is_super_admin: boolean;
}

async function findAdminRole(userId: string): Promise<UserRole | null> {
  const roleResult = await pool.query(
    `SELECT r.id as role_id, r.name as role_name, r.is_super_admin
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id = $1 AND (ur.is_deleted IS NULL OR ur.is_deleted = false)`,
    [userId]
  );

  for (const row of roleResult.rows) {
    const name = (row.role_name || "").toLowerCase();
    if (name === "admin" || name === "superadmin" || row.is_super_admin === true) {
      return {
        role_id: row.role_id,
        role_name: row.role_name || "",
        is_super_admin: row.is_super_admin === true,
      };
    }
  }

  return null;
}

router.post("/admin/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, email, user_name, first_name, last_name, password_hash, 
              is_active, two_factor_enabled
       FROM users 
       WHERE LOWER(email) = LOWER($1) OR LOWER(user_name) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const user = userResult.rows[0];

    if (!user.password_hash) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const passwordValid = verifyAspNetIdentityV3Hash(password, user.password_hash);
    if (!passwordValid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    if (user.is_active !== true) {
      res.status(401).json({ message: "Account is not active" });
      return;
    }

    const adminRole = await findAdminRole(user.id);
    if (!adminRole) {
      res.status(401).json({ message: "Access denied. Admin role required." });
      return;
    }

    if (user.two_factor_enabled) {
      generateTwoFactorCode(user.email);
      res.json({ requires2FA: true, email: user.email });
      return;
    }

    const permissionClaims = await getPermissionClaims(adminRole.role_id, adminRole.is_super_admin);

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      role: adminRole.role_name,
      isSuperAdmin: adminRole.is_super_admin,
      permissions: permissionClaims,
    });

    res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/verify-2fa", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || code === undefined || code === null) {
      res.status(400).json({ message: "Email and code are required" });
      return;
    }

    const numericCode = typeof code === "string" ? parseInt(code, 10) : code;

    const isValid = verifyTwoFactorCode(email, numericCode);

    if (!isValid) {
      res.json({
        success: false,
        message: "Verification code is incorrect or has expired. Please request a new code and try again.",
      });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, email, user_name, first_name, last_name, is_active
       FROM users 
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      res.json({
        success: false,
        message: "Verification code is incorrect or has expired. Please request a new code and try again.",
      });
      return;
    }

    const user = userResult.rows[0];

    if (user.is_active !== true) {
      res.status(401).json({ message: "Account is not active" });
      return;
    }

    const adminRole = await findAdminRole(user.id);
    if (!adminRole) {
      res.status(401).json({ message: "Access denied. Admin role required." });
      return;
    }

    const permissionClaims = await getPermissionClaims(adminRole.role_id, adminRole.is_super_admin);

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      role: adminRole.role_name,
      isSuperAdmin: adminRole.is_super_admin,
      permissions: permissionClaims,
    });

    res.json({ token });
  } catch (err) {
    console.error("2FA verification error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

async function getPermissionClaims(
  roleId: string,
  isSuperAdmin: boolean
): Promise<string[]> {
  if (isSuperAdmin) return [];

  const permResult = await pool.query(
    `SELECT m.name as module_name, map.manage, map.delete
     FROM module_access_permissions map
     JOIN modules m ON map.module_id = m.id
     WHERE map.role_id = $1`,
    [roleId]
  );

  const claims: string[] = [];
  for (const p of permResult.rows) {
    const moduleName = (p.module_name || "").toLowerCase();
    if (p.manage) claims.push(`${moduleName}.Manage`);
    if (p.delete) claims.push(`${moduleName}.Delete`);
  }

  return [...new Set(claims)];
}

router.post("/assign-role", jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId, roleId } = req.body;

    const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      res.json({ success: false, message: "User not found" });
      return;
    }

    const roleResult = await pool.query("SELECT id, name FROM roles WHERE id = $1", [roleId]);
    if (roleResult.rows.length === 0) {
      res.json({ success: false, message: "Role not found" });
      return;
    }

    await pool.query(
      "DELETE FROM user_roles WHERE user_id = $1",
      [userId]
    );

    await pool.query(
      "INSERT INTO user_roles (user_id, role_id, discriminator) VALUES ($1, $2, $3)",
      [userId, roleId, "IdentityUserRole<string>"]
    );

    res.json({ success: true, message: "Role updated successfully." });
  } catch (err) {
    console.error("Assign role error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
