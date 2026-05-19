import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { hasCleaningModulePackage } from '@/lib/tenantSegments';

export interface StaffVisibility {
  id?: string;
  professional_id: string;
  can_view_client_phone: boolean;
  can_view_full_address: boolean;
  can_view_access_instructions: boolean;
  can_view_internal_notes: boolean;
  can_view_customer_price: boolean;
  can_view_own_commission: boolean;
  can_view_financial_status: boolean;
  can_view_team_schedule: boolean;
  can_view_client_history: boolean;
  can_manage_products_used: boolean;
  can_cancel_own_appointment: boolean;
  can_reopen_completed_appointment: boolean;
}

interface CleaningProfessional {
  id: string;
  name: string;
  nickname: string;
  works_cleaning?: boolean | null;
  has_schedule?: boolean | null;
}

const visibilityLabels: Array<{
  key: keyof Omit<StaffVisibility, 'id' | 'professional_id'>;
  label: string;
}> = [
  { key: 'can_view_client_phone', label: 'Ver telefone do cliente' },
  { key: 'can_view_full_address', label: 'Ver endereço completo' },
  { key: 'can_view_access_instructions', label: 'Ver instruções de acesso' },
  { key: 'can_view_internal_notes', label: 'Ver observações internas' },
  { key: 'can_view_customer_price', label: 'Ver valor cobrado' },
  { key: 'can_view_own_commission', label: 'Ver própria comissão' },
  { key: 'can_view_financial_status', label: 'Ver status financeiro' },
  { key: 'can_view_team_schedule', label: 'Ver agenda da equipe' },
  { key: 'can_view_client_history', label: 'Ver histórico do cliente' },
  { key: 'can_manage_products_used', label: 'Informar produtos utilizados' },
  { key: 'can_cancel_own_appointment', label: 'Cancelar atendimento próprio' },
  { key: 'can_reopen_completed_appointment', label: 'Reabrir atendimento concluído' },
];

const db = supabase as any;

export function CleaningStaffPermissions() {
  const { currentTenant, tenantId } = useAuth();
  const enabled = hasCleaningModulePackage(currentTenant);

  const [professionals, setProfessionals] = useState<CleaningProfessional[]>([]);
  const [visibility, setVisibility] = useState<StaffVisibility[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      db
        .from('professionals')
        .select('id, name, nickname, works_cleaning, has_schedule')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('nickname'),
      db
        .from('cleaning_staff_visibility')
        .select('*')
        .eq('tenant_id', tenantId),
    ])
      .then(([profsRes, visRes]: any[]) => {
        if (cancelled) return;
        if (profsRes.error) {
          console.error('Erro carregando profissionais', profsRes.error);
          toast.error('Não foi possível carregar os profissionais.');
        }
        if (visRes.error) {
          console.error('Erro carregando permissões', visRes.error);
        }
        const filtered: CleaningProfessional[] = ((profsRes.data || []) as CleaningProfessional[]).filter(
          (p) => p.works_cleaning || p.has_schedule,
        );
        setProfessionals(filtered);
        setVisibility((visRes.data || []) as StaffVisibility[]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tenantId]);

  const saveVisibility = async (
    professionalId: string,
    key: keyof Omit<StaffVisibility, 'id' | 'professional_id'>,
    value: boolean,
  ) => {
    if (!tenantId) return;
    const current = visibility.find((item) => item.professional_id === professionalId);
    const payload: StaffVisibility & { tenant_id: string } = {
      tenant_id: tenantId,
      professional_id: professionalId,
      can_view_client_phone: current?.can_view_client_phone ?? true,
      can_view_full_address: current?.can_view_full_address ?? true,
      can_view_access_instructions: current?.can_view_access_instructions ?? true,
      can_view_internal_notes: current?.can_view_internal_notes ?? false,
      can_view_customer_price: current?.can_view_customer_price ?? false,
      can_view_own_commission: current?.can_view_own_commission ?? false,
      can_view_financial_status: current?.can_view_financial_status ?? false,
      can_view_team_schedule: current?.can_view_team_schedule ?? false,
      can_view_client_history: current?.can_view_client_history ?? false,
      can_manage_products_used: current?.can_manage_products_used ?? false,
      can_cancel_own_appointment: current?.can_cancel_own_appointment ?? false,
      can_reopen_completed_appointment: current?.can_reopen_completed_appointment ?? false,
      [key]: value,
    };

    const { error } = await db
      .from('cleaning_staff_visibility')
      .upsert(payload, { onConflict: 'tenant_id,professional_id' });

    if (error) {
      console.error('Erro ao salvar permissão de limpeza', error);
      toast.error('Erro ao salvar permissão.');
      return;
    }

    setVisibility((prev) => {
      const exists = prev.some((item) => item.professional_id === professionalId);
      if (exists) {
        return prev.map((item) => (item.professional_id === professionalId ? payload : item));
      }
      return [...prev, payload];
    });
    toast.success('Permissão atualizada.');
  };

  // Se o tenant não tem o módulo de limpeza, não renderiza nada.
  if (!enabled) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Permissões do módulo Limpeza
        </CardTitle>
        <CardDescription>
          Controle o que cada funcionário visualiza nos agendamentos de limpeza
          (telefone, endereço, valor cobrado, comissão, histórico do cliente etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando permissões...
          </div>
        ) : professionals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum profissional habilitado para o módulo Limpeza. Marque o flag
            “Trabalha com limpeza” no cadastro do profissional para que ele apareça aqui.
          </p>
        ) : (
          professionals.map((professional) => {
            const row = visibility.find((item) => item.professional_id === professional.id);
            return (
              <div key={professional.id} className="rounded-lg border p-4">
                <div className="mb-3">
                  <p className="font-medium">{professional.nickname || professional.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Configure o que este funcionário visualiza no módulo limpeza.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibilityLabels.map((option) => (
                    <label key={option.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={Boolean(row?.[option.key])}
                        onCheckedChange={(checked) =>
                          saveVisibility(professional.id, option.key, Boolean(checked))
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
