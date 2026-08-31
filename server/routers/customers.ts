import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { customers, customerActivities } from "../../drizzle/schema";
import { getCustomer, getCustomerDetail, getDb, listCustomers } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { assertCanEdit, organizationContext } from "./context";

const customerInput = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().max(320).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  lastPurchaseAt: z.coerce.date().optional().nullable(),
  totalSpent: z.coerce.number().min(0).max(99_999_999).optional(),
  points: z.coerce.number().int().min(0).max(9_999_999).optional(),
  consentWhatsapp: z.boolean().optional(),
  pipelineStage: z.enum(["new", "contacted", "interested", "customer", "recurring"]).optional(),
});

async function contextFor(ctx: { user: NonNullable<unknown> }) {
  return organizationContext(ctx.user as { id: number; name: string | null; email: string | null });
}

export const customersRouter = router({
  list: protectedProcedure.input(z.object({
    query: z.string().max(120).optional(),
    status: z.enum(["active", "at_risk", "inactive"]).optional(),
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(10).max(100).optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const { organization } = await contextFor(ctx);
    return listCustomers(organization.id, input ?? {});
  }),

  detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { organization } = await contextFor(ctx);
    const detail = await getCustomerDetail(organization.id, input.id);
    if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
    return detail;
  }),

  create: protectedProcedure.input(customerInput).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await contextFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const created = await db.insert(customers).values({
      organizationId: organization.id,
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
      notes: input.notes || null,
      lastPurchaseAt: input.lastPurchaseAt || null,
      lastInteractionAt: input.lastPurchaseAt || null,
      totalSpent: String(input.totalSpent ?? 0),
      points: input.points ?? 0,
      loyaltyToken: nanoid(32),
      consentWhatsapp: input.consentWhatsapp ?? false,
      pipelineStage: input.pipelineStage ?? "new",
      status: "active",
    }).$returningId();
    const customerId = created[0]!.id;
    await db.insert(customerActivities).values({
      organizationId: organization.id,
      customerId,
      type: "note",
      content: "Cliente cadastrado no Henderson Labs.",
      createdByUserId: ctx.user.id,
    });
    return { id: customerId };
  }),

  update: protectedProcedure.input(customerInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await contextFor(ctx);
    assertCanEdit(membership.role);
    const customer = await getCustomer(organization.id, input.id);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    const updateSet: Record<string, unknown> = {};
    if (data.name !== undefined) updateSet.name = data.name;
    if (data.phone !== undefined) updateSet.phone = data.phone || null;
    if (data.email !== undefined) updateSet.email = data.email || null;
    if (data.notes !== undefined) updateSet.notes = data.notes || null;
    if (data.lastPurchaseAt !== undefined) updateSet.lastPurchaseAt = data.lastPurchaseAt;
    if (data.totalSpent !== undefined) updateSet.totalSpent = String(data.totalSpent);
    if (data.points !== undefined) updateSet.points = data.points;
    if (data.consentWhatsapp !== undefined) updateSet.consentWhatsapp = data.consentWhatsapp;
    if (data.pipelineStage !== undefined) updateSet.pipelineStage = data.pipelineStage;
    if (Object.keys(updateSet).length) {
      await db.update(customers).set(updateSet).where(and(eq(customers.id, id), eq(customers.organizationId, organization.id)));
    }
    return { success: true };
  }),

  addNote: protectedProcedure.input(z.object({ id: z.number().int().positive(), content: z.string().trim().min(2).max(4000) })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await contextFor(ctx);
    assertCanEdit(membership.role);
    if (!await getCustomer(organization.id, input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(customerActivities).values({
      organizationId: organization.id,
      customerId: input.id,
      type: "note",
      content: input.content,
      createdByUserId: ctx.user.id,
    });
    await db.update(customers).set({ lastInteractionAt: new Date() }).where(and(eq(customers.id, input.id), eq(customers.organizationId, organization.id)));
    return { success: true };
  }),

  addPurchase: protectedProcedure.input(z.object({ id: z.number().int().positive(), amount: z.coerce.number().positive().max(99_999_999), note: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await contextFor(ctx);
    assertCanEdit(membership.role);
    if (!await getCustomer(organization.id, input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const now = new Date();
    await db.update(customers).set({
      lastPurchaseAt: now,
      lastInteractionAt: now,
      status: "active",
      pipelineStage: "customer",
      totalSpent: sql`${customers.totalSpent} + ${input.amount}`,
    }).where(and(eq(customers.id, input.id), eq(customers.organizationId, organization.id)));
    await db.insert(customerActivities).values({
      organizationId: organization.id,
      customerId: input.id,
      type: "purchase",
      content: input.note || "Compra registrada.",
      amount: String(input.amount),
      createdByUserId: ctx.user.id,
    });
    return { success: true };
  }),

  refreshStatuses: protectedProcedure.mutation(async ({ ctx }) => {
    const { organization, membership } = await contextFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const riskDate = new Date(Date.now() - organization.activeDays * 86_400_000);
    const inactiveDate = new Date(Date.now() - organization.riskDays * 86_400_000);
    await db.update(customers).set({ status: "inactive" }).where(and(
      eq(customers.organizationId, organization.id),
      sql`(${customers.lastPurchaseAt} IS NULL OR ${customers.lastPurchaseAt} <= ${inactiveDate})`,
    ));
    await db.update(customers).set({ status: "at_risk" }).where(and(
      eq(customers.organizationId, organization.id),
      sql`${customers.lastPurchaseAt} > ${inactiveDate} AND ${customers.lastPurchaseAt} <= ${riskDate}`,
    ));
    await db.update(customers).set({ status: "active" }).where(and(
      eq(customers.organizationId, organization.id),
      sql`${customers.lastPurchaseAt} > ${riskDate}`,
    ));
    return { success: true };
  }),

  activity: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { organization } = await contextFor(ctx);
    if (!await getCustomer(organization.id, input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(customerActivities).where(and(eq(customerActivities.organizationId, organization.id), eq(customerActivities.customerId, input.id))).orderBy(desc(customerActivities.createdAt)).limit(40);
  }),
});
