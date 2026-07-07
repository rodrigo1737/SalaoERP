import { type ChangeEvent, useMemo, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/context/DataContext';
import { useStock } from '@/context/StockContext';
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
  parseDate,
  parseMoney,
  parseNumber,
  RawRow,
  readWorkbookRows,
} from './importUtils';

type ProductImportRow = {
  sourceRow: number;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  sale_price: number;
  cost_price: number;
  stock_quantity: number;
  unit: string;
  type: 'revenda' | 'uso_interno';
  min_stock: number | null;
  last_purchase_price: number | null;
  last_purchase_date: string | null;
  duplicateKey: string;
};

type ExistingProduct = {
  name: string;
  sku: string | null;
};

const REQUIRED_HEADERS = ['Produto'];

const buildDuplicateKey = (name: string, sku: string | null) =>
  sku ? `sku:${normalizeText(sku)}` : `name:${normalizeText(name)}`;

const parseImportRows = (rows: RawRow[]) => {
  const validRows: ProductImportRow[] = [];
  const invalidRows: number[] = [];
  const internalKeys = new Set<string>();
  let duplicatedInFile = 0;

  rows.forEach((row, index) => {
    const name = asText(getField(row, 'Produto')).replace(/\s+/g, ' ').trim();
    const sku = asText(getField(row, 'Código Interno')).replace(/\s+/g, ' ').trim() || null;

    if (!name) {
      invalidRows.push(index + 2);
      return;
    }

    const duplicateKey = buildDuplicateKey(name, sku);
    if (internalKeys.has(duplicateKey)) {
      duplicatedInFile += 1;
      return;
    }

    internalKeys.add(duplicateKey);

    const category = asText(getField(row, 'Categoria')) || null;
    const brand = asText(getField(row, 'Marca'));
    const line = asText(getField(row, 'Linha'));
    const quantityPerMeasure = parseNumber(getField(row, 'Qtd. Medida'));
    const salePrice = parseMoney(getField(row, 'Valor Venda'));
    const costPrice = parseMoney(getField(row, 'Custo'));
    const stockAbsolute = parseNumber(getField(row, 'Estoque Absoluto'));
    const unit = asText(getField(row, 'Medida')).toLowerCase() || 'unidade';

    validRows.push({
      sourceRow: index + 2,
      name,
      sku,
      category,
      description:
        buildNotes([
          ['Marca', brand],
          ['Linha', line],
          ['Quantidade por medida', quantityPerMeasure ? String(quantityPerMeasure) : ''],
          ['Estoque legado', getField(row, 'Estoque')],
          ['Custo total legado', getField(row, 'Custo Total')],
        ]) || null,
      sale_price: salePrice,
      cost_price: costPrice,
      stock_quantity: stockAbsolute,
      unit,
      type: salePrice > 0 ? 'revenda' : 'uso_interno',
      min_stock: 0,
      last_purchase_price: costPrice > 0 ? costPrice : null,
      last_purchase_date: parseDate(getField(row, 'Última Compra')),
      duplicateKey,
    });
  });

  return { validRows, invalidRows, duplicatedInFile };
};

const buildExistingKeys = (products: ExistingProduct[]) => {
  const keys = new Set<string>();
  products.forEach((product) => keys.add(buildDuplicateKey(product.name, product.sku)));
  return keys;
};

