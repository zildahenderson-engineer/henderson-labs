import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bot, Bell, Building2, Check, ChevronRight, Sparkles } from "lucide-react";

const SEGMENTS = ["Academia", "Estúdio de pilates/yoga", "Clínica de estética", "Barbearia/salão", "Clube ou associação", "Outro negócio recorrente"];

/** Shown once, right after signup, until the organization has onboardingCompletedAt set. */
export function OnboardingWizard({ organizationId, name, segment, onDone }: { organizationId: number; name: string; segment: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name, segment: segment || SEGMENTS[0] });
  const utils = trpc.useUtils();
  const complete = trpc.organization.completeOnboarding.useMutation({
    onSuccess: () => { utils.organization.current.invalidate(); onDone(); },
    onError: error => toast.error(error instanceof Error ? error.message : "Não foi possível concluir o onboarding."),
  });

  const steps = [
    { icon: Building2, title: "Configure sua empresa", description: "Como sua organização vai aparecer no Henderson Labs." },
    { icon: Bell, title: "Conecte seus canais", description: "WhatsApp Business fica em Configurações, a qualquer momento." },
    { icon: Bot, title: "Ative sua primeira automação", description: "Deixe o sistema trabalhar por você." },
  ];

  const finish = () => complete.mutate({ name: form.name, segment: form.segment });

  return <Dialog open onOpenChange={() => {}}>
    <DialogContent className="max-w-md gap-0 p-0" onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => event.preventDefault()}>
      <div className="bg-[#1a3021] p-6 text-white">
        <div className="flex items-center gap-2 text-[#d8ff70]"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.16em]">Henderson Labs</span></div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Configure seu Henderson em {steps.length} passos.</h2>
        <div className="mt-4 flex gap-1.5">
          {steps.map((_, index) => <div key={index} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-[#d8ff70]" : "bg-white/20"}`} />)}
        </div>
      </div>

      <div className="p-6">
        {step === 0 && <div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff4eb] text-[#54755b]"><Building2 className="h-4.5 w-4.5" /></div>
          <h3 className="mt-3 font-semibold text-[#1b271e]">{steps[0].title}</h3>
          <p className="mt-1 text-xs text-[#748077]">{steps[0].description}</p>
          <div className="mt-5 grid gap-4">
            <div className="grid gap-2"><Label>Nome da empresa</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Academia Vitalis" autoFocus /></div>
            <div className="grid gap-2"><Label>Segmento</Label><div className="grid grid-cols-2 gap-2">
              {SEGMENTS.map(option => <button key={option} onClick={() => setForm({ ...form, segment: option })} className={`rounded-xl border px-3 py-2 text-left text-[11px] font-medium transition-colors ${form.segment === option ? "border-[#1a3021] bg-[#eef4ea] text-[#1a3021]" : "border-[#e4e8e1] text-[#647167] hover:bg-[#f6f8f4]"}`}>{option}</button>)}
            </div></div>
          </div>
        </div>}

        {step === 1 && <div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff4eb] text-[#54755b]"><Bell className="h-4.5 w-4.5" /></div>
          <h3 className="mt-3 font-semibold text-[#1b271e]">{steps[1].title}</h3>
          <p className="mt-1 text-xs leading-5 text-[#748077]">{steps[1].description}</p>
          <div className="mt-5 rounded-xl bg-[#f6f8f4] p-4 text-xs leading-6 text-[#4a5a4e]">
            Depois de finalizar, vá em <strong>Configurações → WhatsApp Business Cloud API</strong> para conectar o número oficial da sua empresa e liberar campanhas e automações por WhatsApp.
          </div>
        </div>}

        {step === 2 && <div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff4eb] text-[#54755b]"><Bot className="h-4.5 w-4.5" /></div>
          <h3 className="mt-3 font-semibold text-[#1b271e]">{steps[2].title}</h3>
          <p className="mt-1 text-xs leading-5 text-[#748077]">{steps[2].description}</p>
          <div className="mt-5 rounded-xl bg-[#f6f8f4] p-4 text-xs leading-6 text-[#4a5a4e]">
            Sugestão: crie a automação <strong>"Recuperação de clientes"</strong> — quando um cliente ficar 30 dias sem comprar, o sistema já pode marcá-lo como em risco e criar uma tarefa de follow-up. Você encontra isso em <strong>Automações</strong>.
          </div>
        </div>}

        <div className="mt-6 flex items-center justify-between">
          <button onClick={finish} disabled={complete.isPending} className="text-xs font-semibold text-[#8b978e] hover:text-[#5c6c60]">Pular por agora</button>
          <Button onClick={() => step < steps.length - 1 ? setStep(step + 1) : finish()} disabled={complete.isPending || (step === 0 && !form.name.trim())} className="h-10 rounded-xl bg-[#1a3021] px-4 text-xs">
            {step < steps.length - 1 ? <>Continuar <ChevronRight className="ml-1 h-4 w-4" /></> : <>Ir para o painel <Check className="ml-1 h-4 w-4" /></>}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
