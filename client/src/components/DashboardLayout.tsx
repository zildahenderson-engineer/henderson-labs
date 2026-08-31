import { useAuth } from "@/_core/hooks/useAuth";
import { HendersonLogo } from "@/components/HendersonLogo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { BarChart3, Bot, ChevronRight, CircleHelp, HeartHandshake, LayoutDashboard, LogOut, Megaphone, Settings, Sparkles, Users, UserRoundCog, WalletCards, Workflow } from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const sections = [
  { label: "Visão geral", items: [{ icon: LayoutDashboard, label: "Painel", path: "/app" }] },
  { label: "Relacionamento", items: [
    { icon: Users, label: "Clientes", path: "/app/clientes" },
    { icon: Workflow, label: "CRM", path: "/app/crm" },
    { icon: UserRoundCog, label: "Tarefas", path: "/app/tarefas" },
  ] },
  { label: "Crescimento", items: [
    { icon: HeartHandshake, label: "Recuperação", path: "/app/recuperacao" },
    { icon: Megaphone, label: "Campanhas", path: "/app/campanhas" },
    { icon: Bot, label: "Automações", path: "/app/automacoes" },
    { icon: WalletCards, label: "Fidelidade", path: "/app/fidelidade" },
  ] },
  { label: "Gestão", items: [
    { icon: BarChart3, label: "Relatórios", path: "/app/relatorios" },
    { icon: Settings, label: "Configurações", path: "/app/configuracoes" },
  ] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return <div className="grid min-h-screen place-items-center bg-[#f7f8f5] px-6">
      <div className="w-full max-w-md rounded-[28px] border border-[#e4e8e1] bg-white p-8 text-center shadow-[0_24px_60px_rgba(20,31,25,0.08)]">
        <HendersonLogo className="mx-auto w-fit" />
        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a9180]">Área protegida</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#17211a]">Entre no seu laboratório de crescimento.</h1>
          <p className="mt-4 text-sm leading-6 text-[#637067]">Acesse a organização, clientes e automações com sua conta Henderson Labs.</p>
        </div>
        <Button onClick={() => startLogin()} className="mt-8 h-11 w-full rounded-xl bg-[#17211a] text-white hover:bg-[#263b2d]">Entrar no painel <ChevronRight className="ml-1 h-4 w-4" /></Button>
      </div>
    </div>;
  }
  return <SidebarProvider defaultOpen className="min-w-0">
    <AppSidebar />
    <SidebarInset className="min-w-0 max-w-full overflow-x-hidden bg-[#f7f8f5] pt-14 md:pt-0">{children}</SidebarInset>
  </SidebarProvider>;
}

function AppSidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const current = sections.flatMap(section => section.items).find(item => item.path === location)?.label ?? "Painel";
  return <>
    <Sidebar collapsible="icon" className="border-0 bg-[#142019] text-[#dfe9de]">
      <SidebarHeader className="h-[76px] px-4 pt-5">
        <HendersonLogo inverse className="group-data-[collapsible=icon]:justify-center" />
      </SidebarHeader>
      <SidebarContent className="px-3 pb-4">
        {sections.map((section, sectionIndex) => <div key={section.label} className={sectionIndex ? "mt-5" : ""}>
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#778f7c] group-data-[collapsible=icon]:hidden">{section.label}</p>
          <SidebarMenu>
            {section.items.map(item => <SidebarMenuItem key={item.path}>
              <SidebarMenuButton tooltip={item.label} isActive={location === item.path} onClick={() => setLocation(item.path)} className="h-10 rounded-xl text-[#b6c7b9] hover:bg-white/7 hover:text-white data-[active=true]:bg-[#d7fe70] data-[active=true]:font-semibold data-[active=true]:text-[#18221a]">
                <item.icon className="h-4 w-4" /><span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </div>)}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-3 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 text-[#d8ff70]"><Sparkles className="h-3.5 w-3.5" /><span className="text-[11px] font-semibold">Plano Profissional</span></div>
          <p className="mt-1 text-[11px] leading-4 text-[#9bafa0]">Potencialize sua retenção.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d7fe70] group-data-[collapsible=icon]:justify-center">
            <Avatar className="h-8 w-8 border border-white/15"><AvatarFallback className="bg-[#395344] text-[11px] font-bold text-[#e7ffe4]">{user?.name?.slice(0, 2).toUpperCase() || "HL"}</AvatarFallback></Avatar>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-medium text-white">{user?.name || "Membro"}</p><p className="mt-0.5 truncate text-[10px] text-[#91a392]">{user?.email || ""}</p></div>
          </button></DropdownMenuTrigger>
          <DropdownMenuContent className="mb-2 w-52" align="start"><DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/app/configuracoes")}><Settings className="mr-2 h-4 w-4" />Configurações</DropdownMenuItem><DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={logout}><LogOut className="mr-2 h-4 w-4" />Sair</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
    {isMobile && <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-[#e7ebe6] bg-[#f7f8f5]/95 px-4 backdrop-blur"><SidebarTrigger className="rounded-lg" /><span className="text-sm font-semibold text-[#17211a]">{current}</span><CircleHelp className="ml-auto h-4 w-4 text-[#829087]" /></div>}
  </>;
}
