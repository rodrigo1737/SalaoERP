export type CommissionSettlementKind = 'commission_payable' | 'transfer_receivable';

export const DEFAULT_COMMISSION_SETTLEMENT_KIND: CommissionSettlementKind = 'commission_payable';

export const COMMISSION_SETTLEMENT_OPTIONS: Array<{
  value: CommissionSettlementKind;
  label: string;
  description: string;
}> = [
  {
    value: 'commission_payable',
    label: 'Comissão a pagar',
    description: 'O salão recebe do cliente e depois paga o profissional.',
  },
  {
    value: 'transfer_receivable',
    label: 'Repasse a receber',
    description: 'O profissional recebe do cliente e depois repassa a parte do salão.',
  },
];

export const normalizeCommissionSettlementKind = (
  value?: string | null,
  fallbackProfessionalSettlementType?: string | null,
): CommissionSettlementKind => {
  if (value === 'transfer_receivable' || value === 'commission_payable') {
    return value;
  }

  if (fallbackProfessionalSettlementType === 'transfer') {
    return 'transfer_receivable';
  }

  return DEFAULT_COMMISSION_SETTLEMENT_KIND;
};

export const isTransferReceivable = (value?: string | null) =>
  normalizeCommissionSettlementKind(value) === 'transfer_receivable';

export const getSettlementDirection = (value?: string | null) =>
  isTransferReceivable(value) ? 'income' : 'expense';

export const getSettlementPendingLabel = (value?: string | null) =>
  isTransferReceivable(value) ? 'A receber' : 'Pendente';

export const getSettlementPaidLabel = (value?: string | null) =>
  isTransferReceivable(value) ? 'Recebido' : 'Pago';

export const getSettlementActionLabel = (value?: string | null) =>
  isTransferReceivable(value) ? 'Receber' : 'Pagar';

export const getSettlementTransactionCategory = (value?: string | null) =>
  isTransferReceivable(value) ? 'Recebimento de Repasse' : 'Pagamento de Comissão';

export const getSettlementDialogTitle = (value?: string | null) =>
  isTransferReceivable(value) ? 'Repasse' : 'Comissão';

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateProfessionalShareAmount = (
  baseValue: number,
  professionalRate: number,
) => roundCurrency((Number(baseValue || 0) * Number(professionalRate || 0)) / 100);

export const calculateSettlementAmount = (
  baseValue: number,
  professionalRate: number,
  settlementKind?: string | null,
) => {
  const normalizedBase = Number(baseValue || 0);
  const professionalShare = calculateProfessionalShareAmount(normalizedBase, professionalRate);

  if (isTransferReceivable(settlementKind)) {
    return roundCurrency(Math.max(0, normalizedBase - professionalShare));
  }

  return professionalShare;
};
