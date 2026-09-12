import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { customers, customerActivities, recoveryCases } from "../../drizzle/schema";
import { getCustomer, getDb, listRecoveries } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { assertCanEdit, organizationContext } from "./context";

async function orgFor(ctx: { user: unknown }) {
  return organizationContext(ctx.user as { id: number; name: string | null; email: string | null });
}

export const recoveryRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    return listRecoveries(organization.id);
  }),

  syncCandidates: protectedProcedure.mutation(async ({ ctx }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const candidates = await db.select().from(customers).where(and(
      eq(customers.organizationId, organization.id),
      inArray(customers.status, ["at_risk", "inactive"]),
    ));
    for (const customer of candidates) {
      await db.insert(recoveryCases).values({
        organizationId: organization.id,
        customerId: customer.id,
        potentialValue: customer.totalSpent,
        notes: "Cliente priorizado pelo motor de risco.",
      }).onDuplicateKeyUpdate({ set: { potentialValue: customer.totalSpent, updatedAt: new Date() } });
    }
    return { count: candidates.length };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    status: z.enum(["pending", "contacted", "responded", "recovered", "lost"]),
    recoveredValue: z.coerce.number().min(0).max(99_999_999).optional(),
    notes: z.string().trim().max(4000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const current = (await db.select().from(recoveryCases).where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.organizationId, organization.id))).limit(1))[0];
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Caso de recuperação não encontrado." });
    if (input.status === "recovered" && !(input.recoveredValue && input.recoveredValue > 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a receita efetivamente recuperada." });
    }
    const now = new Date();
    const update: Record<string, unknown> = { status: input.status };
    if (input.notes !== undefined) update.notes = input.notes;
    if (input.status === "contacted") update.contactedAt = now;
    if (input.status === "responded") update.respondedAt = now;
    if (input.status === "recovered") {
      update.recoveredAt = now;
      update.recoveredValue = String(input.recoveredValue);
    }
    await db.update(recoveryCases).set(update).where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.organizationId, organization.id)));
    if (input.status === "recovered") {
      await db.update(customers).set({ status: "active", lastInteractionAt: now }).where(and(eq(customers.id, current.customerId), eq(customers.organizationId, organization.id)));
    }
    await db.insert(customerActivities).values({
      organizationId: organization.id,
      customerId: current.customerId,
      type: "recovery",
      content: input.status === "recovered" ? `Cliente recuperado com receita de R$ ${input.recoveredValue!.toFixed(2)}.` : `Status de recuperação atualizado para ${input.status}.`,
      amount: input.status === "recovered" ? String(input.recoveredValue) : null,
      createdByUserId: ctx.user.id,
    });
    return { success: true };
  }),

  delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    if (membership.role !== "owner" && membership.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "A exclusão exige perfil de gestor ou proprietário." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const result = await db.delete(recoveryCases).where(and(eq(recoveryCases.id, input.id), eq(recoveryCases.organizationId, organization.id)));
    if (Number((result as unknown as { affectedRows?: number }).affectedRows ?? 0) !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Caso de recuperação não encontrado." });
    return { success: true } as const;
  }),

  createForCustomer: protectedProcedure.input(z.object({ customerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const customer = await getCustomer(organization.id, input.customerId);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(recoveryCases).values({
      organizationId: organization.id,
      customerId: customer.id,
      potentialValue: customer.totalSpent,
    }).onDuplicateKeyUpdate({ set: { potentialValue: customer.totalSpent, updatedAt: new Date() } });
    return { success: true };
  }),
});
