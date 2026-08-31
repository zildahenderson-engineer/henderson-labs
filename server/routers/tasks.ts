import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { customerActivities, tasks } from "../../drizzle/schema";
import { getCustomer, getDb, listTasks } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { assertCanEdit, organizationContext } from "./context";

async function orgFor(ctx: { user: unknown }) {
  return organizationContext(ctx.user as { id: number; name: string | null; email: string | null });
}

export const tasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    return listTasks(organization.id);
  }),

  create: protectedProcedure.input(z.object({
    customerId: z.number().int().positive().optional().nullable(),
    title: z.string().trim().min(3).max(220),
    description: z.string().trim().max(4000).optional().nullable(),
    dueAt: z.coerce.date().optional().nullable(),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    if (input.customerId && !await getCustomer(organization.id, input.customerId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const created = await db.insert(tasks).values({
      organizationId: organization.id,
      customerId: input.customerId ?? null,
      title: input.title,
      description: input.description || null,
      dueAt: input.dueAt ?? null,
      priority: input.priority,
      createdByUserId: ctx.user.id,
    }).$returningId();
    if (input.customerId) await db.insert(customerActivities).values({
      organizationId: organization.id,
      customerId: input.customerId,
      type: "task",
      content: `Tarefa criada: ${input.title}`,
      createdByUserId: ctx.user.id,
    });
    return { id: created[0]!.id };
  }),

  complete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const task = (await db.select().from(tasks).where(and(eq(tasks.id, input.id), eq(tasks.organizationId, organization.id))).limit(1))[0];
    if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada." });
    await db.update(tasks).set({ status: "done", completedAt: new Date() }).where(and(eq(tasks.id, input.id), eq(tasks.organizationId, organization.id)));
    if (task.customerId) await db.insert(customerActivities).values({
      organizationId: organization.id,
      customerId: task.customerId,
      type: "task",
      content: `Tarefa concluída: ${task.title}`,
      createdByUserId: ctx.user.id,
    });
    return { success: true };
  }),
});
