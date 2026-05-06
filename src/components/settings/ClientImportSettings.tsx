import { type ChangeEvent, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
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

type RawRow = Record<string, unknown>;

type ClientImportRow = {
  sourceRow: number;
  name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  created_at?: string;
  notes: string | null;
  duplicateKeys: string[];
};

type ExistingClient = {
  name: string;
  phone: string | null;
  email: string | null;
};

const REQUIRED_HEADERS = ['Cliente'];
const IMPORT_BATCH_SIZE = 300;

const normalizeHeader = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value) ?? '';
  return String(value).trim();
};

const onlyDigits = (value: unknown) => asText(value).replace(/\D/g, '');

const formatDate = (date: Date | null) => {
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return formatDate(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return formatDate(new Date(excelEpoch + value * 86400000));
  }

  const text = asText(value);
  if (!text) return null;

  const brazilianDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (brazilianDate) {
    const [, day, month, rawYear] = brazilianDate;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return formatDate(new Date(Number(year), Number(month) - 1, Number(day)));
  }

  return formatDate(new Date(text));
};

const getField = (row: RawRow, header: string) => {
  const normalizedTarget = normalizeHeader(header);
  const key = Object.keys(row).find((item) => normalizeHeader(item) === normalizedTarget);
  return key ? row[key] : '';
};

const buildDuplicateKeys = (row: Pick<ClientImportRow, 'name' | 'phone' | 'email'>) => {
  const keys: string[] = [];
  if (row.email) keys.push(`email:${row.email}`);
  if (row.phone) keys.push(`name_phone:${normalizeText(row.name)}:${row.phone}`);
  if (!row.email && !row.phone) keys.push(`name:${normalizeText(row.name)}`);
  return keys;
};

const buildNotes = (row: RawRow) => {
  const noteParts: string[] = ['Importado via planilha XLSX.'];
  const sourceFields = [
    ['Código antigo', 'Código'],
    ['Sexo', 'Sexo'],
    ['Como conheceu', 'Como Conheceu'],
    ['CPF', 'CPF'],
    ['RG', 'RG'],
    ['Telefone original', 'Telefone'],
    ['Celular original', 'Celular'],
    ['CEP', 'CEP'],
    ['Endereço', 'Endereço'],
    ['Número', 'Número'],
    ['Bairro', 'Bairro'],
    ['Cidade', 'Cidade'],
    ['Estado', 'Estado'],
    ['Complemento', 'Complemento'],
    ['Profissão', 'Profissão'],
    ['Cadastro original', 'Cadastrado'],
    ['Observação original', 'Obs'],
  ];

  sourceFields.forEach(([label, header]) => {
    const value = asText(getField(row, header));
    if (value) noteParts.push(`${label}: ${value}`);
  });

  return noteParts.join('\n');
};

const parseImportRows = (rows: RawRow[]) => {
  const validRows: ClientImportRow[] = [];
  const invalidRows: number[] = [];
  const internalKeys = new Set<string>();
  let duplicatedInFile = 0;

  rows.forEach((row, index) => {
    const name = asText(getField(row, 'Cliente')).replace(/\s+/g, ' ').trim();
    if (!name) {
      invalidRows.push(index + 2);
      return;
    }

    const mobile = onlyDigits(getField(row, 'Celular'));
    const phone = mobile || onlyDigits(getField(row, 'Telefone')) || null;
    const email = asText(getField(row, 'E-mail')).toLowerCase() || null;
    const birthDate = parseDate(getField(row, 'Aniversário'));
    const createdAtDate = parseDate(getField(row, 'Cadastrado'));
    const importRow: ClientImportRow = {
      sourceRow: index + 2,
      name,
      phone,
      email,
      birth_date: birthDate,
      created_at: createdAtDate ? `${createdAtDate}T12:00:00-03:00` : undefined,
      notes: buildNotes(row),
      duplicateKeys: [],
    };

    importRow.duplicateKeys = buildDuplicateKeys(importRow);
    const isDuplicateInFile = importRow.duplicateKeys.some((key) => internalKeys.has(key));
    if (isDuplicateInFile) {
      duplicatedInFile += 1;
      return;
    }

    importRow.duplicateKeys.forEach((key) => internalKeys.add(key));
    validRows.push(importRow);
  });

  return { validRows, invalidRows, duplicatedInFile };
};

