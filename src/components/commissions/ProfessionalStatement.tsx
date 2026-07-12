import { useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, Ticket } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useData, Commission } from '@/context/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { isTransferReceivable } from '@/lib/commissionSettlement';

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

interface ProfessionalRow {
  professionalId: string;
  name: string;
  isTransfer: boolean;
  commissionGenerated: number;
  commissionPending: number;
  commissionPaid: number;
  transferGenerated: number;
  transferPending: number;
  transferReceived: number;
  vouchers: number;
  netToPay: number;      // salão deve ao profissional (comissão pendente − vales)
  netToReceive: number;  // profissional deve ao salão (repasse pendente)
}

export function ProfessionalStatement() {
  const { professionals, commissions } = useData();
  const { userRole, hasPermission, currentProfessional } = useAuth();

  const canViewAll = userRole === 'admin'
    || hasPermission('view_financial_history')
    || hasPermission('reverse_financial_entries')
    || hasPermission('view_commissions');

  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [professionalFilter, setProfessionalFilter] = useState('all');

  const rangeStart = new Date(`${dateFrom}T00:00:00`).getTime();
  const rangeEnd = new Date(`${dateTo}T23:59:59`).getTime();

  const periodCommissions = useMemo(
    () => commissions.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= rangeStart && t <= rangeEnd;
    }),
    [commissions, rangeStart, rangeEnd],
  );

  const rows = useMemo<ProfessionalRow[]>(() => {
    const visibleProfessionals = canViewAll
      ? professionals
      : currentProfessional
        ? professionals.filter((p) => p.id === currentProfessional.id)
        : [];

    const byProfessional = new Map<string, Commission[]>();
    periodCommissions.forEach((c) => {
      const list = byProfessional.get(c.professional_id) ?? [];
      list.push(c);
      byProfessional.set(c.professional_id, list);
    });

    return visibleProfessionals.map((prof) => {
      const items = byProfessional.get(prof.id) ?? [];
      const services = items.filter((c) => c.type === 'service');
      const payable = services.filter((c) => !isTransferReceivable(c.settlement_kind));
      const receivable = services.filter((c) => isTransferReceivable(c.settlement_kind));
      const vouchers = items.filter((c) => c.type === 'voucher');

      const sum = (list: Commission[]) => list.reduce((s, c) => s + Number(c.commission_value), 0);

      const commissionGenerated = sum(payable);
      const commissionPending = sum(payable.filter((c) => c.status === 'pending'));
      const commissionPaid = sum(payable.filter((c) => c.status === 'paid'));
      const transferGenerated = sum(receivable);
      const transferPending = sum(receivable.filter((c) => c.status === 'pending'));
      const transferReceived = sum(receivable.filter((c) => c.status === 'paid'));
      const vouchersTotal = vouchers.reduce((s, c) => s + Math.abs(Number(c.commission_value)), 0);

      return {
        professionalId: prof.id,
        name: prof.nickname || prof.name,
        isTransfer: prof.settlement_type === 'transfer',
        commissionGenerated,
        commissionPending,
        commissionPaid,
        transferGenerated,
        transferPending,
        transferReceived,
        vouchers: vouchersTotal,
        netToPay: commissionPending - vouchersTotal,
        netToReceive: transferPending,
      };
    }).filter((r) =>
      (professionalFilter === 'all' || r.professionalId === professionalFilter)
      && (r.commissionGenerated !== 0 || r.transferGenerated !== 0 || r.vouchers !== 0),
    );
  }, [canViewAll, currentProfessional, periodCommissions, professionals, professionalFilter]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    netToPay: acc.netToPay + Math.max(0, r.netToPay),
    netToReceive: acc.netToReceive + r.netToReceive,
    vouchers: acc.vouchers + r.vouchers,
  }), { netToPay: 0, netToReceive: 0, vouchers: 0 }), [rows]);

  const activeProfessionals = professionals.filter((p) => p.is_active);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">Extrato do Profissional</h1>
        <p className="text-muted-foreground mt-1">Posição consolidada de comissões, repasses e vales por período.</p>
      </div>

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
          {canViewAll && (
            <div className="space-y-1">
              <Label className="text-xs">Profissional</Label>
              <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {activeProfessionals.map((p) => (<SelectItem key={p.id} value={p.id}>{p.nickname || p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-0 shadow-md">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><TrendingDown className="w-4 h-4" /> A pagar aos profissionais</div>
          <p className="text-2xl font-bold text-destructive mt-1">{formatCurrency(totals.netToPay)}</p>
        </Card>
        <Card className="p-4 border-0 shadow-md">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><TrendingUp className="w-4 h-4" /> A receber (repasses)</div>
          <p className="text-2xl font-bold text-success mt-1">{formatCurrency(totals.netToReceive)}</p>
        </Card>
        <Card className="p-4 border-0 shadow-md">
          <div className="flex items-center gap-2 text-muted-foreground text-xs"><Ticket className="w-4 h-4" /> Vales no período</div>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totals.vouchers)}</p>
        </Card>
      </div>

      <Card className="p-4 border-0 shadow-md">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Nenhum lançamento de comissão/repasse no período.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="p-2 text-left font-medium">Profissional</th>
                  <th className="p-2 text-right font-medium">Comissão gerada</th>
                  <th className="p-2 text-right font-medium">Pendente</th>
                  <th className="p-2 text-right font-medium">Paga</th>
                  <th className="p-2 text-right font-medium">Repasse a receber</th>
                  <th className="p-2 text-right font-medium">Recebido</th>
                  <th className="p-2 text-right font-medium">Vales</th>
                  <th className="p-2 text-right font-medium">Saldo líquido</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const net = r.isTransfer ? -r.netToReceive : r.netToPay;
                  return (
                    <tr key={r.professionalId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 font-medium">
                        {r.name}
                        {r.isTransfer && <span className="ml-2 text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5">Repasse</span>}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(r.commissionGenerated)}</td>
                      <td className="p-2 text-right text-warning">{formatCurrency(r.commissionPending)}</td>
                      <td className="p-2 text-right text-success">{formatCurrency(r.commissionPaid)}</td>
                      <td className="p-2 text-right">{formatCurrency(r.transferPending)}</td>
                      <td className="p-2 text-right text-success">{formatCurrency(r.transferReceived)}</td>
                      <td className="p-2 text-right text-destructive">{r.vouchers > 0 ? `- ${formatCurrency(r.vouchers)}` : '—'}</td>
                      <td className={`p-2 text-right font-bold ${net > 0.009 ? 'text-destructive' : net < -0.009 ? 'text-success' : 'text-muted-foreground'}`}>
                        {net > 0.009
                          ? `Pagar ${formatCurrency(net)}`
                          : net < -0.009
                            ? `Receber ${formatCurrency(-net)}`
                            : formatCurrency(0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Saldo líquido = comissão pendente − vales (a pagar ao profissional) ou repasse pendente (a receber do profissional). Comissões pagas e repasses recebidos não entram no saldo.
        </p>
      </Card>
    </div>
  );
}
