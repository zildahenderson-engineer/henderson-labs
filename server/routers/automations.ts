import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { automationRuns, automations, customers, loyaltyTransactions, recoveryCases, tasks } from "../../drizzle/schema";
import { getDb, listAutomationRuns } from "../db";
import { COOKIE_NAME } from "../../shared/const";
import { createHeartbeatJob, deleteHeartbeatJob } from "../_core/heartbeat";
import { protectedProcedure, router } from "../_core/trpc";
import { assertCanEdit, organizationContext, PLAN_LIMITS } from "./context";

const automationInput = z.object({
  name: z.string().trim().min(3).max(160),
  triggerType: z.enum(["inactivity_days", "membership_due", "points_reached"]),
  triggerValue: z.coerce.number().int().min(1).max(3650),
  actionType: z.enum(["set_at_risk", "set_inactive", "create_task", "queue_recovery", "award_points"]),
  actionConfig: z.object({
    taskTitle: z.string().trim().min(3).max(220).optional(),
    points: z.coerce.number().int().min(1).max(10000).optional(),
  }).optional(),
  enabled: z.boolean().optional(),
});

type AutomationRecord = typeof automations.$inferSelect;

async function orgFor(ctx: { user: unknown }) {
  return organizationContext(ctx.user as { id: number; name: string | null; email: string | null });
}

