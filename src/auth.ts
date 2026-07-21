import { timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { config } from "./config.ts";

/** Constant-time compare so a wrong secret can't be recovered by timing the response. */
function secretMatches(presented: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(config.apiSecret);
  // timingSafeEqual throws on length mismatch, so guard first. Leaking only the
  // length of a 64-char random secret is not a practical concern.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Accepts either `Authorization: Bearer <secret>` or `X-API-Key: <secret>`. */
function presentedSecret(req: Request): string | null {
  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  return req.get("x-api-key")?.trim() || null;
}

/**
 * Mounted before the routes so protection is default-deny: anything registered
 * after this middleware requires the secret without having to opt in.
 */
export const requireApiSecret: RequestHandler = (req, res, next) => {
  const presented = presentedSecret(req);
  if (!presented || !secretMatches(presented)) {
    res.status(401).json({ error: "Missing or invalid API secret." });
    return;
  }
  next();
};
