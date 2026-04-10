import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const dashboardResult = await pool.query(
      "SELECT id, name FROM modules WHERE name = 'dashboard' LIMIT 1"
    );
    const dashboardModule = dashboardResult.rows.length > 0 ? dashboardResult.rows[0] : null;

    const rolesResult = await pool.query(
      "SELECT id, name, is_super_admin FROM roles ORDER BY name"
    );

    const roles = [];
    for (const role of rolesResult.rows) {
      let permissions: Array<{
        moduleId: number;
        moduleName: string;
        isManage: boolean;
        isDelete: boolean;
      }> = [];

      if (!role.is_super_admin) {
        const permResult = await pool.query(
          `SELECT map.module_id, m.name as module_name, map.manage, map."delete"
           FROM module_access_permissions map
           JOIN modules m ON map.module_id = m.id
           WHERE map.role_id = $1`,
          [role.id]
        );

        permissions = permResult.rows.map((p) => ({
          moduleId: Number(p.module_id),
          moduleName: p.module_name,
          isManage: p.manage === true,
          isDelete: p.delete === true,
        }));

        if (dashboardModule) {
          const hasDashboard = permissions.some(
            (p) => p.moduleId === Number(dashboardModule.id)
          );
          if (!hasDashboard) {
            permissions.push({
              moduleId: Number(dashboardModule.id),
              moduleName: dashboardModule.name,
              isManage: true,
              isDelete: false,
            });
          }
        }
      }

      roles.push({
        roleId: role.id,
        roleName: role.name,
        isSuperAdmin: role.is_super_admin === true,
        permissions,
      });
    }

    res.json(roles);
  } catch (err) {
    console.error("Get all roles with permissions error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/role", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT id, name FROM roles ORDER BY name");
    const data = result.rows.map((r) => ({ id: r.id, name: r.name }));
    res.json(data);
  } catch (err) {
    console.error("Get all roles error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/module", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, name, category, sort_order FROM modules ORDER BY sort_order, name"
    );
    const data = result.rows.map((m) => ({
      id: Number(m.id),
      name: m.name,
      category: m.category,
      sortOrder: m.sort_order,
    }));
    res.json(data);
  } catch (err) {
    console.error("Get all modules error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:roleId", async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;

    if (!roleId || !(roleId as string).trim()) {
      res.json({ success: false, message: "RoleId is required." });
      return;
    }

    const roleResult = await pool.query(
      "SELECT id, name, is_super_admin FROM roles WHERE id = $1",
      [roleId]
    );

    if (roleResult.rows.length === 0) {
      res.json({ success: false, message: "Role not found." });
      return;
    }

    const role = roleResult.rows[0];

    const permResult = await pool.query(
      `SELECT map.module_id, m.name as module_name, map.manage, map."delete"
       FROM module_access_permissions map
       JOIN modules m ON map.module_id = m.id
       WHERE map.role_id = $1`,
      [roleId]
    );

    const permissions = permResult.rows.map((p) => ({
      moduleId: Number(p.module_id),
      moduleName: p.module_name,
      isManage: p.manage === true,
      isDelete: p.delete === true,
    }));

    res.json({
      roleId: role.id,
      roleName: role.name,
      isSuperAdmin: role.is_super_admin === true,
      permissions,
    });
  } catch (err) {
    console.error("Get role by id error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { roleId, roleName, isSuperAdmin, permissions } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    if (!roleName || !roleName.trim()) {
      res.json({ success: false, message: "Role name is required." });
      return;
    }

    await client.query("BEGIN");

    let roleDbId: string;

    if (roleId && roleId.trim()) {
      const roleResult = await client.query(
        "SELECT id FROM roles WHERE id = $1",
        [roleId]
      );

      if (roleResult.rows.length === 0) {
        await client.query("ROLLBACK");
        res.json({ success: false, message: "Role not found." });
        return;
      }

      const dupResult = await client.query(
        "SELECT id FROM roles WHERE name = $1 AND id != $2",
        [roleName, roleId]
      );

      if (dupResult.rows.length > 0) {
        await client.query("ROLLBACK");
        res.json({ success: false, message: "Role name already exists." });
        return;
      }

      await client.query(
        "UPDATE roles SET name = $1, normalized_name = $2, is_super_admin = $3 WHERE id = $4",
        [roleName, roleName.toUpperCase(), isSuperAdmin ?? false, roleId]
      );

      roleDbId = roleId;
    } else {
      const existsResult = await client.query(
        "SELECT id FROM roles WHERE name = $1",
        [roleName]
      );

      if (existsResult.rows.length > 0) {
        await client.query("ROLLBACK");
        res.json({ success: false, message: "Role already exists." });
        return;
      }

      const { randomUUID } = await import("crypto");
      const newRoleId = randomUUID();

      await client.query(
        "INSERT INTO roles (id, name, normalized_name, is_super_admin, concurrency_stamp) VALUES ($1, $2, $3, $4, $5)",
        [newRoleId, roleName, roleName.toUpperCase(), isSuperAdmin ?? false, randomUUID()]
      );

      roleDbId = newRoleId;
    }

    await client.query(
      "DELETE FROM module_access_permissions WHERE role_id = $1",
      [roleDbId]
    );

    if (isSuperAdmin) {
      await client.query("COMMIT");
      const message = roleId
        ? "Super Admin permissions updated successfully."
        : "Super Admin permissions assigned successfully.";
      res.json({ success: true, message, data: roleDbId });
      return;
    }

    if (permissions && Array.isArray(permissions)) {
      for (const perm of permissions) {
        const moduleExists = await client.query(
          "SELECT id FROM modules WHERE id = $1",
          [perm.moduleId]
        );

        if (moduleExists.rows.length === 0) continue;

        await client.query(
          `INSERT INTO module_access_permissions (module_id, role_id, manage, "delete", updated_by, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [perm.moduleId, roleDbId, perm.isManage ?? false, perm.isDelete ?? false, userId]
        );
      }
    }

    const dashboardResult = await client.query(
      "SELECT id FROM modules WHERE name = 'dashboard' LIMIT 1"
    );

    if (dashboardResult.rows.length > 0) {
      const dashboardModuleId = dashboardResult.rows[0].id;
      const existingDashboard = await client.query(
        "SELECT id FROM module_access_permissions WHERE role_id = $1 AND module_id = $2",
        [roleDbId, dashboardModuleId]
      );

      if (existingDashboard.rows.length === 0) {
        await client.query(
          `INSERT INTO module_access_permissions (module_id, role_id, manage, "delete", updated_by, created_at)
           VALUES ($1, $2, true, false, $3, NOW())`,
          [dashboardModuleId, roleDbId, userId]
        );
      }
    }

    await client.query("COMMIT");
    const message = roleId
      ? "Permissions updated successfully."
      : "Permissions assigned successfully.";
    res.json({ success: true, message, data: roleDbId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Save role with permissions error:", err);
    res.status(400).json({ success: false, message: (err as Error).message });
  } finally {
    client.release();
  }
});

router.delete("/:roleId", async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;

    const roleResult = await pool.query(
      "SELECT id FROM roles WHERE id = $1",
      [roleId]
    );

    if (roleResult.rows.length === 0) {
      res.json({ success: false, message: "Role not found." });
      return;
    }

    const assignedUsers = await pool.query(
      "SELECT COUNT(*) as count FROM user_roles WHERE role_id = $1 AND (is_deleted IS NULL OR is_deleted = false)",
      [roleId]
    );

    if (parseInt(assignedUsers.rows[0].count, 10) > 0) {
      res.status(409).json({
        success: false,
        message: "Cannot delete this role because it is currently assigned to users. Please reassign those users to a different role first.",
      });
      return;
    }

    await pool.query(
      "DELETE FROM module_access_permissions WHERE role_id = $1",
      [roleId]
    );

    await pool.query("DELETE FROM roles WHERE id = $1", [roleId]);

    res.json({ success: true, message: "Role and related permissions deleted successfully." });
  } catch (err) {
    console.error("Delete role error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
