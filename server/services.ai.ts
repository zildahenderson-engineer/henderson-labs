import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  automationRuns,
  automations,
  billingPayments,
  campaigns,
  customerActivities,
  customers,
  organizations,
  recoveryCases,
  tasks,
} from "../drizzle/schema";
import { getDb, dashboardMetrics } from "./db";
import { invokeLLM, type Message, type Tool, type ToolCall } from "./_core/llm";

/**
 * Henderson AI is grounded exclusively in the organization's real data.
 * Every "tool" below is a read-only, organization-scoped query. The model
 * never receives raw SQL access and never sees another organization's data:
 * organizationId is always injected by the server, never by the model or
 * the client.
 */

const HENDERSON_AI_SYSTEM_PROMPT = `Você é a Henderson AI, a assistente de inteligência de negócio embutida no Henderson Labs, um SaaS de retenção de clientes para negócios de assinatura recorrente (academias, estúdios, clubes).

Regras:
- Responda SEMPRE em português do Brasil, em tom direto, executivo e útil — como um analista de dados interno, nunca como um chatbot genérico.
- Use APENAS as ferramentas disponíveis para obter números. Nunca invente valores, porcentagens ou nomes de clientes.
- Se uma pergunta não puder ser respondida com as ferramentas disponíveis, diga isso claramente e sugira o caminho mais próximo possível dentro do produto.
- Sempre que fizer sentido, termine com uma sugestão de ação concreta (ex.: criar uma automação, disparar uma campanha, priorizar um cliente).
- Seja conciso: priorize números e uma frase de contexto, não parágrafos longos.
- Nunca revele detalhes técnicos internos (nomes de tabelas, SQL, tokens, chaves de API).`;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_company_overview",
      description: "Retorna um resumo geral da empresa: clientes ativos, em risco, inativos, receita total, receita recuperada, tarefas pendentes e campanhas. Use para perguntas amplas como 'como está minha empresa' ou 'faça um resumo'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_summary",
      description: "Retorna a receita registrada (compras) nos últimos N meses, mês a mês, incluindo o mês atual. Use para 'quanto vendi este mês', 'faturamento', 'meu faturamento cresceu?'.",
      parameters: {
        type: "object",
        properties: {
          months: { type: "integer", description: "Quantidade de meses para trás a considerar, incluindo o atual. Padrão 3.", minimum: 1, maximum: 12 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_at_risk_customers",
      description: "Lista clientes classificados como 'em risco' ou 'inativos', ordenados por valor total gasto. Use para 'quais clientes não compram há muito tempo', 'quem está prestes a cancelar', 'clientes parados'.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["at_risk", "inactive", "both"], description: "Padrão 'both'." },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_best_customers",
      description: "Lista os clientes com maior valor total gasto (LTV). Use para 'qual foi meu melhor cliente', 'quem mais compra'.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 25 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_billing",
      description: "Retorna cobranças de assinatura da própria organização no Asaas: pendentes, vencidas e confirmadas recentemente. Use para 'quais cobranças estão pendentes', 'pagamento em atraso'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recovery_performance",
      description: "Retorna o desempenho da recuperação de clientes: quantos casos em cada etapa (pendente, contatado, respondeu, recuperado, perdido) e a receita recuperada. Use para 'quanto recuperei', 'como está a recuperação'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaign_performance",
      description: "Retorna o desempenho das campanhas de WhatsApp mais recentes: enviados, entregues, respondidos, convertidos e receita gerada. Use para 'como estão minhas campanhas'.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 20 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_automation_performance",
      description: "Retorna as automações ativas e o resultado das últimas execuções (clientes afetados, sucesso ou falha). Use para 'quais automações estão funcionando', 'resultado das automações'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_open_tasks_summary",
      description: "Retorna a contagem de tarefas de follow-up em aberto por prioridade e as mais urgentes por prazo. Use para 'o que preciso fazer hoje', 'tarefas pendentes'.",
      parameters: { type: "object", properties: {} },
    },
  },
];

type ToolContext = { organizationId: number };

