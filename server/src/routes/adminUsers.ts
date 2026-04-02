import { Router } from "express";
import type { Request, Response } from "express";
import pool from "../db.js";
import { hashAspNetIdentityV3 } from "../utils/aspnetIdentityHash.js";
import crypto from "crypto";

const router = Router();

router.get("/admin-users", async (req: Request, res: Response) => {
  try {
    const sortDirection = ((req.query.SortDirection as string) || "").toLowerCase();
    const isAsc = sortDirection === "asc";
    const page = parseInt((req.query.CurrentPage as string) || "1", 10);
    const pageSize = parseInt((req.query.PerPage as string) || "50", 10);
    const searchValue = ((req.query.SearchValue as string) || "").trim().toLowerCase();
    const sortField = ((req.query.SortField as string) || "").toLowerCase();

    let baseQuery = `
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name != 'User' AND r.name != 'GroupAdmin'
        AND (ur.is_deleted IS NULL OR ur.is_deleted = false)
    `;
    const params: (string | number)[] = [];

    if (searchValue) {
      params.push(`%${searchValue}%`);
      const idx = params.length;
      baseQuery += ` AND (
        LOWER(TRIM(COALESCE(u.first_name, ''))) LIKE $${idx}
        OR LOWER(TRIM(COALESCE(u.last_name, ''))) LIKE $${idx}
        OR LOWER(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))) LIKE $${idx}
        OR LOWER(TRIM(COALESCE(u.email, ''))) LIKE $${idx}
      )`;
    }

    let orderClause: string;
    const dir = isAsc ? "ASC" : "DESC";
    switch (sortField) {
      case "fullname":
        orderClause = `ORDER BY u.first_name ${dir}, u.last_name ${dir}`;
        break;
      case "datecreated":
        orderClause = `ORDER BY u.date_created ${dir}`;
        break;
      case "rolename":
        orderClause = `ORDER BY r.name ${dir}`;
        break;
      case "email":
        orderClause = `ORDER BY u.email ${dir}`;
        break;
      default:
        orderClause = `ORDER BY u.first_name ASC, u.last_name ASC`;
        break;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) as total ${baseQuery}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].total, 10);

    const offset = (page - 1) * pageSize;
    const dataParams = [...params, pageSize, offset];
    const dataResult = await pool.query(
      `SELECT u.id, u.first_name, u.last_name,
              COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as full_name,
              u.user_name, u.email, u.is_active, u.date_created,
              ur.role_id, r.name as role_name
       ${baseQuery}
       ${orderClause}
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const items = dataResult.rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: row.full_name,
      userName: row.user_name,
      email: row.email,
      isActive: row.is_active,
      dateCreated: row.date_created,
      roleId: row.role_id,
      roleName: row.role_name,
    }));
    res.json({ items, totalCount });
  } catch (err) {
    console.error("Get admin users error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/admin-users", async (req: Request, res: Response) => {
  try {
    const { id, email, firstName, lastName, userName, password, isActive, roleId } = req.body;

    if (!email || !email.trim()) {
      res.json({ success: false, message: "Email is required." });
      return;
    }

    if (!firstName || !firstName.trim()) {
      res.json({ success: false, message: "First name is required." });
      return;
    }

    if (!lastName || !lastName.trim()) {
      res.json({ success: false, message: "Last name is required." });
      return;
    }

    if (!id && (!password || !password.trim())) {
      res.json({ success: false, message: "Password is required for new user." });
      return;
    }

    if (!roleId || !roleId.trim()) {
      res.json({ success: false, message: "Role is required." });
      return;
    }

    if (id) {
      const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      if (userResult.rows.length === 0) {
        res.json({ success: false, message: "User not found." });
        return;
      }
      const user = userResult.rows[0];

      const emailDup = await pool.query(
        "SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND id != $2",
        [email, id]
      );
      if (emailDup.rows.length > 0) {
        res.json({ success: false, message: "Email already exists." });
        return;
      }

      if (userName) {
        const usernameDup = await pool.query(
          "SELECT id FROM users WHERE user_name = $1 AND id != $2",
          [userName, id]
        );
        if (usernameDup.rows.length > 0) {
          res.json({ success: false, message: "Username already exists." });
          return;
        }
      }

      let passwordHash = user.password_hash;
      if (password && password.trim()) {
        passwordHash = hashAspNetIdentityV3(password);
      }

      await pool.query(
        `UPDATE users SET first_name = $1, last_name = $2, email = $3, user_name = $4,
         is_active = $5, password_hash = $6, normalized_email = $7, normalized_user_name = $8
         WHERE id = $9`,
        [
          firstName,
          lastName,
          email,
          userName,
          isActive ?? false,
          passwordHash,
          email.toUpperCase().trim(),
          userName ? userName.toUpperCase() : null,
          id,
        ]
      );

      const existingRole = await pool.query(
        "SELECT role_id FROM user_roles WHERE user_id = $1 AND (is_deleted IS NULL OR is_deleted = false)",
        [id]
      );

      if (existingRole.rows.length > 0) {
        if (existingRole.rows[0].role_id !== roleId) {
          await pool.query("DELETE FROM user_roles WHERE user_id = $1", [id]);
          await pool.query(
            "INSERT INTO user_roles (user_id, role_id, discriminator) VALUES ($1, $2, $3)",
            [id, roleId, "IdentityUserRole<string>"]
          );
        }
      } else {
        await pool.query(
          "INSERT INTO user_roles (user_id, role_id, discriminator) VALUES ($1, $2, $3)",
          [id, roleId, "IdentityUserRole<string>"]
        );
      }

      res.json({ success: true, message: "Admin user updated successfully." });
    } else {
      const existsUsername = await pool.query(
        "SELECT id FROM users WHERE user_name = $1",
        [userName]
      );
      if (existsUsername.rows.length > 0) {
        res.json({ success: false, message: "Username already exists." });
        return;
      }

      const duplicateEmail = await pool.query(
        "SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))",
        [email]
      );
      if (duplicateEmail.rows.length > 0) {
        res.json({ success: false, message: "Email is already registered." });
        return;
      }

      const roleResult = await pool.query("SELECT id, name FROM roles WHERE id = $1", [roleId]);
      if (roleResult.rows.length === 0) {
        res.json({ success: false, message: "Invalid role selected." });
        return;
      }

      const userId = crypto.randomUUID();
      const passwordHash = hashAspNetIdentityV3(password);
      const securityStamp = crypto.randomUUID();
      const concurrencyStamp = crypto.randomUUID();

      await pool.query(
        `INSERT INTO users (id, first_name, last_name, email, normalized_email,
         user_name, normalized_user_name, password_hash, security_stamp,
         concurrency_stamp, is_active, date_created, email_confirmed,
         phone_number_confirmed, two_factor_enabled, lockout_enabled,
         access_failed_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), false, false, false, true, 0)`,
        [
          userId,
          firstName,
          lastName,
          email.toLowerCase().trim(),
          email.toUpperCase().trim(),
          userName,
          userName ? userName.toUpperCase() : null,
          passwordHash,
          securityStamp,
          concurrencyStamp,
          isActive ?? false,
        ]
      );

      await pool.query(
        "INSERT INTO user_roles (user_id, role_id, discriminator) VALUES ($1, $2, $3)",
        [userId, roleId, "IdentityUserRole<string>"]
      );

      res.json({ success: true, message: "Admin user created successfully." });
    }
  } catch (err) {
    console.error("Save admin user error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/:id/settings", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const isActive = req.query.isActive as string | undefined;
    const isExcludeUserBalance = req.query.isExcludeUserBalance as string | undefined;

    if (!id || !(id as string).trim()) {
      res.status(400).json({ message: "User id is required." });
      return;
    }

    const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [id]);
    if (userResult.rows.length === 0) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    const updates: string[] = [];
    const values: (string | boolean)[] = [];
    let paramIdx = 1;

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      values.push(isActive === "true");
    }

    if (isExcludeUserBalance !== undefined) {
      updates.push(`is_exclude_user_balance = $${paramIdx++}`);
      values.push(isExcludeUserBalance === "true");
    }

    if (updates.length === 0) {
      res.status(400).json({ message: "No settings to update." });
      return;
    }

    values.push(id as string);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
      values
    );

    if (result.rowCount && result.rowCount > 0) {
      res.status(200).send();
    } else {
      res.status(400).send();
    }
  } catch (err) {
    console.error("Update settings error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
