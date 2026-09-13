import crypto from "node:crypto";

export const ASAAS_PLAN_PRICES = { basic: 650, professional: 129.9, premium: 1650 } as const;
export type PaidPlan = keyof typeof ASAAS_PLAN_PRICES;

function apiBase() {
  return process.env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export function asaasConfiguration() {
  return { configured: Boolean(process.env.ASAAS_API_KEY && process.env.ASAAS_WEBHOOK_TOKEN), environment: process.env.ASAAS_ENV === "production" ? "production" : "sandbox" } as const;
}

function apiKey() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada.");
  return key;
}

export function verifyAsaasWebhook(reqToken: string | undefined) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || !reqToken) return false;
  const received = Buffer.from(reqToken); const configured = Buffer.from(expected);
  return received.length === configured.length && crypto.timingSafeEqual(received, configured);
}

export async function createAsaasCheckout(input: { externalReference: string; plan: PaidPlan; appUrl: string }) {
  const price = ASAAS_PLAN_PRICES[input.plan];
  const nextDueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const response = await fetch(`${apiBase()}/checkouts`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", access_token: apiKey() }, body: JSON.stringify({ billingTypes: ["PIX", "CREDIT_CARD"], chargeTypes: ["RECURRENT"], minutesToExpire: 60, externalReference: input.externalReference, items: [{ name: `Henderson Labs — Plano ${input.plan}`, description: "Assinatura mensal do plano Henderson Labs", quantity: 1, value: price }], subscription: { cycle: "MONTHLY", nextDueDate }, callback: { successUrl: `${input.appUrl}/app/configuracoes?payment=success`, cancelUrl: `${input.appUrl}/app/configuracoes?payment=cancelled`, expiredUrl: `${input.appUrl}/app/configuracoes?payment=expired`, autoRedirect: true } }) });
  const body = await response.json().catch(() => ({})) as { id?: string; link?: string; errors?: Array<{ description?: string }> };
  if (!response.ok || !body.id || !body.link) throw new Error(body.errors?.[0]?.description || `Asaas recusou o checkout (${response.status}).`);
  return { id: body.id, link: body.link };
}
