import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pool from "../db/pool.js";
import { JWT_SECRET } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, emailOrUsername, password } = req.body;
    const loginId = email || emailOrUsername;

    if (!loginId || !password) {
      res.status(400).json({ message: "Email/username and password are required" });
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.username, u.email, u.password_hash, r.name as role
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE (LOWER(u.email) = LOWER($1) OR LOWER(u.username) = LOWER($1))
         AND r.name = 'Admin'`,
      [loginId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ message: "Invalid email or password. Please try again." });
      return;
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      res.status(401).json({ message: "Invalid email or password. Please try again." });
      return;
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    const modules = [
      { name: "Dashboard", permissions: ["view"] },
      { name: "Users", permissions: ["view", "manage", "delete"] },
      { name: "Investments", permissions: ["view", "manage", "delete"] },
      { name: "Groups", permissions: ["view", "manage", "delete"] },
      { name: "Finance", permissions: ["view", "manage"] },
      { name: "Settings", permissions: ["view", "manage"] },
    ];

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      modules,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export { router as authRouter };
export default router;