const buildExistingKeys = (clients: ExistingClient[]) => {
  const keys = new Set<string>();
  clients.forEach((client) => {
    buildDuplicateKeys({
      name: client.name,
      phone: client.phone?.replace(/\D/g, '') || null,
      email: client.email?.toLowerCase() || null,
    }).forEach((key) => keys.add(key));
  });
  return keys;
};

export function ClientImportSettings() {
  const { tenantId, currentTenant, canModify } = useAuth();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ClientImportRow[]>([]);
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
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: '' });
      const headers = rawRows[0] ? Object.keys(rawRows[0]) : [];
      const missingHeaders = REQUIRED_HEADERS.filter(
        (header) => !headers.some((item) => normalizeHeader(item) === normalizeHeader(header)),
      );

      if (missingHeaders.length > 0) {
        toast.error(`A planilha precisa conter a coluna: ${missingHeaders.join(', ')}`);
        return;
      }

      const parsed = parseImportRows(rawRows);
      setRows(parsed.validRows);
      setInvalidCount(parsed.invalidRows.length);
      setDuplicatedInFile(parsed.duplicatedInFile);
      toast.success(`${parsed.validRows.length} clientes prontos para validação.`);
    } catch (error) {
      console.error('Erro ao ler planilha:', error);
      toast.error('Não foi possível ler a planilha XLSX.');
    } finally {
      setParsing(false);
    }
  };

  const fetchExistingClients = async () => {
    if (!tenantId) return [];

    const allClients: ExistingClient[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('clients')
        .select('name, phone, email')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .range(from, from + pageSize - 1);

      if (error) throw error;
      allClients.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    return allClients;
  };

  const handleImport = async () => {
    if (!tenantId) {
      toast.error('Entre em uma conta de cliente para importar os cadastros.');
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
      const existingKeys = buildExistingKeys(await fetchExistingClients());
      const rowsToImport = rows.filter((row) => !row.duplicateKeys.some((key) => existingKeys.has(key)));
      const skippedExisting = rows.length - rowsToImport.length;

      if (rowsToImport.length === 0) {
        setLastResult(`Nenhum cliente importado. ${skippedExisting} já existiam neste cliente.`);
        toast.info('Todos os clientes da planilha já existem neste cliente.');
        return;
      }

      let imported = 0;
      for (let index = 0; index < rowsToImport.length; index += IMPORT_BATCH_SIZE) {
        const batch = rowsToImport.slice(index, index + IMPORT_BATCH_SIZE).map((row) => ({
          tenant_id: tenantId,
          name: row.name,
          phone: row.phone,
          email: row.email,
          birth_date: row.birth_date,
          created_at: row.created_at,
          notes: row.notes,
        }));

        const { error } = await supabase.from('clients').insert(batch);
        if (error) throw error;

        imported += batch.length;
        setProgress(Math.round((imported / rowsToImport.length) * 100));
      }

      const result = `${imported} clientes importados para ${currentTenant?.name ?? 'o cliente logado'}. ${skippedExisting} já existiam e foram ignorados.`;
      setLastResult(result);
      toast.success(result);
    } catch (error) {
      console.error('Erro ao importar clientes:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao importar clientes.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importação de Clientes
        </CardTitle>
        <CardDescription>
          Importe uma planilha XLSX para o cliente logado: {currentTenant?.name ?? 'não identificado'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="client-xlsx">Planilha XLSX</Label>
            <Input
              id="client-xlsx"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={parsing || importing}
            />
          </div>
          <Button
            onClick={handleImport}
            disabled={parsing || importing || rows.length === 0 || !tenantId || !canModify()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {importing ? 'Importando...' : 'Importar clientes'}
          </Button>
        </div>

        <div className="grid gap-3 text-sm md:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Arquivo</p>
            <p className="font-medium">{fileName || 'Nenhum selecionado'}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Prontos</p>
            <p className="font-medium">{rows.length}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Duplicados no arquivo</p>
            <p className="font-medium">{duplicatedInFile}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Linhas sem nome</p>
            <p className="font-medium">{invalidCount}</p>
          </div>
        </div>

        {importing && <Progress value={progress} />}

        {lastResult && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
            {lastResult}
          </div>
        )}

        {previewRows.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Linha</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Aniversário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => (
                  <TableRow key={`${row.sourceRow}-${row.name}`}>
                    <TableCell>{row.sourceRow}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.phone ?? '-'}</TableCell>
                    <TableCell>{row.email ?? '-'}</TableCell>
                    <TableCell>{row.birth_date ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
