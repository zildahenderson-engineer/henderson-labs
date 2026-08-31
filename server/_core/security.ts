import type { Request } from "express";

export function sameOriginMutation(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  // Bearer sessions are not ambient browser credentials and do not need CSRF.
  if (!/(^|;\s*)app_session_id=/.test(req.headers.cookie ?? "")) return true;
  const requestHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0]!.trim();
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return false;
  try {
    return new URL(String(origin)).host === requestHost;
  } catch {
    return false;
  }
}
