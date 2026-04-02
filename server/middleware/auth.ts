import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "catacap-jwt-secret-key";

export function apiAccessTokenMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["api-access-token"] as string;
  const expectedToken = process.env.VITE_API_ACCESS_TOKEN;

  if (!expectedToken || token === expectedToken) {
    next();
  } else {
    res.status(401).json({ message: "Invalid API access token" });
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export { JWT_SECRET };
