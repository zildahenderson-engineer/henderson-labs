import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { auditLogs, billingPayments, campaigns, customers, customerActivities, organizationMembers, organizations, recoveryCases, users } from "../../drizzle/schema";
import { dashboardMetrics, getDb, recentCustomersByStatus } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { assertCanManage, assertOwner, organizationContext, PLAN_LIMITS } from "./context";
import { ASAAS_PLAN_PRICES, asaasConfiguration, createAsaasCheckout } from "../services.asaas";

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

  createPlanCheckout: protectedProcedure.input(z.object({ plan: z.enum(["basic", "professional", "premium"]) })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertOwner(membership.role);
    if (!asaasConfiguration().configured) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O gateway Asaas ainda não está configurado." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const externalReference = `org_${organization.id}_plan_${nanoid(20)}`;
    const created = await db.insert(billingPayments).values({ organizationId: organization.id, requestedPlan: input.plan, previousPlan: organization.plan, amount: String(ASAAS_PLAN_PRICES[input.plan]), externalReference });
    const paymentId = Number(created[0].insertId);
    try {
      const host = ctx.req.get("host");
      if (!host) throw new Error("Host da aplicação indisponível.");
      const protocol = ctx.req.headers["x-forwarded-proto"] === "http" ? "http" : "https";
      const checkout = await createAsaasCheckout({ externalReference, plan: input.plan, appUrl: `${protocol}://${host}` });
      await db.update(billingPayments).set({ checkoutId: checkout.id }).where(eq(billingPayments.id, paymentId));
      return { success: true, checkoutUrl: checkout.link, paymentId, environment: asaasConfiguration().environment };
    } catch (error) {
      await db.update(billingPayments).set({ status: "failed" }).where(eq(billingPayments.id, paymentId));
      throw new TRPCError({ code: "BAD_GATEWAY", message: error instanceof Error ? error.message : "Não foi possível criar o checkout Asaas." });
    }
  }),

  changePlan: protectedProcedure.input(z.object({ plan: z.enum(["basic", "professional", "premium"]) })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertOwner(membership.role);
    if (organization.plan === input.plan) return { success: true, changed: false as const, plan: input.plan };
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    await db.transaction(async tx => {
      await tx.update(organizations).set({ plan: input.plan }).where(eq(organizations.id, organization.id));
      await tx.insert(auditLogs).values({ organizationId: organization.id, actorUserId: ctx.user.id, action: "organization.plan_changed_without_payment", entityType: "organization", entityId: organization.id, metadata: { from: organization.plan, to: input.plan, reason: "Alteração administrativa sem cobrança online." } });
    });
    return { success: true, changed: true as const, plan: input.plan };
  }),

  billingStatus: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    return { asaas: asaasConfiguration(), payments: await db.select({ id: billingPayments.id, requestedPlan: billingPayments.requestedPlan, amount: billingPayments.amount, status: billingPayments.status, checkoutId: billingPayments.checkoutId, createdAt: billingPayments.createdAt, paidAt: billingPayments.paidAt }).from(billingPayments).where(eq(billingPayments.organizationId, organization.id)).orderBy(desc(billingPayments.createdAt)).limit(10) };
  }),

  members: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select({ member: organizationMembers, user: { id: users.id, name: users.name, email: users.email } }).from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organization.id));
  }),

  exportData: protectedProcedure.query(async ({ ctx }) => {
    const { organization, membership } = await orgFor(ctx);
    if (membership.role !== "owner" && membership.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "A exportação exige perfil de gestor ou proprietário." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const [organizationData, customerData, activityData] = await Promise.all([
      db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug, segment: organizations.segment, plan: organizations.plan, timezone: organizations.timezone, createdAt: organizations.createdAt }).from(organizations).where(eq(organizations.id, organization.id)),
      db.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, status: customers.status, pipelineStage: customers.pipelineStage, registeredAt: customers.registeredAt, lastPurchaseAt: customers.lastPurchaseAt, totalSpent: customers.totalSpent, points: customers.points, consentWhatsapp: customers.consentWhatsapp, consentAt: customers.consentAt, consentSource: customers.consentSource, anonymizedAt: customers.anonymizedAt }).from(customers).where(eq(customers.organizationId, organization.id)),
      db.select({ id: customerActivities.id, customerId: customerActivities.customerId, type: customerActivities.type, content: customerActivities.content, amount: customerActivities.amount, createdAt: customerActivities.createdAt }).from(customerActivities).where(eq(customerActivities.organizationId, organization.id)),
    ]);
    await db.insert(auditLogs).values({ organizationId: organization.id, actorUserId: ctx.user.id, action: "organization.data_exported", entityType: "organization", entityId: organization.id });
    return { exportedAt: new Date(), organization: organizationData[0] ?? null, customers: customerData, activities: activityData };
  }),

  auditLogs: protectedProcedure.query(async ({ ctx }) => {
    const { organization, membership } = await orgFor(ctx);
    if (membership.role !== "owner" && membership.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "A auditoria exige perfil de gestor ou proprietário." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    return db.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt }).from(auditLogs).where(eq(auditLogs.organizationId, organization.id)).orderBy(desc(auditLogs.createdAt)).limit(50);
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
