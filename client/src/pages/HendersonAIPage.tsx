import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Bot, CircleAlert, History, Loader2, Plus, Sparkles, Trash2, User } from "lucide-react";

const TOOL_LABELS: Record<string, string> = {
  get_company_overview: "Resumo da empresa",
  get_revenue_summary: "Faturamento",
  get_at_risk_customers: "Clientes em risco",
  get_best_customers: "Melhores clientes",
  get_pending_billing: "Cobranças",
  get_recovery_performance: "Recuperação",
  get_campaign_performance: "Campanhas",
  get_automation_performance: "Automações",
  get_open_tasks_summary: "Tarefas",
};

const SUGGESTED_PROMPTS = [
  "Faça um resumo da minha empresa",
  "Quanto vendi este mês?",
  "Quais clientes não compram há muito tempo?",
  "Qual foi meu melhor cliente?",
  "Quais cobranças estão pendentes?",
  "Como estão minhas automações?",
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "A Henderson AI não conseguiu responder agora.";
}

type LocalMessage = { role: "user" | "assistant"; content: string; toolsUsed?: string[]; pending?: boolean };

export function HendersonAIPage() {
  const utils = trpc.useUtils();
  const conversations = trpc.ai.conversations.useQuery();
  const [activeId, setActiveId] = useState<number | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const history = trpc.ai.history.useQuery({ conversationId: activeId! }, { enabled: !!activeId });

  useEffect(() => {
    if (history.data) {
      setLocalMessages(history.data.messages.map(message => ({
        role: message.role,
        content: message.content,
        toolsUsed: (message.toolsUsed as string[] | null) ?? undefined,
      })));
    } else if (!activeId) {
      setLocalMessages([]);
    }
  }, [history.data, activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [localMessages]);

  const ask = trpc.ai.ask.useMutation({
    onSuccess: result => {
      setLocalMessages(current => {
        const withoutPending = current.filter(message => !message.pending);
        return [...withoutPending, { role: "assistant", content: result.reply, toolsUsed: result.toolsUsed }];
      });
      if (!activeId) setActiveId(result.conversationId);
      utils.ai.conversations.invalidate();
    },
    onError: error => {
      toast.error(errorMessage(error));
      setLocalMessages(current => current.filter(message => !message.pending));
    },
  });

  const deleteConversation = trpc.ai.deleteConversation.useMutation({
    onSuccess: () => {
      toast.success("Conversa excluída.");
      utils.ai.conversations.invalidate();
      setActiveId(undefined);
      setLocalMessages([]);
    },
    onError: error => toast.error(errorMessage(error)),
  });

  const send = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;
    setLocalMessages(current => [...current, { role: "user", content: trimmed }, { role: "assistant", content: "", pending: true }]);
    setDraft("");
    ask.mutate({ question: trimmed, conversationId: activeId });
  };

  const hasMessages = localMessages.length > 0;

  return <div className="hl-page hl-fade-in flex h-[calc(100vh-32px)] flex-col sm:h-[calc(100vh-48px)]">
    <div className="mb-5 flex items-center justify-between">
      <div>
        <p className="hl-eyebrow">Inteligência</p>
        <h1 className="mt-1.5 flex items-center gap-2 text-[28px] font-semibold tracking-[-0.055em] text-[#18221a] sm:text-[32px]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1a3021] text-[#d8ff70]"><Sparkles className="h-4 w-4" /></span>
          Henderson AI
        </h1>
        <p className="mt-1 text-sm text-[#748077]">Pergunte sobre sua carteira, receita e automações — as respostas vêm sempre dos seus dados reais.</p>
      </div>
      <Button variant="outline" onClick={() => { setActiveId(undefined); setLocalMessages([]); }} className="h-10 rounded-xl bg-white text-xs">
        <Plus className="mr-1.5 h-4 w-4" />Nova conversa
      </Button>
    </div>

    <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[240px_1fr]">
      <aside className="hl-card hidden min-h-0 flex-col p-3 xl:flex">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#829087]"><History className="h-3.5 w-3.5" />Conversas</div>
        <div className="mt-1 flex-1 space-y-1 overflow-y-auto">
          {conversations.data?.length ? conversations.data.map(conversation => <div key={conversation.id} className="group flex items-center gap-1">
            <button onClick={() => setActiveId(conversation.id)} className={`flex-1 truncate rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${activeId === conversation.id ? "bg-[#eef4ea] font-semibold text-[#1b271e]" : "text-[#647167] hover:bg-[#f6f8f4]"}`}>{conversation.title}</button>
            <button onClick={() => { if (window.confirm("Excluir esta conversa?")) deleteConversation.mutate({ conversationId: conversation.id }); }} className="hidden rounded-md p-1.5 text-[#a13d3d] hover:bg-[#fbe6e6] group-hover:block"><Trash2 className="h-3 w-3" /></button>
          </div>) : <p className="px-2.5 py-6 text-center text-[11px] text-[#8b978e]">Suas conversas com a Henderson AI aparecerão aqui.</p>}
        </div>
      </aside>

      <div className="hl-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
          {!hasMessages && <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eff4eb] text-[#54755b]"><Bot className="h-5 w-5" /></div>
            <h3 className="mt-4 font-semibold tracking-[-0.02em] text-[#1b271e]">O que você quer saber sobre o seu negócio?</h3>
            <p className="mt-1 text-sm leading-6 text-[#748077]">A Henderson AI consulta seus clientes, receita, campanhas e automações em tempo real.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map(prompt => <button key={prompt} onClick={() => send(prompt)} className="rounded-full border border-[#e4e8e1] bg-white px-3 py-1.5 text-[11px] font-medium text-[#4a5a4e] hover:border-[#c7d9c1] hover:bg-[#f6f8f4]">{prompt}</button>)}
            </div>
          </div>}
          {localMessages.map((message, index) => <ChatBubble key={index} message={message} />)}
        </div>
        <div className="border-t border-[#edf0eb] p-4">
          <form onSubmit={event => { event.preventDefault(); send(draft); }} className="flex items-end gap-2">
            <Textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(draft); } }} placeholder="Pergunte algo, ex.: quais produtos... clientes estão parados?" className="min-h-[44px] flex-1 resize-none rounded-xl text-sm" rows={1} />
            <Button type="submit" disabled={ask.isPending || !draft.trim()} className="h-11 shrink-0 rounded-xl bg-[#1a3021] px-4 text-xs">
              {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Perguntar"}
            </Button>
          </form>
          <p className="mt-2 text-center text-[10px] text-[#9aa69c]">A Henderson AI responde apenas com dados da sua organização. Pode cometer erros — confira decisões importantes.</p>
        </div>
      </div>
    </div>
  </div>;
}

function ChatBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === "user";
  return <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${isUser ? "bg-[#e2eedc] text-[#4d704f]" : "bg-[#1a3021] text-[#d8ff70]"}`}>
      {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
    </div>
    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-6 ${isUser ? "bg-[#1a3021] text-white" : "bg-[#f6f8f4] text-[#26332b]"}`}>
      {message.pending
        ? <span className="inline-flex items-center gap-1.5 text-[#748077]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Consultando seus dados…</span>
        : <p className="whitespace-pre-wrap">{message.content}</p>}
      {!!message.toolsUsed?.length && <div className="mt-2 flex flex-wrap gap-1.5">
        {message.toolsUsed.map(tool => <span key={tool} className="rounded-full bg-white/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#5c6c60]">{TOOL_LABELS[tool] ?? tool}</span>)}
      </div>}
    </div>
  </div>;
}

export function AIErrorFallback() {
  return <div className="hl-page"><div className="hl-card flex min-h-[260px] flex-col items-center justify-center px-6 py-10 text-center"><CircleAlert className="h-6 w-6 text-[#a13d3d]" /><h3 className="mt-4 font-semibold text-[#1b271e]">Henderson AI indisponível</h3><p className="mt-1 max-w-sm text-sm text-[#748077]">Não foi possível carregar a assistente agora. Tente novamente em instantes.</p></div></div>;
}
