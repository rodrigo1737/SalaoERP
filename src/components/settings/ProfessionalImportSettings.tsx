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
  DEFAULT_BATCH_SIZE,
  getField,
  hasRequiredHeaders,
  IMPORT_PAGE_SIZE,
  normalizeText,
  RawRow,
  readWorkbookRows,
} from './importUtils';

type ProfessionalImportRow = {
  sourceRow: number;
  name: string;
  nickname: string;
  type: 'owner' | 'employee' | 'freelancer';
  specialty: string | null;
  has_schedule: boolean;
  schedule_start_time: string | null;
  schedule_end_time: string | null;
  duplicateKey: string;
  notes: string | null;
  created_at: string | null;
};

type ExistingProfessional = {
  name: string;
  nickname: string;
};

const REQUIRED_HEADERS = ['Nome'];
const DEFAULT_SCHEDULE_COLOR = '#EFF6FF';

const parseScheduleTime = (value: unknown) => {
  const text = asText(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2})[:h](\d{2})/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const mapProfessionalType = (cargo: string, accessGroup: string) => {
  const normalizedCargo = normalizeText(cargo);
  const normalizedGroup = normalizeText(accessGroup);

  if (
    normalizedCargo.includes('gestor') ||
    normalizedGroup.includes('administrador') ||
    normalizedGroup.includes('propriet')
  ) {
    return 'owner';
  }

  return 'employee';
};

const mapSpecialty = (cargo: string) => {
  const normalized = normalizeText(cargo);

  if (normalized.includes('cabeleire')) return 'cabeleireira';
  if (normalized.includes('barbeir')) return 'barbeiro';
  if (normalized.includes('manicure')) return 'manicure';
  if (normalized.includes('pedicure')) return 'pedicure';
  if (normalized.includes('estetic')) return 'esteticista';
  if (normalized.includes('maqui')) return 'maquiadora';
  if (normalized.includes('sobrancel')) return 'designer_sobrancelhas';
  if (normalized.includes('massag')) return 'massagista';
  if (normalized.includes('depila')) return 'depiladora';
  if (normalized.includes('podolog')) return 'podologa';
  if (normalized.includes('recep')) return 'outro';

  return 'outro';
};

const hasSchedule = (cargo: string, accessGroup: string) => {
  const normalizedCargo = normalizeText(cargo);
  const normalizedGroup = normalizeText(accessGroup);

  return !(
    normalizedCargo.includes('recep') ||
    normalizedGroup.includes('recep')
  );
};

const buildDuplicateKey = (name: string, nickname: string) =>
  `${normalizeText(name)}:${normalizeText(nickname || name)}`;

const parseImportRows = (rows: RawRow[]) => {
  const validRows: ProfessionalImportRow[] = [];
  const invalidRows: number[] = [];
  const internalKeys = new Set<string>();
  let duplicatedInFile = 0;

  rows.forEach((row, index) => {
    const name = asText(getField(row, 'Nome')).replace(/\s+/g, ' ').trim();
    const nickname = asText(getField(row, 'Apelido')).replace(/\s+/g, ' ').trim() || name;
    const cargo = asText(getField(row, 'Cargo'));
    const accessGroup = asText(getField(row, 'Grupo de acesso'));
    const scheduleStart = parseScheduleTime(getField(row, ['Horário início', 'Horario inicio', 'Início', 'Inicio', 'Hora início', 'Hora inicio']));
    const scheduleEnd = parseScheduleTime(getField(row, ['Horário fim', 'Horario fim', 'Fim', 'Hora fim', 'Até', 'Ate']));

    if (!name) {
      invalidRows.push(index + 2);
      return;
    }

    const duplicateKey = buildDuplicateKey(name, nickname);
    if (internalKeys.has(duplicateKey)) {
      duplicatedInFile += 1;
      return;
    }

    internalKeys.add(duplicateKey);
    validRows.push({
      sourceRow: index + 2,
      name,
      nickname,
      type: mapProfessionalType(cargo, accessGroup),
      specialty: mapSpecialty(cargo),
      has_schedule: hasSchedule(cargo, accessGroup),
      schedule_start_time: scheduleStart,
      schedule_end_time: scheduleEnd,
      duplicateKey,
      notes:
        buildNotes([
          ['Cargo original', cargo],
          ['Grupo de acesso original', accessGroup],
          ['CPF legado', getField(row, 'CPF')],
          ['Especialidade legada', getField(row, 'Especialidade')],
          ['Contratação legada', getField(row, 'Contratação')],
          ['ID legado', getField(row, 'ID')],
        ]) || null,
      created_at: null,
    });
  });

  return { validRows, invalidRows, duplicatedInFile };
};

