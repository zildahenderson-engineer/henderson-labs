import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiConversations, aiMessages, aiUsage, auditLogs } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { organizationContext } from "./context";
import { askHendersonAI, getHendersonInsights } from "../services.ai";

async function orgFor(ctx: { user: unknown }) {
  return organizationContext(ctx.user as { id: number; name: string | null; email: string | null });
}

const MAX_QUESTION_LENGTH = 2000;

export const aiRouter = router({
  insights: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    return getHendersonInsights(organization.id);
  }),

  conversations: protectedProcedure.query(async ({ ctx }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(aiConversations)
      .where(and(eq(aiConversations.organizationId, organization.id), eq(aiConversations.userId, ctx.user.id)))
      .orderBy(desc(aiConversations.lastMessageAt)).limit(30);
  }),

  history: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conversation = (await db.select().from(aiConversations)
      .where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.organizationId, organization.id), eq(aiConversations.userId, ctx.user.id)))
      .limit(1))[0];
    if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada." });
    const messages = await db.select().from(aiMessages)
      .where(and(eq(aiMessages.conversationId, conversation.id), eq(aiMessages.organizationId, organization.id)))
      .orderBy(aiMessages.createdAt);
    return { conversation, messages };
  }),

  ask: protectedProcedure.input(z.object({
    question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
    conversationId: z.number().int().positive().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

    let conversationId = input.conversationId;
    if (conversationId) {
      const owned = (await db.select({ id: aiConversations.id }).from(aiConversations)
        .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.organizationId, organization.id), eq(aiConversations.userId, ctx.user.id)))
        .limit(1))[0];
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa não encontrada." });
    } else {
      const created = await db.insert(aiConversations).values({
        organizationId: organization.id,
        userId: ctx.user.id,
        title: input.question.slice(0, 80),
      });
      conversationId = Number(created[0].insertId);
    }

    const previous = await db.select({ role: aiMessages.role, content: aiMessages.content }).from(aiMessages)
      .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.organizationId, organization.id)))
      .orderBy(desc(aiMessages.createdAt)).limit(10);

    await db.insert(aiMessages).values({
      organizationId: organization.id,
      conversationId,
      role: "user",
      content: input.question,
    });

    let result;
    try {
      result = await askHendersonAI({
        organizationId: organization.id,
        history: previous.reverse(),
        question: input.question,
      });
    } catch (error) {
      await db.insert(auditLogs).values({
        organizationId: organization.id,
        actorUserId: ctx.user.id,
        action: "ai.query_failed",
        entityType: "ai_conversation",
        entityId: conversationId,
        metadata: { error: error instanceof Error ? error.message : "unknown" },
      });
      throw new TRPCError({ code: "BAD_GATEWAY", message: "A Henderson AI não conseguiu responder agora. Tente novamente em instantes." });
    }

    await db.insert(aiMessages).values({
      organizationId: organization.id,
      conversationId,
      role: "assistant",
      content: result.reply,
      toolsUsed: result.toolsUsed.length ? result.toolsUsed : undefined,
    });

    await db.update(aiConversations).set({ lastMessageAt: new Date() }).where(eq(aiConversations.id, conversationId));

    if (result.usage) {
      await db.insert(aiUsage).values({
        organizationId: organization.id,
        userId: ctx.user.id,
        conversationId,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        model: result.model,
      });
    }

    await db.insert(auditLogs).values({
      organizationId: organization.id,
      actorUserId: ctx.user.id,
      action: "ai.query",
      entityType: "ai_conversation",
      entityId: conversationId,
      metadata: { toolsUsed: result.toolsUsed },
    });

    return { conversationId, reply: result.reply, toolsUsed: result.toolsUsed };
  }),

  deleteConversation: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { organization } = await orgFor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(aiMessages).where(and(eq(aiMessages.conversationId, input.conversationId), eq(aiMessages.organizationId, organization.id)));
    await db.delete(aiConversations).where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.organizationId, organization.id), eq(aiConversations.userId, ctx.user.id)));
    return { success: true } as const;
  }),
});
