import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import { HendersonAIPage } from "./pages/HendersonAIPage";
import { AutomationsPage, CampaignsPage, CrmPage, CustomerDetailPage, CustomersPage, DashboardPage, LoyaltyPage, LoyaltyQrPage, PublicLoyaltyPage, RecoveryPage, ReportsPage, SettingsPage, TasksPage } from "./pages/AppPages";
import { Route, Switch } from "wouter";

function AppRoute({ children }: { children: React.ReactNode }) { return <DashboardLayout>{children}</DashboardLayout>; }
function Router() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/pontos/:token" component={PublicLoyaltyPage} />
    <Route path="/app" component={() => <AppRoute><DashboardPage /></AppRoute>} />
    <Route path="/app/ai" component={() => <AppRoute><HendersonAIPage /></AppRoute>} />
    <Route path="/app/clientes/:id" component={() => <AppRoute><CustomerDetailPage /></AppRoute>} />
    <Route path="/app/clientes" component={() => <AppRoute><CustomersPage /></AppRoute>} />
    <Route path="/app/crm" component={() => <AppRoute><CrmPage /></AppRoute>} />
    <Route path="/app/tarefas" component={() => <AppRoute><TasksPage /></AppRoute>} />
    <Route path="/app/recuperacao" component={() => <AppRoute><RecoveryPage /></AppRoute>} />
    <Route path="/app/campanhas" component={() => <AppRoute><CampaignsPage /></AppRoute>} />
    <Route path="/app/automacoes" component={() => <AppRoute><AutomationsPage /></AppRoute>} />
    <Route path="/app/fidelidade/:id" component={() => <AppRoute><LoyaltyQrPage /></AppRoute>} />
    <Route path="/app/fidelidade" component={() => <AppRoute><LoyaltyPage /></AppRoute>} />
    <Route path="/app/relatorios" component={() => <AppRoute><ReportsPage /></AppRoute>} />
    <Route path="/app/configuracoes" component={() => <AppRoute><SettingsPage /></AppRoute>} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="top-right" richColors /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
