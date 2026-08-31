import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { campaigns, customers, organizationMembers, organizations, recoveryCases, users } from "../../drizzle/schema";
import { dashboardMetrics, getDb, recentCustomersByStatus } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { assertCanManage, assertOwner, organizationContext, PLAN_LIMITS } from "./context";

async function orgFor(ctx: { user: unknown }) {
  return organizationContext(ctx.user as { id: number; name: string | null; email: string | null });
}

export const organizationRouter = router({
  current: protectedProcedure.query(async ({ ctx }) => {
    const { organization, membership } = await orgFor(ctx);
    return { organization, membership, limits: PLAN_LIMITS[organization.plan] };
  }),

  update: protectedProcedure.input(z.object({
    name: z.string().trim().min(2).max(160).optional(),
    segment: z.string().trim().min(2).max(80).optional(),
    activeDays: z.coerce.number().int().min(1).max(365).optional(),
    riskDays: z.coerce.number().int().min(2).max(730).optional(),
    timezone: z.string().trim().min(3).max(64).optional(),
  }).refine(data => data.activeDays === undefined || data.riskDays === undefined || data.riskDays > data.activeDays, {
    message: "O limite de inatividade deve ser maior que o limite de risco.", path: ["riskDays"],
  })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanManage(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(organizations).set(input).where(eq(organizations.id, organization.id));
    return { success: true };
  }),

  members: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select({ member: organizationMembers, user: { id: users.id, name: users.name, email: users.email } }).from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organization.id));
  }),

  addExistingMember: protectedProcedure.input(z.object({
    email: z.string().trim().email().max(320),
    role: z.enum(["manager", "operator", "viewer"]),
  })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanManage(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const user = (await db.select().from(users).where(eq(users.email, input.email)).limit(1))[0];
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Este usuário ainda não acessou o Henderson Labs. Peça que ele entre uma vez antes de adicioná-lo." });
    const membersTotal = await db.select({ total: sql<number>`count(*)` }).from(organizationMembers).where(eq(organizationMembers.organizationId, organization.id));
    if (Number(membersTotal[0]?.total ?? 0) >= PLAN_LIMITS[organization.plan].members) {
      throw new TRPCError({ code: "FORBIDDEN", message: `O plano atual permite até ${PLAN_LIMITS[organization.plan].members} usuários.` });
    }
    await db.insert(organizationMembers).values({ organizationId: organization.id, userId: user.id, role: input.role }).onDuplicateKeyUpdate({ set: { role: input.role } });
    return { success: true };
  }),

  changeMemberRole: protectedProcedure.input(z.object({ memberId: z.number().int().positive(), role: z.enum(["manager", "operator", "viewer"]) })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertOwner(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(organizationMembers).set({ role: input.role }).where(and(eq(organizationMembers.id, input.memberId), eq(organizationMembers.organizationId, organization.id)));
    return { success: true };
  }),
});

export const reportsRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [metrics, atRisk, inactive, campaignPerformance, recoveryPerformance] = await Promise.all([
      dashboardMetrics(organization.id),
      recentCustomersByStatus(organization.id, "at_risk"),
      recentCustomersByStatus(organization.id, "inactive"),
      db.select({ name: campaigns.name, status: campaigns.status, sent: campaigns.sentCount, delivered: campaigns.deliveredCount, replied: campaigns.repliedCount, converted: campaigns.convertedCount, revenue: campaigns.revenueGenerated }).from(campaigns).where(eq(campaigns.organizationId, organization.id)).orderBy(desc(campaigns.createdAt)).limit(8),
      db.select({ status: recoveryCases.status, count: sql<number>`count(*)`, revenue: sql<string>`coalesce(sum(${recoveryCases.recoveredValue}), 0)` }).from(recoveryCases).where(eq(recoveryCases.organizationId, organization.id)).groupBy(recoveryCases.status),
    ]);
    return { metrics, atRisk, inactive, campaignPerformance, recoveryPerformance };
  }),

  exportCustomers: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select({ name: customers.name, phone: customers.phone, email: customers.email, status: customers.status, lastPurchaseAt: customers.lastPurchaseAt, totalSpent: customers.totalSpent, points: customers.points }).from(customers).where(eq(customers.organizationId, organization.id)).orderBy(desc(customers.createdAt));
  }),
});
