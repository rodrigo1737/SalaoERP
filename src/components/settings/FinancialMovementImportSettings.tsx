import { type ChangeEvent, useMemo, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/context/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  asText,
  buildNotes,
  chunkArray,
  DEFAULT_BATCH_SIZE,
  getField,
  hasRequiredHeaders,
  IMPORT_PAGE_SIZE,
  normalizeText,
  parseDateTime,
  parseMoney,
  RawRow,
  readWorkbookRows,
} from './importUtils';

type FinancialImportRow = {
  sourceRow: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  payment_method: 'cash' | 'credit_card' | 'debit_card' | 'pix' | 'other';
  created_at: string;
  duplicateKey: string;
};

type ExistingTransaction = {
  type: string;
  category: string;
  description: string | null;
  amount: number;
  created_at: string;
};

const REQUIRED_HEADERS = ['Descrição', 'Valor'];

const mapPaymentMethod = (value: string): 'cash' | 'credit_card' | 'debit_card' | 'pix' | 'other' => {
  const normalized = normalizeText(value);

  if (normalized.includes('pix')) return 'pix';
  if (normalized.includes('credito')) return 'credit_card';
  if (normalized.includes('debito')) return 'debit_card';
  if (normalized.includes('dinheiro')) return 'cash';
  return 'other';
};

const buildDuplicateKey = (row: {
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  created_at: string;
}) =>
  [
    row.type,
    normalizeText(row.category),
    normalizeText(row.description),
    row.amount.toFixed(2),
    row.created_at.slice(0, 16),
  ].join(':');

const parseImportRows = (rows: RawRow[]) => {
  const validRows: FinancialImportRow[] = [];
  const invalidRows: number[] = [];
  const internalKeys = new Set<string>();
  let duplicatedInFile = 0;

  rows.forEach((row, index) => {
    const rawValue = parseMoney(getField(row, 'Valor'));
    const amount = Math.abs(rawValue);
    const descriptionBase = asText(getField(row, 'Descrição'));
    const createdAt =
      parseDateTime(getField(row, 'Data de pagamento')) ||
      parseDateTime(getField(row, 'Data de competência')) ||
      null;

    if (!descriptionBase || !amount || !createdAt) {
      invalidRows.push(index + 2);
      return;
    }

    const type = rawValue < 0 ? 'expense' : 'income';
    const category =
      asText(getField(row, 'Categoria')) ||
      asText(getField(row, 'Tipo de lançamento')) ||
      (type === 'income' ? 'Receita importada' : 'Despesa importada');

    const details = buildNotes([
      ['Conta', getField(row, 'Conta')],
      ['Recebido de/Pago a', getField(row, 'Recebido de/Pago a')],
      ['Forma de pagamento legada', getField(row, 'Forma pagamento')],
      ['Número documento', getField(row, 'Número documento')],
      ['Detalhes', getField(row, 'Detalhes')],
      ['Pago', getField(row, 'Pago')],
    ]);

    const description = details ? `${descriptionBase}\n${details}` : descriptionBase;
    const parsedRow = {
      sourceRow: index + 2,
      type,
      category,
      description,
      amount,
      payment_method: mapPaymentMethod(asText(getField(row, 'Forma pagamento'))),
      created_at: createdAt,
      duplicateKey: '',
    } satisfies Omit<FinancialImportRow, 'duplicateKey'>;

    const duplicateKey = buildDuplicateKey(parsedRow);
    if (internalKeys.has(duplicateKey)) {
      duplicatedInFile += 1;
      return;
    }

    internalKeys.add(duplicateKey);
    validRows.push({ ...parsedRow, duplicateKey });
  });

  return { validRows, invalidRows, duplicatedInFile };
};

const buildExistingKeys = (transactions: ExistingTransaction[]) => {
  const keys = new Set<string>();
  transactions.forEach((transaction) =>
    keys.add(
      buildDuplicateKey({
        type: transaction.type === 'expense' ? 'expense' : 'income',
        category: transaction.category,
        description: transaction.description || '',
        amount: Number(transaction.amount),
        created_at: transaction.created_at,
      }),
    ),
  );
  return keys;
};

