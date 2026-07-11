import { useEffect, useMemo, useState } from 'react';
import { Save, Users, Scissors, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  COMMISSION_SETTLEMENT_OPTIONS,
  CommissionSettlementKind,
  normalizeCommissionSettlementKind,
} from '@/lib/commissionSettlement';

interface LinkCell {
  existingId: string | null;
  enabled: boolean;
  commission_rate: string;
  assistant_commission_rate: string;
  duration_minutes: string;
  settlement_kind: CommissionSettlementKind;
}

const cellKey = (serviceId: string, professionalId: string) => `${serviceId}:${professionalId}`;

export function ServiceCommissionMatrix() {
  const { services, professionals } = useData();
  const { tenantId, userRole, hasPermission } = useAuth();
  const { toast } = useToast();

  const canManage = userRole === 'admin' || hasPermission('edit_schedule');

  const activeServices = useMemo(
    () => services.filter((s) => s.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [services],
  );
  const activeProfessionals = useMemo(
    () => professionals.filter((p) => p.is_active).sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name)),
    [professionals],
  );
  const categories = useMemo(
    () => Array.from(new Set(activeServices.map((s) => s.category).filter(Boolean))) as string[],
    [activeServices],
  );

  const [cells, setCells] = useState<Record<string, LinkCell>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState('by-professional');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const defaultCellFor = (professionalId: string): LinkCell => {
    const prof = professionals.find((p) => p.id === professionalId);
    return {
      existingId: null,
      enabled: false,
      commission_rate: '50',
      assistant_commission_rate: '0',
      duration_minutes: '',
      settlement_kind: normalizeCommissionSettlementKind(undefined, prof?.settlement_type),
    };
  };

  const getCell = (serviceId: string, professionalId: string): LinkCell =>
    cells[cellKey(serviceId, professionalId)] ?? defaultCellFor(professionalId);

  const updateCell = (serviceId: string, professionalId: string, patch: Partial<LinkCell>) => {
    setCells((prev) => {
      const key = cellKey(serviceId, professionalId);
      const current = prev[key] ?? defaultCellFor(professionalId);
      return { ...prev, [key]: { ...current, ...patch } };
    });
  };

  useEffect(() => {
    const load = async () => {
      if (!tenantId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('service_professionals')
        .select('*')
        .eq('tenant_id', tenantId);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar as habilitações.' });
        setLoading(false);
        return;
      }
      const next: Record<string, LinkCell> = {};
      (data ?? []).forEach((row: any) => {
        const prof = professionals.find((p) => p.id === row.professional_id);
        next[cellKey(row.service_id, row.professional_id)] = {
          existingId: row.id,
          enabled: true,
          commission_rate: row.commission_rate?.toString() ?? '50',
          assistant_commission_rate: row.assistant_commission_rate?.toString() ?? '0',
          duration_minutes: row.duration_minutes != null ? String(row.duration_minutes) : '',
          settlement_kind: normalizeCommissionSettlementKind(row.settlement_kind, prof?.settlement_type),
        };
      });
      setCells(next);
      setLoading(false);
    };
    void load();
  }, [tenantId, professionals, toast]);

  const filteredServices = useMemo(
    () => (categoryFilter === 'all' ? activeServices : activeServices.filter((s) => s.category === categoryFilter)),
    [activeServices, categoryFilter],
  );

  const handleSave = async () => {
    if (!tenantId || !canManage) return;
    setSaving(true);
    try {
      const toInsert: any[] = [];
      const toUpdate: Array<{ id: string; patch: any }> = [];
      const toDelete: string[] = [];

      for (const [key, cell] of Object.entries(cells)) {
        const [serviceId, professionalId] = key.split(':');
        if (cell.enabled) {
          const payload = {
            service_id: serviceId,
            professional_id: professionalId,
            tenant_id: tenantId,
            commission_rate: parseFloat(cell.commission_rate) || 0,
            assistant_commission_rate: parseFloat(cell.assistant_commission_rate) || 0,
            duration_minutes: cell.duration_minutes ? parseInt(cell.duration_minutes) : null,
            settlement_kind: cell.settlement_kind,
          };
          if (cell.existingId) {
            toUpdate.push({ id: cell.existingId, patch: payload });
          } else {
            toInsert.push(payload);
          }
        } else if (cell.existingId) {
          toDelete.push(cell.existingId);
        }
      }

      if (toDelete.length > 0) {
        const { error } = await supabase.from('service_professionals').delete().in('id', toDelete).eq('tenant_id', tenantId);
        if (error) throw error;
      }
      for (const item of toUpdate) {
        const { error } = await supabase.from('service_professionals').update(item.patch).eq('id', item.id).eq('tenant_id', tenantId);
        if (error) throw error;
      }
      if (toInsert.length > 0) {
        const { error } = await supabase.from('service_professionals').insert(toInsert);
        if (error) throw error;
      }

      toast({ title: 'Habilitações salvas', description: 'Vínculos e comissões atualizados.' });
      // Recarrega para capturar novos ids.
      const { data } = await supabase.from('service_professionals').select('*').eq('tenant_id', tenantId);
      const next: Record<string, LinkCell> = {};
      (data ?? []).forEach((row: any) => {
        const prof = professionals.find((p) => p.id === row.professional_id);
        next[cellKey(row.service_id, row.professional_id)] = {
          existingId: row.id,
          enabled: true,
          commission_rate: row.commission_rate?.toString() ?? '50',
          assistant_commission_rate: row.assistant_commission_rate?.toString() ?? '0',
          duration_minutes: row.duration_minutes != null ? String(row.duration_minutes) : '',
          settlement_kind: normalizeCommissionSettlementKind(row.settlement_kind, prof?.settlement_type),
        };
      });
      setCells(next);
    } catch (error) {
      console.error('Erro ao salvar habilitações:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível salvar as habilitações.' });
    } finally {
      setSaving(false);
    }
  };

  // Ações em lote (aba Por Profissional)
  const bulkSetEnabled = (professionalId: string, enabled: boolean) => {
    filteredServices.forEach((service) => updateCell(service.id, professionalId, { enabled }));
  };
  const bulkApplyCommission = (professionalId: string, rate: string) => {
    filteredServices.forEach((service) => {
      const cell = getCell(service.id, professionalId);
      if (cell.enabled) updateCell(service.id, professionalId, { commission_rate: rate });
    });
  };
  const [bulkRate, setBulkRate] = useState('');

  const renderCellControls = (serviceId: string, professionalId: string) => {
    const cell = getCell(serviceId, professionalId);
    return (
      <>
        <td className="p-2 text-center">
          <Checkbox
            checked={cell.enabled}
            disabled={!canManage}
            onCheckedChange={(checked) => updateCell(serviceId, professionalId, { enabled: Boolean(checked) })}
          />
        </td>
        <td className="p-2">
          <Input
            type="number" min="0" max="100" step="1"
            className="h-8 w-20"
            disabled={!canManage || !cell.enabled}
            value={cell.commission_rate}
            onChange={(e) => updateCell(serviceId, professionalId, { commission_rate: e.target.value })}
          />
        </td>
        <td className="p-2">
          <Input
            type="number" min="0" max="100" step="1"
            className="h-8 w-20"
            disabled={!canManage || !cell.enabled}
            value={cell.assistant_commission_rate}
            onChange={(e) => updateCell(serviceId, professionalId, { assistant_commission_rate: e.target.value })}
          />
        </td>
        <td className="p-2">
          <Input
            type="number" min="0" step="5"
            placeholder="padrão"
            className="h-8 w-24"
            disabled={!canManage || !cell.enabled}
            value={cell.duration_minutes}
            onChange={(e) => updateCell(serviceId, professionalId, { duration_minutes: e.target.value })}
          />
        </td>
        <td className="p-2">
          <Select
            value={cell.settlement_kind}
            disabled={!canManage || !cell.enabled}
            onValueChange={(v) => updateCell(serviceId, professionalId, { settlement_kind: v as CommissionSettlementKind })}
          >
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMMISSION_SETTLEMENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
      </>
    );
  };

  const columnHeader = (
    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
      <th className="p-2 text-left font-medium">{tab === 'by-professional' ? 'Serviço' : 'Profissional'}</th>
      <th className="p-2 text-center font-medium">Habilitado</th>
      <th className="p-2 text-left font-medium">Comissão %</th>
      <th className="p-2 text-left font-medium">Assistente %</th>
      <th className="p-2 text-left font-medium">Duração (min)</th>
      <th className="p-2 text-left font-medium">Liquidação</th>
    </tr>
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">Habilitações e Comissões</h1>
          <p className="text-muted-foreground mt-1">Defina quais serviços cada profissional executa, a comissão e a duração.</p>
        </div>
        <Button onClick={handleSave} disabled={!canManage || saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Alterações
        </Button>
      </div>

      {!canManage && (
        <Card className="p-4 border-0 shadow-sm">
          <p className="text-sm text-muted-foreground">Você não tem permissão para editar habilitações. Visualização apenas.</p>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="by-professional"><Users className="w-4 h-4 mr-1.5" />Por Profissional</TabsTrigger>
          <TabsTrigger value="by-service"><Scissors className="w-4 h-4 mr-1.5" />Por Serviço</TabsTrigger>
        </TabsList>

        <TabsContent value="by-professional" className="mt-4">
          <Card className="p-4 border-0 shadow-md space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Profissional</Label>
                <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {activeProfessionals.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nickname || p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedProfessionalId && canManage && (
              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <Button variant="outline" size="sm" onClick={() => bulkSetEnabled(selectedProfessionalId, true)}>Habilitar todos (filtrados)</Button>
                <Button variant="outline" size="sm" onClick={() => bulkSetEnabled(selectedProfessionalId, false)}>Desabilitar todos</Button>
                <div className="flex items-end gap-1">
                  <div className="space-y-1">
                    <Label className="text-xs">Comissão em lote %</Label>
                    <Input type="number" min="0" max="100" className="h-8 w-24" value={bulkRate} onChange={(e) => setBulkRate(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" disabled={!bulkRate} onClick={() => bulkApplyCommission(selectedProfessionalId, bulkRate)}>Aplicar aos habilitados</Button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : !selectedProfessionalId ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Selecione um profissional para configurar os serviços.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>{columnHeader}</thead>
                  <tbody>
                    {filteredServices.map((service) => (
                      <tr key={service.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-2">
                          <div className="font-medium">{service.name}</div>
                          <div className="text-xs text-muted-foreground">{service.category || 'Sem categoria'} • {service.duration_minutes} min padrão</div>
                        </td>
                        {renderCellControls(service.id, selectedProfessionalId)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="by-service" className="mt-4">
          <Card className="p-4 border-0 shadow-md space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Serviço</Label>
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger className="w-72"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activeServices.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : !selectedServiceId ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Selecione um serviço para configurar os profissionais.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>{columnHeader}</thead>
                  <tbody>
                    {activeProfessionals.map((prof) => (
                      <tr key={prof.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-2">
                          <div className="font-medium">{prof.nickname || prof.name}</div>
                          <div className="text-xs text-muted-foreground">{prof.specialty || ''}</div>
                        </td>
                        {renderCellControls(selectedServiceId, prof.id)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
