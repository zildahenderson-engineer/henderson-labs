import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { campaigns, customers, whatsappMessages } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { sendOfficialWhatsAppTemplate, whatsappConfiguration } from "../services.whatsapp";
import { assertCanEdit, organizationContext } from "./context";

async function orgFor(ctx: { user: unknown }) {
  return organizationContext(ctx.user as { id: number; name: string | null; email: string | null });
}

const campaignInput = z.object({
  name: z.string().trim().min(3).max(160),
  audience: z.enum(["all", "active", "at_risk", "inactive"]),
  message: z.string().trim().min(3).max(4096),
  templateName: z.string().trim().max(160).optional().nullable(),
  scheduledAt: z.coerce.date().optional().nullable(),
});

export const campaignsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(campaigns).where(eq(campaigns.organizationId, organization.id)).orderBy(desc(campaigns.createdAt));
  }),

  create: protectedProcedure.input(campaignInput).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const created = await db.insert(campaigns).values({
      organizationId: organization.id,
      name: input.name,
      audience: input.audience,
      message: input.message,
      templateName: input.templateName || null,
      scheduledAt: input.scheduledAt || null,
      status: input.scheduledAt ? "scheduled" : "draft",
      createdByUserId: ctx.user.id,
    }).$returningId();
    return { id: created[0]!.id };
  }),

  update: protectedProcedure.input(campaignInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const existing = (await db.select().from(campaigns).where(and(eq(campaigns.id, input.id), eq(campaigns.organizationId, organization.id))).limit(1))[0];
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });
    if (existing.status === "sent") throw new TRPCError({ code: "CONFLICT", message: "Campanhas já enviadas não podem ser editadas." });
    const { id: _id, ...data } = input;
    await db.update(campaigns).set(data).where(and(eq(campaigns.id, input.id), eq(campaigns.organizationId, organization.id)));
    return { success: true } as const;
  }),

  delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    if (membership.role !== "owner" && membership.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "A exclusão exige perfil de gestor ou proprietário." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const campaign = (await db.select().from(campaigns).where(and(eq(campaigns.id, input.id), eq(campaigns.organizationId, organization.id))).limit(1))[0];
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });
    if (campaign.status === "sent") throw new TRPCError({ code: "CONFLICT", message: "Campanhas já enviadas não podem ser excluídas." });
    await db.delete(whatsappMessages).where(and(eq(whatsappMessages.campaignId, input.id), eq(whatsappMessages.organizationId, organization.id)));
    await db.delete(campaigns).where(and(eq(campaigns.id, input.id), eq(campaigns.organizationId, organization.id)));
    return { success: true } as const;
  }),

  dispatch: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization, membership } = await orgFor(ctx);
    assertCanEdit(membership.role);
    const config = whatsappConfiguration();
    if (!config.configured) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conecte a API oficial do WhatsApp Business nas configurações antes de disparar campanhas." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const campaign = (await db.select().from(campaigns).where(and(eq(campaigns.id, input.id), eq(campaigns.organizationId, organization.id))).limit(1))[0];
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campanha não encontrada." });
    if (!campaign.templateName) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione o nome de um template aprovado pela Meta para enviar a campanha." });
    const audienceCondition = campaign.audience === "all" ? undefined : eq(customers.status, campaign.audience);
    const recipients = await db.select().from(customers).where(and(
      eq(customers.organizationId, organization.id),
      eq(customers.consentWhatsapp, true),
      ...(audienceCondition ? [audienceCondition] : []),
    ));
    const viableRecipients = recipients.filter(customer => Boolean(customer.phone));
    let sentCount = 0;
    let failedCount = 0;
    for (const customer of viableRecipients) {
      try {
        const result = await sendOfficialWhatsAppTemplate({ to: customer.phone!, templateName: campaign.templateName });
        await db.insert(whatsappMessages).values({
          organizationId: organization.id,
          customerId: customer.id,
          campaignId: campaign.id,
          direction: "outbound",
          messageType: "template",
          status: "sent",
          providerMessageId: result.messageId,
          templateName: campaign.templateName,
          body: campaign.message,
          sentAt: new Date(),
        });
        sentCount += 1;
      } catch (error) {
        await db.insert(whatsappMessages).values({
          organizationId: organization.id,
          customerId: customer.id,
          campaignId: campaign.id,
          direction: "outbound",
          messageType: "template",
          status: "failed",
          templateName: campaign.templateName,
          body: campaign.message,
          errorMessage: error instanceof Error ? error.message : "Falha ao enviar mensagem.",
        });
        failedCount += 1;
      }
    }
    await db.update(campaigns).set({ status: "sent", sentCount: campaign.sentCount + sentCount }).where(and(eq(campaigns.id, campaign.id), eq(campaigns.organizationId, organization.id)));
    return { sentCount, failedCount, skippedCount: recipients.length - viableRecipients.length };
  }),

  whatsappStatus: protectedProcedure.query(() => whatsappConfiguration()),
});
