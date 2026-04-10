import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { verifyAspNetIdentityV3Hash } from "../utils/aspnetIdentityHash.js";
import { generateToken, verifyToken } from "../utils/jwt.js";
import { generateTwoFactorCode, verifyTwoFactorCode } from "../utils/twoFactor.js";
import { jwtAuthMiddleware } from "../middleware/jwtAuth.js";

const router = Router();

interface UserRole {
  role_id: string;
  role_name: string;
  is_super_admin: boolean;
}

interface UserRolesResult {
  roles: UserRole[];
  hasAdminAccess: boolean;
  isSuperAdmin: boolean;
}

async function findUserRoles(userId: string): Promise<UserRolesResult> {
  const roleResult = await pool.query(
    `SELECT r.id as role_id, r.name as role_name, r.is_super_admin
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id = $1 AND (ur.is_deleted IS NULL OR ur.is_deleted = false)`,
    [userId]
  );

  const roles: UserRole[] = roleResult.rows.map((row: { role_id: string; role_name: string; is_super_admin: boolean }) => ({
    role_id: row.role_id,
    role_name: row.role_name || "",
    is_super_admin: row.is_super_admin === true,
  }));

  const isSuperAdmin = roles.some(r => r.is_super_admin);
  const hasAdminAccess = roles.some(r => {
    const name = r.role_name.toLowerCase();
    return name === "admin" || name === "superadmin" || r.is_super_admin;
  });

  return { roles, hasAdminAccess, isSuperAdmin };
}

