import jwt, { type SignOptions } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set.");
  process.exit(1);
}
const JWT_ISSUER = process.env.JWT_ISSUER || "CataCap";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "CataCap";
const JWT_EXPIRES_IN_DAYS = Number(process.env.JWT_EXPIRES_IN_DAYS || 7);
const JWT_EXPIRES_IN: SignOptions["expiresIn"] = `${JWT_EXPIRES_IN_DAYS}d`;

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  isSuperAdmin: boolean;
  permissions?: string[];
}

interface JwtTokenClaims {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  IsSuperAdmin: string;
  Permission: string[];
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

function isJwtTokenClaims(value: unknown): value is JwtTokenClaims {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.email === "string" &&
    typeof obj.name === "string" &&
    typeof obj.role === "string"
  );
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(
    {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      roles: payload.roles,
      IsSuperAdmin: payload.isSuperAdmin.toString(),
      Permission: payload.permissions || [],
    },
    JWT_SECRET,
    {
      algorithm: "HS256",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: JWT_EXPIRES_IN,
    }
  );
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (!isJwtTokenClaims(decoded)) return null;

    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      roles: Array.isArray(decoded.roles) ? decoded.roles : [decoded.role],
      isSuperAdmin: decoded.IsSuperAdmin === "True" || decoded.IsSuperAdmin === "true",
      permissions: decoded.Permission || [],
    };
  } catch {
    return null;
  }
}