/** Executes deterministic rules only. The same function can safely be called by an authenticated user or a cron handler. */
export async function executeAutomation(organizationId: number, automation: AutomationRecord, actorUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const startedAt = new Date();
  try {
    let eligible: Array<typeof customers.$inferSelect> = [];
    if (automation.triggerType === "inactivity_days") {
      const cutoff = new Date(Date.now() - automation.triggerValue * 86_400_000);
      eligible = await db.select().from(customers).where(and(
        eq(customers.organizationId, organizationId),
        or(isNull(customers.lastPurchaseAt), lte(customers.lastPurchaseAt, cutoff)),
      )).limit(1000);
    }
    if (automation.triggerType === "points_reached") {
      eligible = await db.select().from(customers).where(and(
        eq(customers.organizationId, organizationId),
        gte(customers.points, automation.triggerValue),
      )).limit(1000);
    }
    // Membership data has no internal billing provider in the MVP; the rule is retained but logged transparently.
    if (automation.triggerType === "membership_due") eligible = [];

    const ids = eligible.map(customer => customer.id);
    const config = (automation.actionConfig ?? {}) as { taskTitle?: string; points?: number };
    if (ids.length && automation.actionType === "set_at_risk") {
      await db.update(customers).set({ status: "at_risk" }).where(and(eq(customers.organizationId, organizationId), inArray(customers.id, ids)));
    }
    if (ids.length && automation.actionType === "set_inactive") {
      await db.update(customers).set({ status: "inactive" }).where(and(eq(customers.organizationId, organizationId), inArray(customers.id, ids)));
    }
    if (ids.length && automation.actionType === "queue_recovery") {
      for (const customer of eligible) {
        await db.insert(recoveryCases).values({
          organizationId,
          customerId: customer.id,
          potentialValue: customer.totalSpent,
          notes: "Caso criado por automação de recuperação.",
        }).onDuplicateKeyUpdate({ set: { potentialValue: customer.totalSpent, updatedAt: new Date() } });
      }
    }
    if (ids.length && automation.actionType === "create_task") {
      const title = config.taskTitle ?? `Follow-up: ${automation.name}`;
      const existing = await db.select({ customerId: tasks.customerId }).from(tasks).where(and(
        eq(tasks.organizationId, organizationId),
        eq(tasks.status, "open"),
        eq(tasks.title, title),
        inArray(tasks.customerId, ids),
      ));
      const existingIds = new Set(existing.map(task => task.customerId));
      const toCreate = eligible.filter(customer => !existingIds.has(customer.id));
      if (toCreate.length) await db.insert(tasks).values(toCreate.map(customer => ({
        organizationId,
        customerId: customer.id,
        title,
        description: `Gerada pela automação “${automation.name}”.`,
        priority: "high" as const,
        createdByUserId: actorUserId ?? automation.createdByUserId,
      })));
    }
    if (ids.length && automation.actionType === "award_points") {
      const points = config.points ?? 10;
      const newlyAwarded = await db.transaction(async tx => {
        const awardedCustomers: Array<typeof customers.$inferSelect> = [];
        for (const customer of eligible) {
          const automationKey = `automation:${automation.id}:customer:${customer.id}`;
          const inserted = await tx.insert(loyaltyTransactions).values({
            organizationId,
            customerId: customer.id,
            points,
            automationKey,
            reason: `Pontos concedidos pela automação “${automation.name}”.`,
            createdByUserId: actorUserId ?? automation.createdByUserId,
          }).onDuplicateKeyUpdate({ set: { automationKey: sql`${loyaltyTransactions.automationKey}` } });
          const affectedRows = Number((inserted as unknown as { affectedRows?: number }).affectedRows ?? 0);
          if (affectedRows !== 1) continue;
          await tx.update(customers).set({ points: sql`${customers.points} + ${points}` }).where(and(eq(customers.organizationId, organizationId), eq(customers.id, customer.id)));
          awardedCustomers.push(customer);
        }
        return awardedCustomers;
      });
      eligible = newlyAwarded;
    }

    const actionLabel: Record<AutomationRecord["actionType"], string> = {
      set_at_risk: "clientes marcados como em risco",
      set_inactive: "clientes marcados como inativos",
      create_task: "tarefas de follow-up criadas",
      queue_recovery: "clientes adicionados à recuperação",
      award_points: "pontos concedidos",
    };
    await db.insert(automationRuns).values({
      organizationId,
      automationId: automation.id,
      status: "success",
      affectedCount: automation.actionType === "award_points" ? eligible.length : ids.length,
      message: `${automation.actionType === "award_points" ? eligible.length : ids.length} ${actionLabel[automation.actionType]}.`,
      startedAt,
      finishedAt: new Date(),
    });
    await db.update(automations).set({ lastRunAt: new Date() }).where(and(eq(automations.id, automation.id), eq(automations.organizationId, organizationId)));
    return { affectedCount: ids.length, message: `${ids.length} ${actionLabel[automation.actionType]}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha não identificada.";
    await db.insert(automationRuns).values({
      organizationId,
      automationId: automation.id,
      status: "failed",
      affectedCount: 0,
      message,
      startedAt,
      finishedAt: new Date(),
    });
    throw error;
  }
}

export const automationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(automations).where(eq(automations.organizationId, organization.id)).orderBy(desc(automations.createdAt));
  }),

  runs: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    return listAutomationRuns(organization.id);
  }),

  create: protectedProcedure.input(automationInput).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const total = await db.select({ count: sql<number>`count(*)` }).from(automations).where(eq(automations.organizationId, organization.id));
    if (Number(total[0]?.count ?? 0) >= PLAN_LIMITS[organization.plan].automations) {
      throw new TRPCError({ code: "FORBIDDEN", message: `O plano atual permite até ${PLAN_LIMITS[organization.plan].automations} automações.` });
    }
    const created = await db.insert(automations).values({
      organizationId: organization.id,
      name: input.name,
      triggerType: input.triggerType,
      triggerValue: input.triggerValue,
      actionType: input.actionType,
      actionConfig: input.actionConfig ?? null,
      enabled: input.enabled ?? true,
      createdByUserId: ctx.user.id,
    }).$returningId();
    return { id: created[0]!.id };
  }),

  toggle: protectedProcedure.input(z.object({ id: z.number().int().positive(), enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(automations).set({ enabled: input.enabled }).where(and(eq(automations.id, input.id), eq(automations.organizationId, organization.id)));
    return { success: true };
  }),

  runNow: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const automation = (await db.select().from(automations).where(and(eq(automations.id, input.id), eq(automations.organizationId, organization.id))).limit(1))[0];
    if (!automation) throw new TRPCError({ code: "NOT_FOUND", message: "Automação não encontrada." });
    return executeAutomation(organization.id, automation, ctx.user.id);
  }),

  schedule: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    cron: z.string().trim().refine(value => value.split(/\s+/).length === 6, "Use a expressão cron com 6 campos (segundo minuto hora dia mês semana)."),
  })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const automation = (await db.select().from(automations).where(and(eq(automations.id, input.id), eq(automations.organizationId, organization.id))).limit(1))[0];
    if (!automation) throw new TRPCError({ code: "NOT_FOUND", message: "Automação não encontrada." });
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    if (automation.scheduleCronTaskUid) await deleteHeartbeatJob(automation.scheduleCronTaskUid, sessionToken);
    const job = await createHeartbeatJob({
      name: `henderson-auto-${organization.id}-${automation.id}`,
      cron: input.cron,
      path: "/api/scheduled/run-automation",
      payload: { automationId: automation.id },
      description: `Executar automação ${automation.name} do Henderson Labs`,
    }, sessionToken);
    await db.update(automations).set({ scheduleCronTaskUid: job.taskUid }).where(and(eq(automations.id, automation.id), eq(automations.organizationId, organization.id)));
    return { taskUid: job.taskUid, nextExecutionAt: job.nextExecutionAt };
  }),

  unschedule: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const automation = (await db.select().from(automations).where(and(eq(automations.id, input.id), eq(automations.organizationId, organization.id))).limit(1))[0];
    if (!automation) throw new TRPCError({ code: "NOT_FOUND", message: "Automação não encontrada." });
    if (automation.scheduleCronTaskUid) {
      const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      await deleteHeartbeatJob(automation.scheduleCronTaskUid, sessionToken);
      await db.update(automations).set({ scheduleCronTaskUid: null }).where(and(eq(automations.id, automation.id), eq(automations.organizationId, organization.id)));
    }
    return { success: true };
  }),
});
