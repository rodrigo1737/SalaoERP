import { useMemo, useState } from 'react';
import { RefreshCw, PlayCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useData, CommissionReprocessPreview } from '@/context/DataContext';
import { useAuth } from '@/contexts/AuthContext';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const firstDayOfMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function CommissionReprocessing() {
  const { professionals, previewReprocessPendingCommissions, reprocessPendingCommissions } = useData();
  const { userRole, hasPermission } = useAuth();
  const { toast } = useToast();

  const canReprocess = userRole === 'admin' || hasPermission('reverse_financial_entries');

  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [professionalId, setProfessionalId] = useState<string>('all');
  const [includePaid, setIncludePaid] = useState(false);
  const [preview, setPreview] = useState<CommissionReprocessPreview | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);

  const activeProfessionals = useMemo(
    () => professionals.filter((p) => p.is_active).sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name)),
    [professionals],
  );

  const buildFilters = () => ({
    dateFrom: new Date(`${dateFrom}T00:00:00`).toISOString(),
    dateTo: new Date(`${dateTo}T23:59:59`).toISOString(),
    professionalId: professionalId === 'all' ? null : professionalId,
    includePaid,
  });

  const handleSimulate = async () => {
    setSimulating(true);
    setPreview(null);
    try {
      const result = await previewReprocessPendingCommissions(buildFilters());
      if (result) setPreview(result);
    } finally {
      setSimulating(false);
    }
  };

  const handleApply = async () => {
    if (!preview || preview.affectedCount === 0) return;
    setApplying(true);
    try {
      const result = await reprocessPendingCommissions(buildFilters());
      if (result) {
        toast({
          title: 'Reprocessamento concluído',
          description: `${result.recalculatedCount} comissão(ões) recalculada(s), ${result.skippedCount} ignorada(s).`,
        });
        // Re-simula para refletir o novo estado (diferenças zeradas).
        await handleSimulate();
      }
    } finally {
      setApplying(false);
    }
  };

  const statusBadge = (status: 'ok' | 'no_rule' | 'no_service') => {
    if (status === 'no_rule') return <Badge variant="destructive" className="text-[10px]">Sem regra</Badge>;
    if (status === 'no_service') return <Badge variant="destructive" className="text-[10px]">Sem serviço</Badge>;
    return null;
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">Reprocessamento de Comissões</h1>
        <p className="text-muted-foreground mt-1">Recalcula comissões <strong>pendentes</strong> de um período conforme as regras atuais. Simule antes de aplicar.</p>
      </div>

      {!canReprocess ? (
        <Card className="p-8 border-0 shadow-lg">
          <p className="text-muted-foreground">Você não tem permissão para reprocessar comissões. Necessário perfil administrativo ou financeiro avançado.</p>
        </Card>
      ) : (
        <>
          <Card className="p-4 border-0 shadow-md">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">De</Label>
                <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Até</Label>
                <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Profissional</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {activeProfessionals.map((p) => (<SelectItem key={p.id} value={p.id}>{p.nickname || p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSimulate} disabled={simulating}>
                {simulating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Simular
              </Button>
            </div>
            <label className="mt-3 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={includePaid}
                onChange={(e) => { setIncludePaid(e.target.checked); setPreview(null); }}
              />
              <span className="text-sm">
                <span className="font-medium">Incluir comissões já pagas</span>
                <span className="block text-xs text-muted-foreground">
                  As pagas geram um <strong>ajuste da diferença no caixa</strong> (requer caixa aberto). Sem marcar, só recalcula pendentes.
                </span>
              </span>
            </label>
          </Card>

          {preview && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <Card className="p-4 border-0 shadow-md">
                  <p className="text-xs text-muted-foreground">Registros</p>
                  <p className="text-2xl font-bold text-foreground">{preview.items.length}</p>
                </Card>
                <Card className="p-4 border-0 shadow-md">
                  <p className="text-xs text-muted-foreground">Afetados (com diferença)</p>
                  <p className="text-2xl font-bold text-primary">{preview.affectedCount}</p>
                </Card>
                <Card className="p-4 border-0 shadow-md">
                  <p className="text-xs text-muted-foreground">Sem regra / serviço</p>
                  <p className="text-2xl font-bold text-destructive">{preview.skippedCount}</p>
                </Card>
                <Card className="p-4 border-0 shadow-md">
                  <p className="text-xs text-muted-foreground">Diferença total</p>
                  <p className={`text-2xl font-bold ${preview.totalDifference >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {preview.totalDifference >= 0 ? '+' : ''}{formatCurrency(preview.totalDifference)}
                  </p>
                </Card>
              </div>

              <Card className="p-4 border-0 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-display font-semibold">Prévia do recálculo</h2>
                  <Button
                    onClick={handleApply}
                    disabled={applying || preview.affectedCount === 0}
                    variant="default"
                  >
                    {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                    Aplicar ({preview.affectedCount})
                  </Button>
                </div>

                {preview.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma comissão pendente no período/filtro.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <th className="p-2 text-left font-medium">Profissional</th>
                          <th className="p-2 text-left font-medium">Serviço</th>
                          <th className="p-2 text-right font-medium">Base</th>
                          <th className="p-2 text-right font-medium">Atual</th>
                          <th className="p-2 text-right font-medium">Recalculado</th>
                          <th className="p-2 text-right font-medium">Diferença</th>
                          <th className="p-2 text-center font-medium">Risco</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.items.map((item) => (
                          <tr key={item.commissionId} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-2">
                              {item.professionalName}
                              {item.alreadyPaid && <span className="ml-2 text-[10px] rounded bg-success-soft text-success px-1.5 py-0.5">Paga → ajuste</span>}
                            </td>
                            <td className="p-2">{item.serviceName}</td>
                            <td className="p-2 text-right">{formatCurrency(item.baseValue)}</td>
                            <td className="p-2 text-right">{item.currentRate}% • {formatCurrency(item.currentValue)}</td>
                            <td className="p-2 text-right">
                              {item.nextValue != null ? `${item.nextRate}% • ${formatCurrency(item.nextValue)}` : '—'}
                            </td>
                            <td className={`p-2 text-right font-medium ${item.difference > 0.009 ? 'text-success' : item.difference < -0.009 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {item.status === 'ok' ? `${item.difference >= 0 ? '+' : ''}${formatCurrency(item.difference)}` : '—'}
                            </td>
                            <td className="p-2 text-center">{statusBadge(item.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {preview.skippedCount > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft/50 p-3 text-sm text-warning">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{preview.skippedCount} comissão(ões) sem regra ou serviço cadastrado não serão recalculadas. Configure o vínculo em "Habilitações e Comissões".</span>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