export function FinancialMovementImportSettings() {
  const { tenantId, canModify, user } = useAuth();
  const { refreshData } = useData();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<FinancialImportRow[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [duplicatedInFile, setDuplicatedInFile] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setLastResult(null);
    setRows([]);
    setInvalidCount(0);
    setDuplicatedInFile(0);

    if (!file) {
      setFileName('');
      return;
    }

    setFileName(file.name);
    setParsing(true);

    try {
      const { rawRows, headers } = await readWorkbookRows(file);
      const missingHeaders = hasRequiredHeaders(headers, REQUIRED_HEADERS);

      if (missingHeaders.length > 0) {
        toast.error(`A planilha precisa conter as colunas: ${missingHeaders.join(', ')}`);
        return;
      }

      const parsed = parseImportRows(rawRows);
      setRows(parsed.validRows);
      setInvalidCount(parsed.invalidRows.length);
      setDuplicatedInFile(parsed.duplicatedInFile);
      toast.success(`${parsed.validRows.length} movimentos financeiros prontos para validação.`);
    } catch (error) {
      console.error('Erro ao ler planilha financeira:', error);
      toast.error('Não foi possível ler a planilha XLSX.');
    } finally {
      setParsing(false);
    }
  };

  const fetchExistingTransactions = async () => {
    if (!tenantId) return [];

    const allTransactions: ExistingTransaction[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('transactions')
        .select('type, category, description, amount, created_at')
        .eq('tenant_id', tenantId)
        .range(from, from + IMPORT_PAGE_SIZE - 1);

      if (error) throw error;
      allTransactions.push(...(data ?? []));
      if (!data || data.length < IMPORT_PAGE_SIZE) break;
      from += IMPORT_PAGE_SIZE;
    }

    return allTransactions;
  };

  const handleImport = async () => {
    if (!tenantId) {
      toast.error('Entre em uma conta de cliente para importar as movimentações.');
      return;
    }

    if (!canModify()) {
      toast.error('Este cliente não permite alterações no momento.');
      return;
    }

    if (rows.length === 0) {
      toast.error('Selecione uma planilha XLSX válida antes de importar.');
      return;
    }

    setImporting(true);
    setProgress(0);
    setLastResult(null);

    try {
      const existingKeys = buildExistingKeys(await fetchExistingTransactions());
      const rowsToImport = rows.filter((row) => !existingKeys.has(row.duplicateKey));
      const skippedExisting = rows.length - rowsToImport.length;

      if (rowsToImport.length === 0) {
        setLastResult(`Nenhum movimento importado. ${skippedExisting} já existiam neste cliente.`);
        toast.info('Todas as movimentações da planilha já existem neste cliente.');
        return;
      }

      let imported = 0;
      for (const chunk of chunkArray(rowsToImport, DEFAULT_BATCH_SIZE)) {
        const payload = chunk.map((row) => ({
          tenant_id: tenantId,
          type: row.type,
          category: row.category,
          description: row.description,
          amount: row.amount,
          payment_method: row.payment_method,
          created_at: row.created_at,
          created_by: user?.id ?? null,
          cash_session_id: null,
          reference_id: null,
          reference_type: 'legacy_import',
        }));

        const { error } = await supabase.from('transactions').insert(payload);
        if (error) throw error;

        imported += chunk.length;
        setProgress(Math.round((imported / rowsToImport.length) * 100));
      }

      await refreshData(['transactions']);
      const result = `${imported} movimentos financeiros importados com sucesso. ${skippedExisting} já existiam neste cliente.`;
      setLastResult(result);
      toast.success(result);
    } catch (error) {
      console.error('Erro ao importar movimentações financeiras:', error);
      toast.error('Não foi possível concluir a importação das movimentações.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importar Movimentações Financeiras
        </CardTitle>
        <CardDescription>
          Importa receitas e despesas históricas sem exigir caixa aberto, sempre dentro do cliente logado.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="financial-import-file">Planilha XLSX</Label>
            <Input
              id="financial-import-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={parsing || importing}
            />
            {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
          </div>

          <Button onClick={handleImport} disabled={parsing || importing || rows.length === 0}>
            <Upload className="mr-2 h-4 w-4" />
            {importing ? 'Importando...' : 'Importar movimentações'}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Linhas válidas</p>
              <p className="text-2xl font-semibold">{rows.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Linhas inválidas</p>
              <p className="text-2xl font-semibold">{invalidCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Duplicados na planilha</p>
              <p className="text-2xl font-semibold">{duplicatedInFile}</p>
            </CardContent>
          </Card>
        </div>

        {(parsing || importing) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{parsing ? 'Lendo planilha...' : 'Importando movimentações...'}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={parsing ? undefined : progress} />
          </div>
        )}

        {lastResult ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground">
            {lastResult}
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Pré-visualização</h3>
            <p className="text-xs text-muted-foreground">
              Mostrando as 10 primeiras linhas válidas detectadas na planilha.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Linha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.length > 0 ? (
                  previewRows.map((row) => (
                    <TableRow key={row.duplicateKey}>
                      <TableCell>{row.sourceRow}</TableCell>
                      <TableCell>{row.type === 'income' ? 'Receita' : 'Despesa'}</TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell className="max-w-[380px] whitespace-pre-wrap">{row.description}</TableCell>
                      <TableCell>R$ {row.amount.toFixed(2)}</TableCell>
                      <TableCell>{new Date(row.created_at).toLocaleString('pt-BR')}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Selecione uma planilha para visualizar as movimentações.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