async function getPermissionClaims(
  roleIds: string[],
  isSuperAdmin: boolean
): Promise<string[]> {
  if (isSuperAdmin || roleIds.length === 0) return [];

  const permResult = await pool.query(
    `SELECT m.name as module_name, map.manage, map.delete
     FROM module_access_permissions map
     JOIN modules m ON map.module_id = m.id
     WHERE map.role_id = ANY($1)`,
    [roleIds]
  );

  const claims: string[] = [];
  for (const p of permResult.rows) {
    const moduleName = (p.module_name || "").toLowerCase();
    if (p.manage) claims.push(`${moduleName}.Manage`);
    if (p.delete) claims.push(`${moduleName}.Delete`);
  }

  return [...new Set(claims)];
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

    const { roles, hasAdminAccess, isSuperAdmin } = await findUserRoles(user.id);
    if (!hasAdminAccess) {
      res.status(401).json({ message: "Access denied. Admin role required." });
      return;
    }

    if (user.two_factor_enabled) {
      generateTwoFactorCode(user.email);
      res.json({ requires2FA: true, email: user.email });
      return;
    }

    const roleIds = roles.map(r => r.role_id);
    const roleNames = roles.map(r => r.role_name);
    const permissionClaims = await getPermissionClaims(roleIds, isSuperAdmin);

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      role: roleNames[0] || "",
      roles: roleNames,
      isSuperAdmin,
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

    const { roles, hasAdminAccess, isSuperAdmin } = await findUserRoles(user.id);
    if (!hasAdminAccess) {
      res.status(401).json({ message: "Access denied. Admin role required." });
      return;
    }

    const roleIds = roles.map(r => r.role_id);
    const roleNames = roles.map(r => r.role_name);
    const permissionClaims = await getPermissionClaims(roleIds, isSuperAdmin);

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      role: roleNames[0] || "",
      roles: roleNames,
      isSuperAdmin,
      permissions: permissionClaims,
    });

    res.json({ token });
  } catch (err) {
    console.error("2FA verification error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/assign-group-admin", jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId || !userId.trim()) {
      res.status(400).json({ success: false, message: "User Id is required" });
      return;
    }

    const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      res.status(400).json({ success: false, message: "User not found" });
      return;
    }

    const groupAdminRoleResult = await pool.query(
      "SELECT id FROM roles WHERE name = 'GroupAdmin' LIMIT 1"
    );

    let groupAdminRoleId: string;
    if (groupAdminRoleResult.rows.length === 0) {
      groupAdminRoleId = (await import("crypto")).randomUUID();
      await pool.query(
        "INSERT INTO roles (id, name, normalized_name, concurrency_stamp, is_super_admin) VALUES ($1, $2, $3, $4, $5)",
        [groupAdminRoleId, "GroupAdmin", "GROUPADMIN", (await import("crypto")).randomUUID(), false]
      );
    } else {
      groupAdminRoleId = groupAdminRoleResult.rows[0].id;
    }

    const existingRole = await pool.query(
      "SELECT user_id, role_id FROM user_roles WHERE user_id = $1 AND role_id = $2",
      [userId, groupAdminRoleId]
    );

    let message: string;
    if (existingRole.rows.length > 0) {
      await pool.query(
        "DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2",
        [userId, groupAdminRoleId]
      );
      message = "Group admin role removed successfully.";
    } else {
      await pool.query(
        "INSERT INTO user_roles (user_id, role_id, discriminator, is_deleted) VALUES ($1, $2, $3, false)",
        [userId, groupAdminRoleId, "IdentityUserRole<string>"]
      );
      message = "Group admin role assigned successfully.";
    }

    res.json({ success: true, message });
  } catch (err) {
    console.error("Assign group admin error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/loginAdminToUser", jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { userToken, email } = req.body;

    if (!userToken || !email) {
      res.status(400).json({ message: "Token and email are required" });
      return;
    }

    const decoded = verifyToken(userToken);
    if (!decoded) {
      res.status(400).json({ message: "Invalid admin token" });
      return;
    }

    if (decoded.id !== req.user?.id) {
      res.status(400).json({ message: "Token does not match authenticated caller" });
      return;
    }

    const adminResult = await pool.query(
      "SELECT id FROM users WHERE id = $1",
      [decoded.id]
    );
    if (adminResult.rows.length === 0) {
      res.status(400).json({ message: "Admin user not found" });
      return;
    }

    const targetResult = await pool.query(
      "SELECT id, email, user_name, first_name, last_name, is_active FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );

    if (targetResult.rows.length === 0 || targetResult.rows[0].is_active !== true) {
      res.status(400).json({ message: "Target user not found or inactive" });
      return;
    }

    const targetUser = targetResult.rows[0];

    const roleResult = await pool.query(
      `SELECT r.id as role_id, r.name as role_name, r.is_super_admin
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND (ur.is_deleted IS NULL OR ur.is_deleted = false)`,
      [targetUser.id]
    );

    const targetRoles: UserRole[] = roleResult.rows.map((row: { role_id: string; role_name: string; is_super_admin: boolean }) => ({
      role_id: row.role_id,
      role_name: row.role_name || "",
      is_super_admin: row.is_super_admin === true,
    }));

    const roleNames = targetRoles.map(r => r.role_name);
    const roleName = roleNames[0] || "User";
    const isSuperAdmin = targetRoles.some(r => r.is_super_admin);

    const roleIds = targetRoles.map(r => r.role_id);
    const permissionClaims = await getPermissionClaims(roleIds, isSuperAdmin);

    const token = generateToken({
      id: targetUser.id,
      email: targetUser.email,
      name: `${targetUser.first_name || ""} ${targetUser.last_name || ""}`.trim(),
      role: roleName,
      roles: roleNames.length > 0 ? roleNames : ["User"],
      isSuperAdmin,
      permissions: permissionClaims,
    });

    res.json({ token });
  } catch (err) {
    console.error("Login admin to user error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

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
      "INSERT INTO user_roles (user_id, role_id, discriminator, is_deleted) VALUES ($1, $2, $3, false)",
      [userId, roleId, "IdentityUserRole<string>"]
    );

    res.json({ success: true, message: "Role updated successfully." });
  } catch (err) {
    console.error("Assign role error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
