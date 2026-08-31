import crypto from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { customers, campaigns, whatsappMessages } from "../drizzle/schema";
import { getDb } from "./db";

function signatureIsValid(req: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;
  const signature = req.header("x-hub-signature-256") || "";
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/** Meta verification handshake for the official WhatsApp webhook. */
export function verifyWhatsAppWebhook(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && typeof challenge === "string") return res.status(200).send(challenge);
  return res.sendStatus(403);
}

/** Processes only signed Meta callbacks; repeated status notifications are safe to replay. */
export async function receiveWhatsAppWebhook(req: Request, res: Response) {
  if (!signatureIsValid(req)) return res.status(401).json({ error: "invalid-signature" });
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const value = change?.value ?? {};
        for (const statusEvent of Array.isArray(value.statuses) ? value.statuses : []) {
          const providerId = typeof statusEvent.id === "string" ? statusEvent.id : null;
          const nextStatus = statusEvent.status;
          if (!providerId || !["sent", "delivered", "read", "failed"].includes(nextStatus)) continue;
          const message = (await db.select().from(whatsappMessages).where(eq(whatsappMessages.providerMessageId, providerId)).limit(1))[0];
          if (!message) continue;
          const status = nextStatus as "sent" | "delivered" | "read" | "failed";
          const update: Record<string, unknown> = { status };
          if (status === "delivered") update.deliveredAt = new Date(Number(statusEvent.timestamp || 0) * 1000 || Date.now());
          if (status === "read") update.readAt = new Date(Number(statusEvent.timestamp || 0) * 1000 || Date.now());
          if (status === "failed") update.errorMessage = JSON.stringify(statusEvent.errors ?? "Falha reportada pela Meta.");
          await db.update(whatsappMessages).set(update).where(eq(whatsappMessages.id, message.id));
          if (message.campaignId && status === "delivered" && !["delivered", "read"].includes(message.status)) {
            await db.update(campaigns).set({ deliveredCount: sql`${campaigns.deliveredCount} + 1` }).where(and(eq(campaigns.id, message.campaignId), eq(campaigns.organizationId, message.organizationId)));
          }
        }
        for (const incoming of Array.isArray(value.messages) ? value.messages : []) {
          const phone = String(incoming.from || "").replace(/[^0-9]/g, "");
          if (!phone) continue;
          const allCustomers = await db.select().from(customers).where(sql`REPLACE(REPLACE(REPLACE(${customers.phone}, '+', ''), ' ', ''), '-', '') = ${phone}`);
          if (allCustomers.length !== 1) continue;
          const customer = allCustomers[0]!;
          const body = incoming.text?.body || `[${incoming.type || "message"}]`;
          await db.insert(whatsappMessages).values({ organizationId: customer.organizationId, customerId: customer.id, direction: "inbound", messageType: "text", status: "received", body, createdAt: new Date(Number(incoming.timestamp || 0) * 1000 || Date.now()) });
          await db.update(customers).set({ lastInteractionAt: new Date() }).where(and(eq(customers.id, customer.id), eq(customers.organizationId, customer.organizationId)));
        }
      }
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "webhook-processing-failed" });
  }
}
