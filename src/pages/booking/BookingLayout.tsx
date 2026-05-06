import React, { useState, useEffect } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ClientAuthProvider } from '@/contexts/ClientAuthContext';
import { Loader2, Calendar } from 'lucide-react';

interface TenantInfo {
  id: string;
  name: string;
  booking_slug: string;
  logo_url?: string;
  primary_color?: string;
}

const BookingLayout: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTenant = async () => {
      if (!slug) {
        setError('Link inválido');
        setLoading(false);
        return;
      }

      try {
        // Fetch tenant by booking slug
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('id, name, booking_slug, subscription_due_date')
          .eq('booking_slug', slug)
          .eq('status', 'active')
          .maybeSingle();

        if (tenantError) {
          console.error('Error fetching tenant:', tenantError);
          setError('Erro ao carregar informações do salão');
          setLoading(false);
          return;
        }

        if (!tenantData) {
          setError('Salão não encontrado ou indisponível');
          setLoading(false);
          return;
        }

        if (tenantData.subscription_due_date) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const dueDate = new Date(tenantData.subscription_due_date);
          dueDate.setHours(0, 0, 0, 0);

          if (dueDate < today) {
            setError('Agendamento online indisponível no momento');
            setLoading(false);
            return;
          }
        }

        // Fetch tenant settings for logo/colors
        const { data: settingsData } = await supabase
          .from('tenant_settings')
          .select('logo_url, primary_color')
          .eq('tenant_id', tenantData.id)
          .maybeSingle();

        setTenant({
          ...tenantData,
          logo_url: settingsData?.logo_url || undefined,
          primary_color: settingsData?.primary_color || undefined,
        });
        setLoading(false);
      } catch (err) {
        console.error('Error:', err);
        setError('Erro inesperado');
        setLoading(false);
      }
    };

    fetchTenant();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <Calendar className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Ops!</h1>
          <p className="text-muted-foreground mb-6">{error || 'Salão não encontrado'}</p>
          <button
            onClick={() => navigate('/')}
            className="text-primary hover:underline"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  return (
    <ClientAuthProvider tenantId={tenant.id}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        {/* Header */}
        <header className="bg-white shadow-sm border-b sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              {tenant.logo_url ? (
                <img
                  src={tenant.logo_url}
                  alt={tenant.name}
                  className="h-10 w-10 object-contain rounded-lg"
                />
              ) : (
                <div 
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: tenant.primary_color || 'hsl(var(--primary))' }}
                >
                  {tenant.name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="font-semibold text-lg text-foreground">{tenant.name}</h1>
                <p className="text-xs text-muted-foreground">Agendamento Online</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Outlet context={{ tenant }} />
        </main>

        {/* Footer */}
        <footer className="bg-white border-t py-6 mt-auto">
          <div className="max-w-4xl mx-auto px-4 text-center text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} {tenant.name}. Agendamento online.</p>
          </div>
        </footer>
      </div>
    </ClientAuthProvider>
  );
};

export default BookingLayout;