const buildExistingKeys = (professionals: ExistingProfessional[]) => {
  const keys = new Set<string>();
  professionals.forEach((professional) => {
    keys.add(buildDuplicateKey(professional.name, professional.nickname || professional.name));
  });
  return keys;
};

export function ProfessionalImportSettings() {
  const { tenantId, canModify } = useAuth();
  const { refreshData } = useData();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ProfessionalImportRow[]>([]);
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
      toast.success(`${parsed.validRows.length} profissionais prontos para validação.`);
    } catch (error) {
      console.error('Erro ao ler planilha de profissionais:', error);
      toast.error('Não foi possível ler a planilha XLSX.');
    } finally {
      setParsing(false);
    }
  };

  const fetchExistingProfessionals = async () => {
    if (!tenantId) return [];

    const allProfessionals: ExistingProfessional[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('professionals')
        .select('name, nickname')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .range(from, from + IMPORT_PAGE_SIZE - 1);

      if (error) throw error;
      allProfessionals.push(...(data ?? []));
      if (!data || data.length < IMPORT_PAGE_SIZE) break;
      from += IMPORT_PAGE_SIZE;
    }

    return allProfessionals;
  };

  const handleImport = async () => {
    if (!tenantId) {
      toast.error('Entre em uma conta de cliente para importar os profissionais.');
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
      const existingKeys = buildExistingKeys(await fetchExistingProfessionals());
      const rowsToImport = rows.filter((row) => !existingKeys.has(row.duplicateKey));
      const skippedExisting = rows.length - rowsToImport.length;

      if (rowsToImport.length === 0) {
        setLastResult(`Nenhum profissional importado. ${skippedExisting} já existiam neste cliente.`);
        toast.info('Todos os profissionais da planilha já existem neste cliente.');
        return;
      }

      let imported = 0;
      for (let index = 0; index < rowsToImport.length; index += DEFAULT_BATCH_SIZE) {
        const batch = rowsToImport.slice(index, index + DEFAULT_BATCH_SIZE).map((row) => ({
          tenant_id: tenantId,
          name: row.name,
          nickname: row.nickname,
          type: row.type,
          specialty: row.specialty,
          has_schedule: row.has_schedule,
          schedule_start_time: row.schedule_start_time,
          schedule_end_time: row.schedule_end_time,
          schedule_color: DEFAULT_SCHEDULE_COLOR,
          commission_service: 0,
          commission_product: 0,
          is_active: true,
          phone: null,
          email: null,
          photo_url: null,
        }));

        const { error } = await supabase.from('professionals').insert(batch);
        if (error) throw error;

        imported += batch.length;
        setProgress(Math.round((imported / rowsToImport.length) * 100));
      }

      await refreshData(['professionals']);
      const result = `${imported} profissionais importados com sucesso. ${skippedExisting} já existiam neste cliente.`;
      setLastResult(result);
      toast.success(result);
    } catch (error) {
      console.error('Erro ao importar profissionais:', error);
      toast.error('Não foi possível concluir a importação dos profissionais.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Importar Profissionais
        </CardTitle>
        <CardDescription>
          Use a planilha de profissionais do legado para cadastrar a equipe somente no cliente logado.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="professional-import-file">Planilha XLSX</Label>
            <Input
              id="professional-import-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={parsing || importing}
            />
            {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
          </div>

          <Button onClick={handleImport} disabled={parsing || importing || rows.length === 0}>
            <Upload className="mr-2 h-4 w-4" />
            {importing ? 'Importando...' : 'Importar profissionais'}
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
              <span>{parsing ? 'Lendo planilha...' : 'Importando profissionais...'}</span>
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
                  <TableHead>Nome</TableHead>
                  <TableHead>Apelido</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead>Tem agenda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.length > 0 ? (
                  previewRows.map((row) => (
                    <TableRow key={row.duplicateKey}>
                      <TableCell>{row.sourceRow}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.nickname}</TableCell>
                      <TableCell>{row.type}</TableCell>
                      <TableCell>{row.specialty || 'outro'}</TableCell>
                      <TableCell>{row.has_schedule ? 'Sim' : 'Não'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Selecione uma planilha para visualizar os profissionais.
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