export function ProductStockImportSettings() {
  const { tenantId, canModify, user } = useAuth();
  const { refreshData } = useData();
  const { refreshStock } = useStock();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ProductImportRow[]>([]);
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
      toast.success(`${parsed.validRows.length} produtos prontos para validação.`);
    } catch (error) {
      console.error('Erro ao ler planilha de estoque:', error);
      toast.error('Não foi possível ler a planilha XLSX.');
    } finally {
      setParsing(false);
    }
  };

  const fetchExistingProducts = async () => {
    if (!tenantId) return [];

    const allProducts: ExistingProduct[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('products')
        .select('name, sku')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .range(from, from + IMPORT_PAGE_SIZE - 1);

      if (error) throw error;
      allProducts.push(...(data ?? []));
      if (!data || data.length < IMPORT_PAGE_SIZE) break;
      from += IMPORT_PAGE_SIZE;
    }

    return allProducts;
  };

  const handleImport = async () => {
    if (!tenantId) {
      toast.error('Entre em uma conta de cliente para importar o estoque.');
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
      const existingKeys = buildExistingKeys(await fetchExistingProducts());
      const rowsToImport = rows.filter((row) => !existingKeys.has(row.duplicateKey));
      const skippedExisting = rows.length - rowsToImport.length;

      if (rowsToImport.length === 0) {
        setLastResult(`Nenhum produto importado. ${skippedExisting} já existiam neste cliente.`);
        toast.info('Todos os produtos da planilha já existem neste cliente.');
        return;
      }

      let imported = 0;
      for (const chunk of chunkArray(rowsToImport, DEFAULT_BATCH_SIZE)) {
        const payload = chunk.map((row) => ({
          tenant_id: tenantId,
          name: row.name,
          description: row.description,
          category: row.category,
          sku: row.sku,
          cost_price: row.cost_price,
          sale_price: row.sale_price,
          stock_quantity: row.stock_quantity,
          min_stock: row.min_stock,
          unit: row.unit,
          type: row.type,
          is_active: true,
          last_purchase_price: row.last_purchase_price,
          last_purchase_date: row.last_purchase_date,
        }));

        const { data, error } = await supabase
          .from('products')
          .insert(payload)
          .select('id, stock_quantity, cost_price');

        if (error) throw error;

        const movements = (data ?? [])
          .filter((product) => Number(product.stock_quantity) !== 0)
          .map((product) => ({
            tenant_id: tenantId,
            product_id: product.id,
            movement_type: 'adjustment' as const,
            quantity: Math.abs(Number(product.stock_quantity)),
            previous_stock: 0,
            new_stock: Number(product.stock_quantity),
            unit_price: Number(product.cost_price) || null,
            total_value: Number(product.cost_price) * Math.abs(Number(product.stock_quantity)) || null,
            reason: 'Importação inicial de estoque',
            notes: 'Saldo inicial importado do legado',
            created_by: user?.id ?? null,
          }));

        if (movements.length > 0) {
          const { error: movementError } = await supabase.from('stock_movements').insert(movements);
          if (movementError) throw movementError;
        }

        imported += chunk.length;
        setProgress(Math.round((imported / rowsToImport.length) * 100));
      }

      await Promise.all([refreshData(['products']), refreshStock()]);
      const result = `${imported} produtos importados com sucesso. ${skippedExisting} já existiam neste cliente.`;
      setLastResult(result);
      toast.success(result);
    } catch (error) {
      console.error('Erro ao importar estoque:', error);
      toast.error('Não foi possível concluir a importação do estoque.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importar Estoque
        </CardTitle>
        <CardDescription>
          Cadastra os produtos do estoque e registra o saldo inicial no cliente logado.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="product-stock-import-file">Planilha XLSX</Label>
            <Input
              id="product-stock-import-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={parsing || importing}
            />
            {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
          </div>

          <Button onClick={handleImport} disabled={parsing || importing || rows.length === 0}>
            <Upload className="mr-2 h-4 w-4" />
            {importing ? 'Importando...' : 'Importar estoque'}
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
              <span>{parsing ? 'Lendo planilha...' : 'Importando estoque...'}</span>
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
                  <TableHead>Produto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Venda</TableHead>
                  <TableHead>Custo</TableHead>
                  <TableHead>Estoque</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.length > 0 ? (
                  previewRows.map((row) => (
                    <TableRow key={row.duplicateKey}>
                      <TableCell>{row.sourceRow}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.sku || '-'}</TableCell>
                      <TableCell>{row.category || '-'}</TableCell>
                      <TableCell>R$ {row.sale_price.toFixed(2)}</TableCell>
                      <TableCell>R$ {row.cost_price.toFixed(2)}</TableCell>
                      <TableCell>{row.stock_quantity}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Selecione uma planilha para visualizar os produtos.
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
