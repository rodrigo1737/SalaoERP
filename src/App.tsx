import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Booking (client self-service) pages
import BookingLayout from "./pages/booking/BookingLayout";
import BookingHome from "./pages/booking/BookingHome";
import ClientSignup from "./pages/booking/ClientSignup";
import ClientLogin from "./pages/booking/ClientLogin";
import ClientBooking from "./pages/booking/ClientBooking";
import ClientAppointments from "./pages/booking/ClientAppointments";
import TermsPage from "./pages/booking/TermsPage";
import PrivacyPage from "./pages/booking/PrivacyPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />

            {/* Redireciona raiz para /app */}
            <Route path="/" element={
              <ProtectedRoute>
                <Navigate to="/app" replace />
              </ProtectedRoute>
            } />

            {/* ITEM 14: Navegação baseada em URL — /app/:page */}
            <Route path="/app" element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <Index />
                </ErrorBoundary>
              </ProtectedRoute>
            } />
            <Route path="/app/:page" element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <Index />
                </ErrorBoundary>
              </ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute requiredRole="admin">
                <Admin />
              </ProtectedRoute>
            } />

            {/* Public Booking Routes - Client Self-Service */}
            <Route path="/b/:slug" element={<BookingLayout />}>
              <Route index element={<BookingHome />} />
              <Route path="cadastro" element={<ClientSignup />} />
              <Route path="login" element={<ClientLogin />} />
              <Route path="agendar" element={<ClientBooking />} />
              <Route path="meus-agendamentos" element={<ClientAppointments />} />
              <Route path="termos" element={<TermsPage />} />
              <Route path="privacidade" element={<PrivacyPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
