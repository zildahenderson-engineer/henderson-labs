import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { asaasWebhookEvents, auditLogs, billingPayments, organizations } from "../drizzle/schema";
import { getDb } from "./db";
import { verifyAsaasWebhook } from "./services.asaas";

type AsaasPayload = { id?: string; event?: string; payment?: { id?: string; externalReference?: string; status?: string; confirmedDate?: string | null; paymentDate?: string | null } };

const statusByEvent: Record<string, "pending" | "confirmed" | "received" | "overdue" | "cancelled" | "refunded" | "failed"> = {
  PAYMENT_CREATED: "pending", PAYMENT_CONFIRMED: "confirmed", PAYMENT_RECEIVED: "received", PAYMENT_OVERDUE: "overdue", PAYMENT_DELETED: "cancelled", PAYMENT_BANK_SLIP_CANCELLED: "cancelled", PAYMENT_REFUNDED: "refunded", PAYMENT_PARTIALLY_REFUNDED: "refunded", PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: "failed",
};

export async function receiveAsaasWebhook(req: Request, res: Response) {
  if (!verifyAsaasWebhook(req.header("asaas-access-token"))) return res.status(401).json({ error: "invalid webhook token" });
  const body = req.body as AsaasPayload;
  if (!body.id || !body.event) return res.status(400).json({ error: "invalid event" });
  const db = await getDb();
  if (!db) return res.status(503).json({ error: "database unavailable" });
  const paymentId = body.payment?.id ?? null;
  try {
    await db.insert(asaasWebhookEvents).values({ eventId: body.id, event: body.event, providerPaymentId: paymentId });
  } catch {
    return res.status(200).json({ received: true, duplicate: true });
  }
  const externalReference = body.payment?.externalReference;
  if (!externalReference) return res.status(200).json({ received: true, ignored: true });
  const nextStatus = statusByEvent[body.event];
  if (!nextStatus) return res.status(200).json({ received: true, ignored: true });
  const payment = (await db.select().from(billingPayments).where(eq(billingPayments.externalReference, externalReference)).limit(1))[0];
  if (!payment) return res.status(200).json({ received: true, ignored: true });
  const paid = nextStatus === "confirmed" || nextStatus === "received";
  const reverted = nextStatus === "refunded" || nextStatus === "cancelled";
  const paidAt = paid ? new Date(body.payment?.paymentDate || body.payment?.confirmedDate || Date.now()) : payment.paidAt;
  await db.transaction(async tx => {
    await tx.update(billingPayments).set({ status: nextStatus, providerPaymentId: paymentId, lastEventId: body.id, paidAt }).where(eq(billingPayments.id, payment.id));
    if (paid) {
      await tx.update(organizations).set({ plan: payment.requestedPlan }).where(eq(organizations.id, payment.organizationId));
      await tx.insert(auditLogs).values({ organizationId: payment.organizationId, action: "organization.plan_activated", entityType: "billing_payment", entityId: payment.id, metadata: { event: body.event, providerPaymentId: paymentId, plan: payment.requestedPlan } });
    } else if (reverted && payment.previousPlan) {
      await tx.update(organizations).set({ plan: payment.previousPlan }).where(and(eq(organizations.id, payment.organizationId), eq(organizations.plan, payment.requestedPlan)));
      await tx.insert(auditLogs).values({ organizationId: payment.organizationId, action: "organization.plan_reverted", entityType: "billing_payment", entityId: payment.id, metadata: { event: body.event, providerPaymentId: paymentId, plan: payment.previousPlan } });
    }
  });
  return res.status(200).json({ received: true });
}
