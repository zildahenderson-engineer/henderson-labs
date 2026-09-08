import { useEffect, useState } from "react";
import { ArrowLeft, Building2, CreditCard, Database, ExternalLink, ShieldCheck, Users, WalletCards } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const planNames = { basic: "Básico", professional: "Profissional", premium: "Premium", enterprise: "Enterprise" } as const;
type Plan = keyof typeof planNames;

export default function OwnerConsole() {
  const [, setLocation] = useLocation();
  const [selectedOrg, setSelectedOrg] = useState<number | null>(null);
  const owner = trpc.owner.me.useQuery();
  const overview = trpc.owner.overview.useQuery(undefined, { enabled: Boolean(owner.data) });
  const details = trpc.owner.organizationDetails.useQuery({ organizationId: selectedOrg! }, { enabled: selectedOrg !== null });
  const utils = trpc.useUtils();
  const setPlan = trpc.owner.setOrganizationPlan.useMutation({
    onSuccess: result => { toast.success(`Plano alterado de ${planNames[result.from]} para ${planNames[result.to]}.`); utils.owner.overview.invalidate(); utils.owner.organizationDetails.invalidate(); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => { if (owner.error) setLocation("/app"); }, [owner.error, setLocation]);
  if (owner.isLoading || overview.isLoading) return <div className="grid min-h-screen place-items-center bg-[#101b15] text-sm text-[#d8ff70]">Carregando console do proprietário…</div>;
  if (owner.error || !overview.data) return null;
  const data = overview.data;
  const selected = data.organizations.find(org => org.id === selectedOrg) ?? data.organizations[0];

  return <div className="min-h-screen bg-[#eef2ec] text-[#17211a]">
    <header className="flex h-20 items-center justify-between border-b border-[#dce5dc] bg-[#142019] px-8 text-white">
      <div className="flex items-center gap-4"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#d7fe70] text-lg font-black text-[#17211a]">H</div><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9bb19f]">Henderson Labs</p><h1 className="text-lg font-semibold">Console do proprietário</h1></div><Badge className="ml-3 bg-[#d7fe70] text-[#17211a] hover:bg-[#d7fe70]">Acesso total</Badge></div>
      <Button variant="outline" onClick={() => setLocation("/app")} className="border-white/20 bg-transparent text-white hover:bg-white/10"><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao produto</Button>
    </header>
    <main className="mx-auto max-w-[1500px] space-y-7 p-8">
      <div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6c8571]">Desktop administrativo</p><h2 className="mt-2 text-4xl font-semibold tracking-[-0.05em]">Visão global do Henderson Labs.</h2><p className="mt-2 text-sm text-[#647268]">Gerencie organizações, faturamento, integrações e segurança em um único lugar.</p></div><div className="rounded-2xl border border-[#d5e1d5] bg-white px-4 py-3 text-right shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#78907d]">Ambiente</p><p className="mt-1 font-semibold capitalize">{data.asaas.environment}</p></div></div>
      <section className="grid grid-cols-4 gap-4">
        <Metric icon={Building2} label="Organizações" value={data.totals.organizations} />
        <Metric icon={Users} label="Usuários" value={data.totals.users} />
        <Metric icon={Database} label="Clientes" value={data.totals.customers} />
        <Metric icon={WalletCards} label="Membros" value={data.totals.members} />
      </section>
      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)] gap-6">
        <section className="rounded-3xl border border-[#dce5dc] bg-white p-6 shadow-[0_20px_50px_rgba(32,56,38,0.06)]"><div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold">Organizações</h3><p className="mt-1 text-xs text-[#758178]">Selecione uma conta para abrir seus detalhes operacionais.</p></div><Badge variant="outline">{data.organizations.length} contas</Badge></div><div className="mt-5 overflow-hidden rounded-2xl border border-[#e5ece4]"><div className="grid grid-cols-[1fr_150px_130px_110px] bg-[#f5f8f4] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7a8b7d]"><span>Organização</span><span>Plano</span><span>Criada em</span><span></span></div>{data.organizations.map(org => <button key={org.id} onClick={() => setSelectedOrg(org.id)} className={`grid w-full grid-cols-[1fr_150px_130px_110px] items-center border-t border-[#edf1ec] px-4 py-4 text-left transition-colors hover:bg-[#f7fbf5] ${selected?.id === org.id ? "bg-[#effbd1]" : "bg-white"}`}><span><span className="block font-semibold">{org.name}</span><span className="text-xs text-[#8a978d]">/{org.slug}</span></span><span><Badge variant="outline" className="capitalize">{planNames[org.plan]}</Badge></span><span className="text-xs text-[#718075]">{new Date(org.createdAt).toLocaleDateString("pt-BR")}</span><span className="text-right text-xs font-semibold text-[#3f7048]">Abrir <ExternalLink className="ml-1 inline h-3.5 w-3.5" /></span></button>)}</div></section>
        <section className="rounded-3xl border border-[#dce5dc] bg-[#142019] p-6 text-white"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#d7fe70] text-[#17211a]"><ShieldCheck className="h-5 w-5" /></div><div><h3 className="font-semibold">Controles do proprietário</h3><p className="text-xs text-[#a9b9ab]">Proteção global ativa</p></div></div><div className="mt-6 space-y-3 text-sm"><StatusRow label="Asaas" value={data.asaas.configured ? "Configurado" : "Aguardando secrets"} positive={data.asaas.configured} /><StatusRow label="Ambiente" value={data.asaas.environment} positive={data.asaas.environment === "sandbox"} /><StatusRow label="Isolamento" value="Por organização" positive /><StatusRow label="Auditoria" value={`${data.recentAudit.length} eventos recentes`} positive /></div></section>
      </div>
      {selected && <section className="grid grid-cols-[1fr_1fr] gap-6"><div className="rounded-3xl border border-[#dce5dc] bg-white p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#78907d]">Organização selecionada</p><h3 className="mt-2 text-2xl font-semibold">{selected.name}</h3><p className="mt-1 text-xs text-[#77857a]">Dados operacionais e faturamento</p></div><Badge className="bg-[#d7fe70] text-[#17211a] hover:bg-[#d7fe70]">{planNames[selected.plan]}</Badge></div>{details.data && <div className="mt-6 grid grid-cols-3 gap-3"><Info label="Clientes" value={details.data.customerTotal} /><Info label="Membros" value={details.data.members.length} /><Info label="Pagamentos" value={details.data.payments.length} /></div>}<div className="mt-6 border-t border-[#edf1ec] pt-5"><p className="text-xs font-semibold">Alteração administrativa de plano</p><p className="mt-1 text-xs text-[#77857a]">Uso restrito ao proprietário e sempre registrado na auditoria.</p><div className="mt-3 flex gap-2"><Select onValueChange={value => setPlan.mutate({ organizationId: selected.id, plan: value as Plan, reason: "Ajuste administrativo realizado pelo proprietário." })}><SelectTrigger className="w-56"><SelectValue placeholder="Escolher novo plano" /></SelectTrigger><SelectContent>{(Object.keys(planNames) as Plan[]).map(plan => <SelectItem key={plan} value={plan}>{planNames[plan]}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={() => setLocation(`/app/configuracoes`)}>Abrir conta</Button></div></div></div><div className="rounded-3xl border border-[#dce5dc] bg-white p-6"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-[#4e7957]" /><h3 className="font-semibold">Pagamentos recentes</h3></div><div className="mt-4 space-y-2">{details.data?.payments.length ? details.data.payments.slice(0, 6).map(payment => <div key={payment.id} className="flex items-center justify-between rounded-xl bg-[#f6f8f4] px-3 py-3 text-xs"><span><span className="font-semibold capitalize">{planNames[payment.requestedPlan]}</span><span className="ml-2 text-[#8a978d]">R$ {payment.amount}</span></span><Badge variant="outline" className="capitalize">{payment.status}</Badge></div>) : <p className="rounded-xl bg-[#f6f8f4] p-4 text-xs text-[#748178]">Nenhum pagamento registrado.</p>}</div></div></section>}
    </main>
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: number }) { return <div className="rounded-2xl border border-[#dce5dc] bg-white p-5 shadow-sm"><Icon className="h-4 w-4 text-[#5c8263]" /><p className="mt-4 text-xs text-[#77857b]">{label}</p><p className="mt-1 text-3xl font-semibold tracking-[-0.05em]">{value.toLocaleString("pt-BR")}</p></div>; }
function Info({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-[#f6f8f4] p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-[#819087]">{label}</p><p className="mt-1 text-xl font-semibold">{value.toLocaleString("pt-BR")}</p></div>; }
function StatusRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) { return <div className="flex items-center justify-between rounded-xl bg-white/7 px-3 py-3"><span className="text-[#bccabd]">{label}</span><span className={positive ? "text-[#d7fe70]" : "text-[#f3c98a]"}>{value}</span></div>; }
