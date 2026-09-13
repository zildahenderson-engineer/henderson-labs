# Henderson Labs

O **Henderson Labs** é um SaaS B2B de retenção para academias e negócios recorrentes. Seu foco não é apenas armazenar contatos: a plataforma identifica clientes que estão se afastando, transforma sinais em ações operacionais e mede a receita recuperada.

## Entrega atual

O MVP foi construído com React, TypeScript, Tailwind CSS, Express, tRPC, Drizzle ORM e MySQL/TiDB no ambiente gerenciado do projeto. A autenticação utiliza Manus OAuth. O painel é responsivo e utiliza uma navegação lateral persistente para a operação diária.

A arquitetura de dados aplica `organizationId` em todos os domínios de negócio. Toda leitura e escrita protegida parte da organização associada ao usuário autenticado; não existe seleção de `organizationId` recebida do navegador. Além disso, os perfis `owner`, `manager`, `operator` e `viewer` são verificados no servidor.

## Módulos implementados

| Módulo | O que já funciona |
| --- | --- |
| Landing page | Posicionamento comercial, calculadora de ROI, Henderson AI, WhatsApp, planos, FAQ e CTAs de teste. |
| Autenticação | Login Manus OAuth, proteção do painel e logout. |
| Dashboard | Indicadores de clientes ativos, risco, inativos, recuperados, receita, campanhas, mensagens e tarefas, além de insights determinísticos da Henderson AI. |
| Clientes | Cadastro, busca, filtro por status, histórico, observações, compra registrada, consentimento de WhatsApp e atualização de risco. |
| Perfil do cliente | Linha do tempo, follow-ups, histórico financeiro, pontos e jornada de recuperação. |
| CRM | Pipeline Novo → Em contato → Interessado → Cliente → Recorrente com movimentação de cards. |
| Tarefas | Follow-ups vinculados a clientes, prioridade, vencimento e conclusão. |
| Automações | Builder determinístico, ações de risco, inatividade, tarefas, recuperação e pontos; execução manual, logs e suporte a agendamento. |
| Recuperação | Priorização por potencial, registro de contato, resposta, recuperação e receita recuperada. |
| Fidelidade | Pontos, recompensas, ajustes auditáveis, cartão individual e página pública protegida por token opaco com QR Code. |
| Campanhas | Rascunhos por público, template aprovado e métricas de envio. O disparo exige consentimento, telefone válido e credenciais oficiais. |
| Relatórios | Visão financeira, desempenho de recuperação e campanhas, com exportação CSV de clientes. |
| Configurações | Limites de risco, dados da organização, membros, gerenciamento operacional de plano, exportação LGPD, anonimização e auditoria. |
| Henderson AI | Chat de negócio com histórico, function-calling somente leitura, respostas fundamentadas nos dados da organização, ferramentas consultadas e controle de uso. |
| Onboarding | Wizard inicial de três passos para empresa, canais e primeira automação, concluído de forma auditável. |

O banco também possui a tabela de mensagens WhatsApp para registrar identificador do provedor, estado da mensagem, falhas e timestamps de envio, entrega e leitura. O webhook de status da Meta está conectado e deduplica replays por identificador do provedor.

## WhatsApp Business Platform

A integração foi desenhada exclusivamente para a **WhatsApp Business Platform Cloud API**. O adapter server-side usa o endpoint oficial Graph API e nunca expõe o token ao navegador. Campanhas enviadas fora da janela de atendimento devem usar um template aprovado pela Meta, por isso o cadastro da campanha inclui `templateName`.

Para habilitar o disparo, configure no gerenciador de secrets do projeto:

| Variável | Finalidade |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Token permanente de system user com as permissões da Meta. |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador do número que fará o envio. |
| `WHATSAPP_GRAPH_VERSION` | Versão da Graph API; o padrão do projeto é `v23.0`. |
| `WHATSAPP_VERIFY_TOKEN` | Token usado para validar o endpoint de webhook. |
| `WHATSAPP_APP_SECRET` | Secret para validar a assinatura dos callbacks, quando o webhook for ativado. |

O guia de configuração, criação do app Meta, geração do token permanente e webhook de teste está na documentação oficial da Meta [1]. Enquanto as credenciais não estiverem presentes, o produto continua funcional para cadastro, classificação, recuperação, fidelidade e preparação de campanhas, mas o botão de disparo permanece bloqueado por segurança.

## Automações e execução agendada

A execução de cada automação é determinística e idempotente no nível da regra: clientes são selecionados por condição, as ações são aplicadas dentro da organização e um registro em `automation_runs` informa quantidade afetada, status, mensagem e timestamps.

A interface permite executar uma regra imediatamente ou solicitar uma execução diária. O callback protegido é `/api/scheduled/run-automation`; ele autentica a identidade de agendamento, localiza a automação pelo `taskUid` injetado pela plataforma e ignora payloads não confiáveis. O agendamento deve ser criado após o projeto estar publicado, pois o callback precisa de uma URL de produção acessível.

## Banco, migrations e seed

O schema está em `drizzle/schema.ts`. Além das migrations anteriores, `drizzle/0006_zippy_liz_osborn.sql` cria as tabelas `ai_conversations`, `ai_messages`, `ai_usage` e o marcador `organizations.onboardingCompletedAt`. A migration já foi aplicada ao banco gerenciado desta versão. Para desenvolvimento local, o seed é estritamente opt-in e bloqueia execução em `NODE_ENV=production`:

```bash
pnpm db:seed
```

O seed cria uma organização de demonstração e três clientes somente para ambiente de desenvolvimento. Nenhum dado de demonstração é criado automaticamente na versão publicada.

## Validação local

```bash
pnpm check
pnpm test
pnpm build
```

A API é consumida pela interface exclusivamente via hooks tRPC tipados. O front-end trata estados de carregamento, vazio, erro e sucesso. Datas de persistência são UTC; a formatação da interface usa o locale do navegador.

## Planos e limites

A estrutura de planos está pronta para limitar clientes, automações e usuários por organização:

| Plano | Preço de referência | Clientes | Automações | Usuários |
| --- | ---: | ---: | ---: | ---: |
| Básico | R$ 650/mês | 500 | 3 | 2 |
| Profissional | R$ 900/mês | 3.000 | 10 | 5 |
| Premium | R$ 1.650/mês | 10.000 | 30 | 15 |
| Enterprise | A partir de R$ 2.350/mês | Conforme contrato | Conforme contrato | Conforme contrato |

O gerenciamento de plano está disponível para o proprietário em Configurações. A ação principal cria um checkout hospedado pelo Asaas e só muda o plano após o evento de pagamento confirmado; o ajuste administrativo sem cobrança permanece separado e auditado para suporte interno.

## Privacidade e LGPD

O consentimento para WhatsApp é uma propriedade explícita do cliente, com data, origem e versão registradas, e é obrigatório para que ele entre como destinatário de uma campanha. Gestores podem exportar os dados operacionais da organização em JSON; a exportação não inclui tokens internos nem secrets. A anonimização exige perfil de gestor ou proprietário, motivo, confirmação na interface e registra um evento de auditoria. O cartão público de pontos usa um token aleatório, não um ID sequencial, e expõe somente primeiro nome, saldo e recompensas. Segredos de integração devem permanecer no ambiente server-side; não adicione tokens ao código ou ao cliente.

## Referência

[1]: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started "WhatsApp Cloud API Get Started — Meta for Developers"
