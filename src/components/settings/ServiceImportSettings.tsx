import { type ChangeEvent, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
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

type RawRow = Record<string, unknown>;

type ServiceImportRow = {
  sourceRow: number;
  name: string;
  description: string | null;
  category: string | null;
  default_price: number;
  duplicateKey: string;
};

type ExistingService = {
  name: string;
  category: string | null;
};

const REQUIRED_HEADERS = ['Serviço', 'Valor'];
const IMPORT_BATCH_SIZE = 300;
const PAGE_SIZE = 1000;

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

const asText = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const getField = (row: RawRow, header: string) => {
  const normalizedTarget = normalizeHeader(header);
  const key = Object.keys(row).find((item) => normalizeHeader(item) === normalizedTarget);
  return key ? row[key] : '';
};

const parseMoney = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const text = asText(value);
  if (!text) return 0;

  const normalized = text
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
};

const buildDuplicateKey = (name: string, category: string | null) =>
  `${normalizeText(name)}:${normalizeText(category || 'Outros')}`;

const parseImportRows = (rows: RawRow[]) => {
  const validRows: ServiceImportRow[] = [];
  const invalidRows: number[] = [];
  const internalKeys = new Set<string>();
  let duplicatedInFile = 0;

  rows.forEach((row, index) => {
    const name = asText(getField(row, 'Serviço')).replace(/\s+/g, ' ').trim();
    const price = parseMoney(getField(row, 'Valor'));

    if (!name) {
      invalidRows.push(index + 2);
      return;
    }

    const description = asText(getField(row, 'Descrição')) || null;
    const category = asText(getField(row, 'Categoria')) || 'Outros';
    const duplicateKey = buildDuplicateKey(name, category);

    if (internalKeys.has(duplicateKey)) {
      duplicatedInFile += 1;
      return;
    }

    internalKeys.add(duplicateKey);
    validRows.push({
      sourceRow: index + 2,
      name,
      description,
      category,
      default_price: price,
      duplicateKey,
    });
  });

  return { validRows, invalidRows, duplicatedInFile };
};

const buildExistingKeys = (services: ExistingService[]) => {
  const keys = new Set<string>();
  services.forEach((service) => keys.add(buildDuplicateKey(service.name, service.category)));
  return keys;
};

export function ServiceImportSettings() {
  const { tenantId, currentTenant, canModify } = useAuth();
  const { refreshData } = useData();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ServiceImportRow[]>([]);
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
        toast.error(`A planilha precisa conter as colunas: ${missingHeaders.join(', ')}`);
        return;
      }

      const parsed = parseImportRows(rawRows);
      setRows(parsed.validRows);
      setInvalidCount(parsed.invalidRows.length);
      setDuplicatedInFile(parsed.duplicatedInFile);
      toast.success(`${parsed.validRows.length} serviços prontos para validação.`);
    } catch (error) {
      console.error('Erro ao ler planilha de serviços:', error);
      toast.error('Não foi possível ler a planilha XLSX.');
    } finally {
      setParsing(false);
    }
  };

  const fetchExistingServices = async () => {
    if (!tenantId) return [];

    const allServices: ExistingService[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('services')
        .select('name, category')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      allServices.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return allServices;
  };

  const handleImport = async () => {
    if (!tenantId) {
      toast.error('Entre em uma conta de cliente para importar os serviços.');
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
      const existingKeys = buildExistingKeys(await fetchExistingServices());
      const rowsToImport = rows.filter((row) => !existingKeys.has(row.duplicateKey));
      const skippedExisting = rows.length - rowsToImport.length;

      if (rowsToImport.length === 0) {
        setLastResult(`Nenhum serviço importado. ${skippedExisting} já existiam neste cliente.`);
        toast.info('Todos os serviços da planilha já existem neste cliente.');
        return;
      }

      let imported = 0;
      for (let index = 0; index < rowsToImport.length; index += IMPORT_BATCH_SIZE) {
        const batch = rowsToImport.slice(index, index + IMPORT_BATCH_SIZE).map((row) => ({
          tenant_id: tenantId,
          name: row.name,
          description: row.description,
          category: row.category,
          default_price: row.default_price,
          duration_minutes: 60,
          break_time_minutes: 0,
          allow_online_booking: false,
          price_type: 'fixed' as const,
          cost_price: 0,
          is_active: true,
        }));

        const { error } = await supabase.from('services').insert(batch);
        if (error) throw error;

        imported += batch.length;
        setProgress(Math.round((imported / rowsToImport.length) * 100));
      }

      await refreshData(['services']);
      const result = `${imported} serviços importados para ${currentTenant?.name ?? 'o cliente logado'}. ${skippedExisting} já existiam e foram ignorados.`;
      setLastResult(result);
      toast.success(result);
    } catch (error) {
      console.error('Erro ao importar serviços:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao importar serviços.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importação de Serviços
        </CardTitle>
        <CardDescription>
          Importe uma planilha XLSX para o cliente logado: {currentTenant?.name ?? 'não identificado'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="service-xlsx">Planilha XLSX</Label>
            <Input
              id="service-xlsx"
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
            {importing ? 'Importando...' : 'Importar serviços'}
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
            <p className="text-muted-foreground">Linhas sem serviço</p>
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
                  <TableHead>Serviço</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => (
                  <TableRow key={`${row.sourceRow}-${row.name}`}>
                    <TableCell>{row.sourceRow}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.category ?? '-'}</TableCell>
                    <TableCell>
                      {row.default_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </TableCell>
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
