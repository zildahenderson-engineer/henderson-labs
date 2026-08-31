import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { customers, loyaltyRewards, loyaltyTransactions } from "../../drizzle/schema";
import { getCustomer, getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { assertCanEdit, organizationContext } from "./context";

async function orgFor(ctx: { user: unknown }) {
  return organizationContext(ctx.user as { id: number; name: string | null; email: string | null });
}

export const loyaltyRouter = router({
  publicProfile: publicProcedure.input(z.object({ token: z.string().min(24).max(64) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const customer = (await db.select().from(customers).where(eq(customers.loyaltyToken, input.token)).limit(1))[0];
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cartão de fidelidade não encontrado." });
    const rewards = await db.select({ id: loyaltyRewards.id, name: loyaltyRewards.name, description: loyaltyRewards.description, pointsCost: loyaltyRewards.pointsCost, couponCode: loyaltyRewards.couponCode })
      .from(loyaltyRewards).where(and(eq(loyaltyRewards.organizationId, customer.organizationId), eq(loyaltyRewards.active, true)));
    return { customer: { name: customer.name.split(" ")[0], points: customer.points }, rewards };
  }),

  overview: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [rewards, topCustomers, totals] = await Promise.all([
      db.select().from(loyaltyRewards).where(eq(loyaltyRewards.organizationId, organization.id)).orderBy(desc(loyaltyRewards.createdAt)),
      db.select().from(customers).where(eq(customers.organizationId, organization.id)).orderBy(desc(customers.points)).limit(8),
      db.select({ distributed: sql<number>`coalesce(sum(${loyaltyTransactions.points}), 0)`, transactions: sql<number>`count(*)` }).from(loyaltyTransactions).where(eq(loyaltyTransactions.organizationId, organization.id)),
    ]);
    return { rewards, topCustomers, distributed: Number(totals[0]?.distributed ?? 0), transactions: Number(totals[0]?.transactions ?? 0) };
  }),

  createReward: protectedProcedure.input(z.object({
    name: z.string().trim().min(3).max(160),
    description: z.string().trim().max(1200).optional().nullable(),
    pointsCost: z.coerce.number().int().min(1).max(9_999_999),
    couponCode: z.string().trim().max(64).optional().nullable(),
  })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const created = await db.insert(loyaltyRewards).values({
      organizationId: organization.id,
      name: input.name,
      description: input.description || null,
      pointsCost: input.pointsCost,
      couponCode: input.couponCode || null,
    }).$returningId();
    return { id: created[0]!.id };
  }),

  adjustPoints: protectedProcedure.input(z.object({
    customerId: z.number().int().positive(),
    points: z.coerce.number().int().refine(value => value !== 0 && value >= -100000 && value <= 100000, "Use um ajuste entre -100.000 e 100.000 pontos."),
    reason: z.string().trim().min(3).max(180),
  })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const customer = await getCustomer(organization.id, input.customerId);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
    if (customer.points + input.points < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "O cliente não possui pontos suficientes para este débito." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(customers).set({ points: sql`${customers.points} + ${input.points}` }).where(and(eq(customers.id, input.customerId), eq(customers.organizationId, organization.id)));
    await db.insert(loyaltyTransactions).values({ organizationId: organization.id, customerId: input.customerId, points: input.points, reason: input.reason, createdByUserId: ctx.user.id });
    return { success: true };
  }),

  history: protectedProcedure.input(z.object({ customerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { organization } = await orgFor(ctx);
    if (!await getCustomer(organization.id, input.customerId)) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(loyaltyTransactions).where(and(eq(loyaltyTransactions.organizationId, organization.id), eq(loyaltyTransactions.customerId, input.customerId))).orderBy(desc(loyaltyTransactions.createdAt));
  }),
});