async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<unknown> {
  const db = await getDb();
  if (!db) return { error: "Banco de dados indisponível no momento." };
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    args = {};
  }
  const orgId = ctx.organizationId;

  switch (name) {
    case "get_company_overview": {
      const metrics = await dashboardMetrics(orgId);
      return {
        clientesAtivos: metrics.active,
        clientesEmRisco: metrics.atRisk,
        clientesInativos: metrics.inactive,
        clientesRecuperados: metrics.recovered,
        receitaTotalRegistrada: money(metrics.totalRevenue),
        receitaRecuperada: money(metrics.recoveredRevenue),
        tarefasPendentes: metrics.pendingTasks,
        campanhasCriadas: metrics.campaigns,
        mensagensEnviadas: metrics.sentMessages,
        respostasRecebidas: metrics.replies,
      };
    }

    case "get_revenue_summary": {
      const months = Math.min(12, Math.max(1, Number(args.months) || 3));
      const since = new Date();
      since.setMonth(since.getMonth() - (months - 1));
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
      const rows = await db
        .select({
          month: sql<string>`date_format(${customerActivities.createdAt}, '%Y-%m')`,
          revenue: sql<string>`coalesce(sum(${customerActivities.amount}), 0)`,
          purchases: sql<number>`count(*)`,
        })
        .from(customerActivities)
        .where(and(
          eq(customerActivities.organizationId, orgId),
          eq(customerActivities.type, "purchase"),
          gte(customerActivities.createdAt, since),
        ))
        .groupBy(sql`date_format(${customerActivities.createdAt}, '%Y-%m')`)
        .orderBy(sql`date_format(${customerActivities.createdAt}, '%Y-%m')`);
      const byMonth = new Map(rows.map(row => [row.month, row]));
      const series: Array<{ mes: string; receita: string; compras: number }> = [];
      const cursor = new Date(since);
      for (let i = 0; i < months; i++) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        const row = byMonth.get(key);
        series.push({ mes: key, receita: money(Number(row?.revenue ?? 0)), compras: Number(row?.purchases ?? 0) });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      const current = series[series.length - 1];
      const previous = series[series.length - 2];
      let variacaoPercentual: string | null = null;
      if (previous) {
        const currentValue = Number(current.receita.replace(/[^\d,-]/g, "").replace(",", "."));
        const previousValue = Number(previous.receita.replace(/[^\d,-]/g, "").replace(",", "."));
        if (previousValue > 0) variacaoPercentual = `${(((currentValue - previousValue) / previousValue) * 100).toFixed(1)}%`;
      }
      return { serieMensal: series, variacaoPercentualMesAnterior: variacaoPercentual };
    }

    case "get_at_risk_customers": {
      const status = (args.status as string) || "both";
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 8));
      const statusFilter = status === "at_risk"
        ? eq(customers.status, "at_risk")
        : status === "inactive"
          ? eq(customers.status, "inactive")
          : sql`${customers.status} in ('at_risk','inactive')`;
      const rows = await db.select({
        nome: customers.name,
        status: customers.status,
        totalGasto: customers.totalSpent,
        ultimaCompra: customers.lastPurchaseAt,
      }).from(customers).where(and(eq(customers.organizationId, orgId), statusFilter))
        .orderBy(desc(customers.totalSpent)).limit(limit);
      return { total: rows.length, clientes: rows.map(row => ({ ...row, totalGasto: money(Number(row.totalGasto)) })) };
    }

    case "get_best_customers": {
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 8));
      const rows = await db.select({
        nome: customers.name,
        totalGasto: customers.totalSpent,
        status: customers.status,
        pontos: customers.points,
      }).from(customers).where(eq(customers.organizationId, orgId))
        .orderBy(desc(customers.totalSpent)).limit(limit);
      return { clientes: rows.map(row => ({ ...row, totalGasto: money(Number(row.totalGasto)) })) };
    }

    case "get_pending_billing": {
      const rows = await db.select({
        planoSolicitado: billingPayments.requestedPlan,
        valor: billingPayments.amount,
        status: billingPayments.status,
        criadoEm: billingPayments.createdAt,
        pagoEm: billingPayments.paidAt,
      }).from(billingPayments).where(eq(billingPayments.organizationId, orgId))
        .orderBy(desc(billingPayments.createdAt)).limit(10);
      return { cobrancas: rows.map(row => ({ ...row, valor: money(Number(row.valor)) })) };
    }

    case "get_recovery_performance": {
      const rows = await db.select({
        status: recoveryCases.status,
        total: sql<number>`count(*)`,
        receitaRecuperada: sql<string>`coalesce(sum(${recoveryCases.recoveredValue}), 0)`,
        potencial: sql<string>`coalesce(sum(${recoveryCases.potentialValue}), 0)`,
      }).from(recoveryCases).where(eq(recoveryCases.organizationId, orgId)).groupBy(recoveryCases.status);
      return {
        porEtapa: rows.map(row => ({ ...row, receitaRecuperada: money(Number(row.receitaRecuperada)), potencial: money(Number(row.potencial)) })),
      };
    }

    case "get_campaign_performance": {
      const limit = Math.min(20, Math.max(1, Number(args.limit) || 8));
      const rows = await db.select({
        nome: campaigns.name,
        status: campaigns.status,
        enviados: campaigns.sentCount,
        entregues: campaigns.deliveredCount,
        respondidos: campaigns.repliedCount,
        convertidos: campaigns.convertedCount,
        receitaGerada: campaigns.revenueGenerated,
      }).from(campaigns).where(eq(campaigns.organizationId, orgId))
        .orderBy(desc(campaigns.createdAt)).limit(limit);
      return { campanhas: rows.map(row => ({ ...row, receitaGerada: money(Number(row.receitaGerada)) })) };
    }

    case "get_automation_performance": {
      const [activeAutomations, runs] = await Promise.all([
        db.select({ nome: automations.name, ativa: automations.enabled, ultimaExecucao: automations.lastRunAt }).from(automations).where(eq(automations.organizationId, orgId)),
        db.select({ nome: automations.name, status: automationRuns.status, afetados: automationRuns.affectedCount, mensagem: automationRuns.message, quando: automationRuns.startedAt })
          .from(automationRuns).innerJoin(automations, eq(automationRuns.automationId, automations.id))
          .where(eq(automationRuns.organizationId, orgId)).orderBy(desc(automationRuns.startedAt)).limit(10),
      ]);
      return { automacoes: activeAutomations, ultimasExecucoes: runs };
    }

    case "get_open_tasks_summary": {
      const rows = await db.select({
        prioridade: tasks.priority,
        total: sql<number>`count(*)`,
      }).from(tasks).where(and(eq(tasks.organizationId, orgId), eq(tasks.status, "open"))).groupBy(tasks.priority);
      const urgent = await db.select({ titulo: tasks.title, prazo: tasks.dueAt, prioridade: tasks.priority })
        .from(tasks).where(and(eq(tasks.organizationId, orgId), eq(tasks.status, "open")))
        .orderBy(tasks.dueAt).limit(5);
      return { porPrioridade: rows, maisUrgentes: urgent };
    }

    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}

