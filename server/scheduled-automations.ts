import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { automations } from "../drizzle/schema";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { executeAutomation } from "./routers/automations";

/** Platform-authenticated heartbeat endpoint. It trusts only the task UID injected by the scheduler. */
export async function runScheduledAutomation(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const automation = (await db.select().from(automations).where(eq(automations.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
    if (!automation) return res.json({ ok: true, skipped: "orphan" });
    if (!automation.enabled) return res.json({ ok: true, skipped: "disabled" });
    const result = await executeAutomation(automation.organizationId, automation, automation.createdByUserId);
    return res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro não identificado.";
    return res.status(500).json({
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
