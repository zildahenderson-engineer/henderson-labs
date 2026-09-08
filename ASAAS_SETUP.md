# Henderson Labs — Entrega Asaas

## O que foi implementado

O gerenciamento de planos agora cria um checkout hospedado no Asaas. A organização permanece no plano atual até que o Asaas envie um evento financeiro confirmado. O backend aceita `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` para ativar o plano solicitado, registra o pagamento e mantém uma trilha de auditoria. Eventos duplicados são ignorados pelo identificador único do webhook.

Eventos de cancelamento, vencimento, falha e reembolso atualizam o pagamento; em caso de reembolso ou cancelamento, o plano anterior é restaurado somente se a organização ainda estiver no plano que foi ativado por aquele pagamento.

O Henderson Labs não coleta nem armazena dados de cartão ou dados bancários. O checkout é hospedado pelo Asaas.

## Configuração no Asaas

Use primeiro o ambiente Sandbox. Configure o webhook para:

```text
https://hendersonlab-spyd2gkn.manus.space/api/webhooks/asaas
```

No webhook do Asaas, configure o header/token de autenticação usando um token secreto próprio. O servidor espera o header `asaas-access-token`.

As variáveis server-side necessárias são:

```text
ASAAS_ENV=sandbox
ASAAS_API_KEY=<chave privada Sandbox>
ASAAS_WEBHOOK_TOKEN=<token privado do webhook, entre 32 e 255 caracteres>
```

As credenciais não fazem parte deste arquivo ou do pacote ZIP. Elas devem ser cadastradas no cofre seguro do projeto; nunca devem ser colocadas em código, no frontend ou em um arquivo `.env` enviado a terceiros.

## Fluxo de troca de plano

1. O proprietário escolhe Básico, Profissional ou Premium em **Configurações > Gerenciar plano**.
2. O servidor cria um registro de pagamento pendente e solicita ao Asaas um checkout recorrente mensal.
3. O navegador é redirecionado para o link hospedado do Asaas.
4. O cliente conclui o pagamento no Asaas.
5. O Asaas envia o webhook para `/api/webhooks/asaas`.
6. O Henderson Labs valida o token, deduplica o evento, grava o status e ativa o novo plano somente após confirmação.

## Validação executada

- `pnpm check`: aprovado.
- `pnpm test`: 11 testes aprovados e 1 teste de integração externa ignorado por depender de credencial viva do WhatsApp.
- `pnpm build`: aprovado.
- Migration `drizzle/0005_easy_wendigo.sql`: gerada e aplicada, criando `billing_payments` e `asaas_webhook_events`.

O teste de credencial WhatsApp é manual porque depende de token externo com validade própria. Isso não interfere no checkout Asaas nem cria cobranças durante a suíte automatizada.

## Limites importantes

A aplicação não considera o redirecionamento de sucesso como prova de pagamento. A única fonte de ativação é o webhook autenticado do Asaas. Antes de usar produção, valide todo o fluxo no Sandbox e depois configure uma chave, token e webhook próprios de produção.
