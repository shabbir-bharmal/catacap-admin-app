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
  const token = req.headers.authorization?.replace("Bearer ", "") || (typeof req.query._token === "string" ? req.query._token : undefined);

  if (!token) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  const hasAdminRole = decoded.isSuperAdmin ||
    decoded.roles.some(r => ADMIN_ROLES.includes(r.toLowerCase()));

  if (!hasAdminRole) {
    res.status(403).json({ message: "Admin access required" });
    return;
  }

  req.user = decoded;
  next();
}

export function modulePermission(moduleName: string, permissionType: "Manage" | "Delete") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const requiredPermission = `${moduleName.toLowerCase()}.${permissionType}`;
    const userPermissions = req.user.permissions || [];

    if (!userPermissions.includes(requiredPermission)) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }

    next();
  };
}
