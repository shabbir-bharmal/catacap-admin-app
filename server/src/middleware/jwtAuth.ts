import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import type { JwtPayload } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const ADMIN_ROLES = ["admin", "superadmin"];

export function jwtAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  if (!decoded.isSuperAdmin && !ADMIN_ROLES.includes(decoded.role.toLowerCase())) {
    res.status(403).json({ message: "Admin access required" });
    return;
  }

  req.user = decoded;
  next();
}