export type HendersonInsight = { tone: "positive" | "warning" | "neutral"; text: string };

/**
 * Deterministic, LLM-free insights for the dashboard: every number here comes
 * directly from an aggregate query, so there is no risk of the assistant
 * inventing a figure. This is what renders as "Henderson AI Insights".
 */
export async function getHendersonInsights(organizationId: number): Promise<HendersonInsight[]> {
  const db = await getDb();
  if (!db) return [];
  const insights: HendersonInsight[] = [];

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [thisMonthRows, lastMonthRows, atRiskRows, inactiveRows, bestCampaignRows, overdueBillingRows] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(${customerActivities.amount}), 0)` }).from(customerActivities)
      .where(and(eq(customerActivities.organizationId, organizationId), eq(customerActivities.type, "purchase"), gte(customerActivities.createdAt, startOfThisMonth))),
    db.select({ total: sql<string>`coalesce(sum(${customerActivities.amount}), 0)` }).from(customerActivities)
      .where(and(eq(customerActivities.organizationId, organizationId), eq(customerActivities.type, "purchase"), gte(customerActivities.createdAt, startOfLastMonth), sql`${customerActivities.createdAt} < ${startOfThisMonth}`)),
    db.select({ total: sql<number>`count(*)` }).from(customers).where(and(eq(customers.organizationId, organizationId), eq(customers.status, "at_risk"))),
    db.select({ total: sql<number>`count(*)` }).from(customers).where(and(eq(customers.organizationId, organizationId), eq(customers.status, "inactive"))),
    db.select({ name: campaigns.name, revenue: campaigns.revenueGenerated }).from(campaigns)
      .where(eq(campaigns.organizationId, organizationId)).orderBy(desc(campaigns.revenueGenerated)).limit(1),
    db.select({ total: sql<number>`count(*)` }).from(billingPayments).where(and(eq(billingPayments.organizationId, organizationId), eq(billingPayments.status, "overdue"))),
  ]);

  const thisMonth = Number(thisMonthRows[0]?.total ?? 0);
  const lastMonth = Number(lastMonthRows[0]?.total ?? 0);
  if (lastMonth > 0) {
    const change = ((thisMonth - lastMonth) / lastMonth) * 100;
    insights.push({
      tone: change >= 0 ? "positive" : "warning",
      text: `Seu faturamento ${change >= 0 ? "aumentou" : "caiu"} ${Math.abs(change).toFixed(0)}% em relação ao mês passado (${money(thisMonth)} até agora).`,
    });
  } else if (thisMonth > 0) {
    insights.push({ tone: "positive", text: `Você já registrou ${money(thisMonth)} em vendas este mês.` });
  }

  const atRisk = Number(atRiskRows[0]?.total ?? 0);
  if (atRisk > 0) {
    insights.push({ tone: "warning", text: `${atRisk} cliente${atRisk === 1 ? "" : "s"} ${atRisk === 1 ? "está" : "estão"} em risco de cancelar. Priorize a recuperação hoje.` });
  }

  const inactive = Number(inactiveRows[0]?.total ?? 0);
  if (inactive > 0) {
    insights.push({ tone: "warning", text: `${inactive} cliente${inactive === 1 ? "" : "s"} não compra${inactive === 1 ? "" : "m"} há mais de ${await inactiveThresholdDays(organizationId)} dias.` });
  }

  const bestCampaign = bestCampaignRows[0];
  if (bestCampaign && Number(bestCampaign.revenue) > 0) {
    insights.push({ tone: "positive", text: `Sua campanha "${bestCampaign.name}" já gerou ${money(Number(bestCampaign.revenue))} em receita.` });
  }

  const overdue = Number(overdueBillingRows[0]?.total ?? 0);
  if (overdue > 0) {
    insights.push({ tone: "warning", text: `Há ${overdue} cobrança${overdue === 1 ? "" : "s"} da sua assinatura Henderson Labs vencida${overdue === 1 ? "" : "s"}.` });
  }

  if (insights.length === 0) {
    insights.push({ tone: "neutral", text: "Ainda não há dados suficientes para gerar insights. Cadastre clientes e registre compras para começar." });
  }

  return insights.slice(0, 4);
}

async function inactiveThresholdDays(organizationId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 60;
  const org = (await db.select({ riskDays: organizations.riskDays }).from(organizations).where(eq(organizations.id, organizationId)).limit(1))[0];
  return org?.riskDays ?? 60;
}

export type AskHendersonAIResult = {
  reply: string;
  toolsUsed: string[];
  usage?: { promptTokens: number; completionTokens: number };
  model?: string;
};

/**
 * Runs a bounded tool-calling loop: the model may call up to 4 rounds of
 * tools before it must answer in plain text. All tool execution is scoped
 * server-side to `organizationId`; the model can never choose which
 * organization to query.
 */
export async function askHendersonAI(params: {
  organizationId: number;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  question: string;
}): Promise<AskHendersonAIResult> {
  const messages: Message[] = [
    { role: "system", content: HENDERSON_AI_SYSTEM_PROMPT },
    ...params.history.slice(-10).map(turn => ({ role: turn.role, content: turn.content }) as Message),
    { role: "user", content: params.question },
  ];

  const toolsUsed = new Set<string>();
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  let model: string | undefined;

  for (let round = 0; round < 4; round++) {
    const result = await invokeLLM({ messages, tools: TOOLS, toolChoice: "auto", maxTokens: 900 });
    const choice = result.choices[0];
    model = result.model;
    if (result.usage) {
      usage = {
        promptTokens: (usage?.promptTokens ?? 0) + result.usage.prompt_tokens,
        completionTokens: (usage?.completionTokens ?? 0) + result.usage.completion_tokens,
      };
    }

    const toolCalls: ToolCall[] | undefined = choice.message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      const text = typeof choice.message.content === "string"
        ? choice.message.content
        : choice.message.content.filter(part => part.type === "text").map(part => (part as { text: string }).text).join("\n");
      return { reply: text || "Não consegui gerar uma resposta agora. Tente reformular a pergunta.", toolsUsed: Array.from(toolsUsed), usage, model };
    }

    messages.push({ role: "assistant", content: choice.message.content ?? "", tool_calls: toolCalls });

    for (const call of toolCalls) {
      toolsUsed.add(call.function.name);
      const toolResult = await runTool(call.function.name, call.function.arguments, { organizationId: params.organizationId });
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: JSON.stringify(toolResult) });
    }
  }

  return {
    reply: "Encontrei várias informações, mas não consegui condensar a resposta a tempo. Pode reformular a pergunta de forma mais específica?",
    toolsUsed: Array.from(toolsUsed),
    usage,
    model,
  };
}
