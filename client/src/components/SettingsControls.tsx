import { useEffect, useState } from "react";
import { ChevronRight, Download, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const planNames = { basic: "Básico", professional: "Profissional", premium: "Premium" } as const;
const planLimits = { basic: "R$ 49,90/mês · 500 clientes · 3 automações · 2 usuários", professional: "R$ 129,90/mês · 3.000 clientes · 10 automações · 5 usuários", premium: "R$ 299,90/mês · 10.000 clientes · 30 automações · 15 usuários" } as const;
const paidPlans = ["basic", "professional", "premium"] as const;

type Plan = (typeof paidPlans)[number];

export function PlanManager({ currentPlan }: { currentPlan?: string }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>(paidPlans.includes(currentPlan as Plan) ? currentPlan as Plan : "professional");
  const utils = trpc.useUtils();
  const changePlan = trpc.organization.changePlan.useMutation({
    onSuccess: data => { toast.success(data.changed ? "Plano alterado com sucesso. Nenhum pagamento foi solicitado." : "Este plano já está ativo."); setOpen(false); utils.organization.current.invalidate(); },
    onError: error => toast.error(error.message),
  });
  useEffect(() => { if (currentPlan && paidPlans.includes(currentPlan as Plan)) setPlan(currentPlan as Plan); }, [currentPlan]);
  return <>
    <button onClick={() => setOpen(true)} className="mt-5 text-xs font-semibold text-[#d8ff70]">Gerenciar plano <ChevronRight className="inline h-3.5 w-3.5" /></button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Gerenciar plano</DialogTitle><DialogDescription>Escolha o plano operacional da organização. A alteração é administrativa e não exige pagamento.</DialogDescription></DialogHeader><div className="grid gap-2 py-3"><Label>Plano desejado</Label><Select value={plan} onValueChange={value => setPlan(value as Plan)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{paidPlans.map(item => <SelectItem key={item} value={item}>{planNames[item]} — {planLimits[item]}</SelectItem>)}</SelectContent></Select><p className="text-xs text-[#748077]">A mudança entra em vigor imediatamente e fica registrada na auditoria.</p></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => changePlan.mutate({ plan })} disabled={changePlan.isPending} className="bg-[#1a3021]">{changePlan.isPending ? "Salvando…" : "Alterar plano"}</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

export function PrivacyControls() {
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [reason, setReason] = useState("Solicitação do titular conforme LGPD");
  const utils = trpc.useUtils();
  const exportData = trpc.organization.exportData.useQuery(undefined, { enabled: false });
  const audit = trpc.organization.auditLogs.useQuery();
  const anonymize = trpc.customers.anonymize.useMutation({ onSuccess: () => { toast.success("Cliente anonimizado e evento registrado."); setAnonymizeOpen(false); setCustomerId(""); utils.organization.auditLogs.invalidate(); utils.customers.list.invalidate(); }, onError: error => toast.error(error.message) });
  useEffect(() => {
    if (!exportData.data) return;
    const blob = new Blob([JSON.stringify(exportData.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `henderson-lgpd-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
    toast.success("Exportação LGPD baixada.");
  }, [exportData.data]);
  return <div className="hl-card p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#547a59]" /><p className="text-sm font-semibold text-[#2b3b30]">LGPD e privacidade</p></div><p className="mt-2 text-xs leading-5 text-[#748077]">Exporte os dados da organização ou anonimize dados pessoais mediante solicitação do titular. Ações ficam registradas na auditoria.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => exportData.refetch()} disabled={exportData.isFetching} className="rounded-xl text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />{exportData.isFetching ? "Preparando…" : "Exportar dados"}</Button><Button variant="outline" onClick={() => setAnonymizeOpen(true)} className="rounded-xl text-xs text-[#9b4848]"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Anonimizar cliente</Button></div><p className="mt-3 text-[11px] text-[#89958c]">Exportações não incluem tokens internos ou credenciais de integração.</p>{audit.data?.length ? <div className="mt-5 border-t border-[#edf0eb] pt-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#829087]">Auditoria recente</p><div className="mt-2 space-y-2">{audit.data.slice(0, 4).map(item => <div key={item.id} className="flex items-center justify-between gap-3 text-[11px]"><span className="truncate text-[#596a5e]">{item.action.replaceAll(".", " · ")}</span><span className="shrink-0 text-[#9aa59d]">{new Date(item.createdAt).toLocaleDateString("pt-BR")}</span></div>)}</div></div> : null}<Dialog open={anonymizeOpen} onOpenChange={setAnonymizeOpen}><DialogContent><DialogHeader><DialogTitle>Anonimizar dados do cliente</DialogTitle><DialogDescription>Esta ação remove nome, telefone, e-mail, observações, saldo e histórico financeiro identificável. Não pode ser desfeita.</DialogDescription></DialogHeader><div className="grid gap-3 py-3"><div className="grid gap-2"><Label>ID do cliente</Label><Input value={customerId} onChange={event => setCustomerId(event.target.value)} inputMode="numeric" placeholder="Ex.: 42" /></div><div className="grid gap-2"><Label>Motivo</Label><Input value={reason} onChange={event => setReason(event.target.value)} maxLength={300} /></div></div><DialogFooter><Button variant="outline" onClick={() => setAnonymizeOpen(false)}>Cancelar</Button><Button onClick={() => anonymize.mutate({ id: Number(customerId), reason })} disabled={anonymize.isPending || !/^\d+$/.test(customerId) || reason.trim().length < 5} className="bg-[#9b4848] hover:bg-[#7d3939]">Confirmar anonimização</Button></DialogFooter></DialogContent></Dialog></div>;
}
