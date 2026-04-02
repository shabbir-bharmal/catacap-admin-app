import type { Request, Response, NextFunction } from "express";

const API_ACCESS_TOKEN = process.env.VITE_API_ACCESS_TOKEN || process.env.API_ACCESS_TOKEN || "";

export function apiAccessTokenMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers["api-access-token"] as string | undefined;

  if (!token || token !== API_ACCESS_TOKEN) {
    res.status(401).json({ message: "Invalid or missing API access token" });
    return;
  }

  next();
}
