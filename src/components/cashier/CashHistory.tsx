import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Calendar,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  FileText,
  ArrowLeft
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useData, CashSession, Transaction } from '@/context/DataContext';

interface CashHistoryProps {
  onBack: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  }).format(value);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const formatTime = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const paymentMethodLabels: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Crédito',
  debit_card: 'Débito',
  pix: 'PIX',
  other: 'Outro',
};

export function CashHistory({ onBack }: CashHistoryProps) {
  const { cashSessions, transactions } = useData();
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Get closed sessions, sorted by date
  const closedSessions = cashSessions
    .filter(s => s.status === 'closed')
    .sort((a, b) => new Date(b.closed_at || b.opened_at).getTime() - new Date(a.closed_at || a.opened_at).getTime());

  const getSessionTransactions = (sessionId: string) => {
    return transactions.filter(t => t.cash_session_id === sessionId);
  };

  const calculateSessionStats = (session: CashSession) => {
    const sessionTrans = getSessionTransactions(session.id);
    
    const totalIncome = sessionTrans
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const totalExpense = sessionTrans
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const byPaymentMethod = sessionTrans.reduce((acc, t) => {
      const method = t.payment_method || 'other';
      if (!acc[method]) {
        acc[method] = { income: 0, expense: 0 };
      }
      if (t.type === 'income') {
        acc[method].income += Number(t.amount);
      } else {
        acc[method].expense += Number(t.amount);
      }
      return acc;
    }, {} as Record<string, { income: number; expense: number }>);
    
    return { totalIncome, totalExpense, byPaymentMethod, transactionCount: sessionTrans.length };
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground">
            Histórico de Caixa
          </h1>
          <p className="text-muted-foreground mt-1">
            {closedSessions.length} fechamentos registrados
          </p>
        </div>
      </div>

      {/* Sessions List */}
      {closedSessions.length === 0 ? (
        <Card className="p-12 border-0 shadow-lg text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h2 className="text-xl font-display font-semibold text-foreground mb-2">
            Nenhum fechamento
          </h2>
          <p className="text-muted-foreground">
            O histórico aparecerá aqui após o primeiro fechamento de caixa
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {closedSessions.map((session, index) => {
            const stats = calculateSessionStats(session);
            const isExpanded = expandedSession === session.id;
            const sessionTransactions = getSessionTransactions(session.id);
            
            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Collapsible open={isExpanded} onOpenChange={() => setExpandedSession(isExpanded ? null : session.id)}>
                  <Card className="border-0 shadow-md overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <div className="p-5 cursor-pointer hover:bg-secondary/30 transition-colors">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-primary-soft flex items-center justify-center">
                              <Calendar className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <p className="font-semibold text-foreground capitalize">
                                {formatDate(session.opened_at)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                <Clock className="w-3 h-3 inline mr-1" />
                                {formatTime(session.opened_at)} - {session.closed_at ? formatTime(session.closed_at) : '--:--'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Entradas</p>
                              <p className="font-bold text-success">{formatCurrency(stats.totalIncome)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Saídas</p>
                              <p className="font-bold text-destructive">{formatCurrency(stats.totalExpense)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Saldo Final</p>
                              <p className="font-bold text-primary">{formatCurrency(session.closing_balance || 0)}</p>
                            </div>
                            
                            {session.difference !== null && session.difference !== 0 ? (
                              <Badge variant="warning" className="flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Dif: {formatCurrency(session.difference)}
                              </Badge>
                            ) : (
                              <Badge variant="success" className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Bateu
                              </Badge>
                            )}
                            
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="px-5 pb-5 border-t border-border pt-4">
                        {/* Summary by Payment Method */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          {Object.entries(stats.byPaymentMethod).map(([method, values]) => (
                            <div key={method} className="p-3 rounded-lg bg-secondary/50">
                              <p className="text-xs text-muted-foreground">{paymentMethodLabels[method] || method}</p>
                              <p className="font-semibold text-foreground">{formatCurrency(values.income - values.expense)}</p>
                            </div>
                          ))}
                        </div>
                        
                        {/* Opening/Closing Info */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="p-3 rounded-lg bg-secondary/50">
                            <p className="text-xs text-muted-foreground">Abertura</p>
                            <p className="font-semibold text-foreground">{formatCurrency(session.opening_balance)}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-secondary/50">
                            <p className="text-xs text-muted-foreground">Esperado (Dinheiro)</p>
                            <p className="font-semibold text-foreground">{formatCurrency(session.expected_balance || 0)}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-secondary/50">
                            <p className="text-xs text-muted-foreground">Contado</p>
                            <p className="font-semibold text-foreground">{formatCurrency(session.closing_balance || 0)}</p>
                          </div>
                        </div>
                        
                        {session.notes && (
                          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 mb-4">
                            <p className="text-sm text-foreground">
                              <FileText className="w-4 h-4 inline mr-2 text-warning" />
                              {session.notes}
                            </p>
                          </div>
                        )}
                        
                        {/* Transaction Details */}
                        <h4 className="text-sm font-semibold text-foreground mb-3">
                          Movimentações ({stats.transactionCount})
                        </h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {sessionTransactions.map((transaction) => (
                            <div
                              key={transaction.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  transaction.type === 'income' ? 'bg-success-soft' : 'bg-destructive-soft'
                                }`}>
                                  {transaction.type === 'income' ? (
                                    <TrendingUp className="w-4 h-4 text-success" />
                                  ) : (
                                    <TrendingDown className="w-4 h-4 text-destructive" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {transaction.description || transaction.category}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatTime(transaction.created_at)} • {paymentMethodLabels[transaction.payment_method || 'other']}
                                  </p>
                                </div>
                              </div>
                              <p className={`font-bold ${
                                transaction.type === 'income' ? 'text-success' : 'text-destructive'
                              }`}>
                                {transaction.type === 'income' ? '+' : '-'}
                                {formatCurrency(Number(transaction.amount))}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
