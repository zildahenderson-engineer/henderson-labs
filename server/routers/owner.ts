import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, billingPayments, customers, organizationMembers, organizations, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { protectedProcedure, router } from "../_core/trpc";
import { ASAAS_PLAN_PRICES, asaasConfiguration } from "../services.asaas";

export function assertOwnerIdentity(user: { role: string; openId: string } | null, ownerOpenId = ENV.ownerOpenId) {
  if (!user || user.role !== "admin" || !ownerOpenId || user.openId !== ownerOpenId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso exclusivo ao proprietário do Henderson Labs." });
  }
}

async function ownerDb(ctx: { user: { role: string; openId: string } | null }) {
  assertOwnerIdentity(ctx.user);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  return db;
}

export const ownerRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    await ownerDb(ctx);
    return { isOwner: true, environment: ENV.isProduction ? "production" : "development" } as const;
  }),

  overview: protectedProcedure.query(async ({ ctx }) => {
    const db = await ownerDb(ctx);
    const [orgs, userCount, customerCount, memberCount, paymentSummary, recentAudit] = await Promise.all([
      db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, plan: organizations.plan, createdAt: organizations.createdAt }).from(organizations).orderBy(desc(organizations.createdAt)),
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*)` }).from(customers),
      db.select({ count: sql<number>`count(*)` }).from(organizationMembers),
      db.select({ status: billingPayments.status, count: sql<number>`count(*)`, total: sql<string>`coalesce(sum(${billingPayments.amount}), 0)` }).from(billingPayments).groupBy(billingPayments.status),
      db.select({ id: auditLogs.id, organizationId: auditLogs.organizationId, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, createdAt: auditLogs.createdAt }).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(25),
    ]);
    return { asaas: asaasConfiguration(), organizations: orgs, totals: { organizations: orgs.length, users: Number(userCount[0]?.count ?? 0), customers: Number(customerCount[0]?.count ?? 0), members: Number(memberCount[0]?.count ?? 0) }, paymentSummary, recentAudit };
  }),

  organizationDetails: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await ownerDb(ctx);
    const organization = (await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1))[0];
    if (!organization) throw new TRPCError({ code: "NOT_FOUND", message: "Organização não encontrada." });
    const [members, customerTotal, payments, audit] = await Promise.all([
      db.select({ member: organizationMembers, user: { id: users.id, name: users.name, email: users.email } }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, input.organizationId)),
      db.select({ count: sql<number>`count(*)` }).from(customers).where(eq(customers.organizationId, input.organizationId)),
      db.select({ id: billingPayments.id, requestedPlan: billingPayments.requestedPlan, amount: billingPayments.amount, status: billingPayments.status, checkoutId: billingPayments.checkoutId, paidAt: billingPayments.paidAt, createdAt: billingPayments.createdAt }).from(billingPayments).where(eq(billingPayments.organizationId, input.organizationId)).orderBy(desc(billingPayments.createdAt)).limit(20),
      db.select({ id: auditLogs.id, action: auditLogs.action, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt }).from(auditLogs).where(eq(auditLogs.organizationId, input.organizationId)).orderBy(desc(auditLogs.createdAt)).limit(25),
    ]);
    return { organization, members, customerTotal: Number(customerTotal[0]?.count ?? 0), payments, audit };
  }),

  setOrganizationPlan: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), plan: z.enum(["basic", "professional", "premium", "enterprise"]), reason: z.string().trim().min(5).max(300) })).mutation(async ({ ctx, input }) => {
    const db = await ownerDb(ctx);
    const current = (await db.select({ plan: organizations.plan }).from(organizations).where(eq(organizations.id, input.organizationId)).limit(1))[0];
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Organização não encontrada." });
    await db.transaction(async tx => {
      await tx.update(organizations).set({ plan: input.plan }).where(eq(organizations.id, input.organizationId));
      await tx.insert(auditLogs).values({ organizationId: input.organizationId, actorUserId: ctx.user!.id, action: "owner.organization_plan_changed", entityType: "organization", entityId: input.organizationId, metadata: { from: current.plan, to: input.plan, reason: input.reason, source: "owner_console", priceReference: input.plan === "enterprise" ? null : ASAAS_PLAN_PRICES[input.plan] } });
    });
    return { success: true, from: current.plan, to: input.plan } as const;
  }),
});
