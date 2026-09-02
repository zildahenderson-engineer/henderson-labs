type WhatsAppSendResult = {
  messageId: string;
  raw: unknown;
};

export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super("Integração WhatsApp ainda não configurada. Adicione as credenciais oficiais da Meta no ambiente do servidor.");
    this.name = "WhatsAppNotConfiguredError";
  }
}

export function whatsappConfiguration() {
  const configured = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  return {
    configured,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v23.0",
    hasWebhookVerification: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
  };
}

/** Performs a read-only Graph API call to validate the configured sender. */
export async function verifyOfficialWhatsAppCredentials() {
  const config = whatsappConfiguration();
  if (!config.configured) throw new WhatsAppNotConfiguredError();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const endpoint = `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = typeof raw === "object" && raw && "error" in raw ? JSON.stringify(raw) : "Erro não identificado pela Meta.";
    throw new Error(`WhatsApp Cloud API recusou a validação: ${details}`);
  }
  const body = raw as { id?: string; display_phone_number?: string; verified_name?: string };
  if (body.id !== phoneNumberId) throw new Error("WhatsApp Cloud API retornou um número diferente do configurado.");
  return {
    ok: true as const,
    phoneNumberId,
    displayPhoneNumber: body.display_phone_number ?? null,
    verifiedName: body.verified_name ?? null,
  };
}

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}

/** Uses only Meta's official Graph API. The access token remains server-side. */
export async function sendOfficialWhatsAppTemplate(input: {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: unknown[];
}): Promise<WhatsAppSendResult> {
  const config = whatsappConfiguration();
  if (!config.configured) throw new WhatsAppNotConfiguredError();
  const endpoint = `https://graph.facebook.com/${config.graphVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhone(input.to),
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode ?? "pt_BR" },
        ...(input.components?.length ? { components: input.components } : {}),
      },
    }),
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = typeof raw === "object" && raw && "error" in raw ? JSON.stringify(raw) : "Erro não identificado pela Meta.";
    throw new Error(`WhatsApp Cloud API recusou a mensagem: ${details}`);
  }
  const messageId = (raw as { messages?: Array<{ id?: string }> }).messages?.[0]?.id;
  if (!messageId) throw new Error("WhatsApp Cloud API não retornou o identificador da mensagem.");
  return { messageId, raw };
}
