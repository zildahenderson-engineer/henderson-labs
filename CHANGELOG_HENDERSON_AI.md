# Henderson Labs — Evolução para SaaS profissional

Resumo do que foi implementado nesta rodada, em cima do projeto existente.
Nada do que já funcionava (Asaas, WhatsApp Cloud API, multi-tenancy, automações,
recuperação, fidelidade, CRM) foi removido ou reescrito — só evoluído.

## ✅ 1. Henderson AI (o maior gap do projeto — agora resolvido)

- **`drizzle/0006_zippy_liz_osborn.sql`** — migration nova: tabelas `ai_conversations`,
  `ai_messages`, `ai_usage` + coluna `onboardingCompletedAt` em `organizations`.
  Gerada pelo próprio `drizzle-kit generate`, encadeada corretamente no histórico.
  **Rode `pnpm db:push` (ou `drizzle-kit migrate`) antes de subir.**
- **`server/services.ai.ts`** — motor de function-calling com 9 ferramentas que leem
  direto do banco (resumo da empresa, faturamento mensal, clientes em risco, melhores
  clientes, cobranças, recuperação, campanhas, automações, tarefas). A IA nunca
  inventa números — só pode responder com o que essas ferramentas retornam.
- **`server/_core/llm.ts`** — corrigido um bug real do SDK: `tool_calls` do assistente
  eram descartados ao montar o histórico, o que quebra qualquer loop de function-calling
  de múltiplas rodadas. Adição retrocompatível (campo opcional), nada existente foi afetado.
- **`server/routers/ai.ts`** — router tRPC (`ai.ask`, `ai.history`, `ai.conversations`,
  `ai.deleteConversation`, `ai.insights`), com auditoria em `audit_logs` e registro de
  uso de tokens.
- **`client/src/pages/HendersonAIPage.tsx`** — chat completo em `/app/ai`, com histórico
  de conversas, prompts sugeridos e indicação de quais dados foram consultados em cada
  resposta.
- Item "Henderson AI" adicionado à sidebar.

## ✅ 2. Dashboard com insights (Henderson AI Insights)

- `getHendersonInsights()` em `services.ai.ts`: insights **determinísticos** (não usam
  LLM) — variação de faturamento mês a mês, clientes em risco, inativos, melhor
  campanha, cobranças vencidas. Sem custo de IA e sem risco de número errado.
- Card exibido no topo do Dashboard.

## ✅ 3. Onboarding profissional

- `organization.completeOnboarding` (mutation nova).
- `client/src/components/OnboardingWizard.tsx`: modal de 3 passos (empresa/segmento,
  WhatsApp, primeira automação) exibido uma vez, logo após o primeiro login, enquanto
  `onboardingCompletedAt` for nulo.

## ✅ 4. Correção de um gap crítico de negócio: checkout de plano

**Problema encontrado:** a troca de plano na tela de Configurações (`PlanManager`)
só chamava `organization.changePlan` — uma mutation administrativa que troca o plano
**sem cobrar nada**. O endpoint real de checkout Asaas (`createPlanCheckout`) já existia
no backend, mas nenhuma tela do produto o chamava. Ou seja: o fluxo "escolher plano →
checkout → Asaas → assinatura recorrente" pedido no briefing simplesmente não existia
na prática.

**Correção:** `client/src/components/SettingsControls.tsx` agora usa
`organization.createPlanCheckout` como ação principal (redireciona ao checkout
hospedado do Asaas), mantendo o ajuste administrativo sem cobrança como opção
secundária, claramente rotulada para uso interno/suporte.

## ✅ 5. Site de vendas

`client/src/pages/Home.tsx` — mantidas todas as seções existentes (hero, produto,
método, segurança, CTA final), e adicionadas as que faltavam:

- **Seção Henderson AI** — com as perguntas reais que a IA responde.
- **Seção WhatsApp** — comunicação automática via API oficial da Meta.
- **Seção Planos** — cartões com os 3 planos (preços reais já configurados no Asaas:
  R$ 49,90 / R$ 129,90 / R$ 299,90), CTA leva ao login/cadastro; a assinatura de fato
  acontece dentro do painel, no checkout Asaas corrigido no item 4.
- **Seção FAQ.**

## Validado nesta sessão

- `tsc --noEmit` — 0 erros.
- `vitest run` — 10/11 passam (a 1 falha é pré-existente, por falta da env var
  `WHATSAPP_VERIFY_TOKEN` neste sandbox, não relacionada a estas mudanças).
- `vite build` — build de produção completo, sem erros.

## Pendências recomendadas (não incluídas nesta rodada, por escopo)

1. **Rodar a migration `0006` no banco real** antes do deploy.
2. Configurar a variável de ambiente que o `invokeLLM` espera (verificar
   `server/_core/llm.ts` / infra Manus) para a Henderson AI funcionar em produção.
3. Polish de UX (estados vazios, loading, mensagens de erro) fora do que já existia.
4. Reforço de observabilidade além do `audit_logs` já usado pela IA.
5. Ajuste opcional de paleta para bater 100% com "preto/grafite + dourado" do
   briefing (hoje o acento é um verde-limão — já é "clean tech premium", mas não é
   literalmente dourado).
