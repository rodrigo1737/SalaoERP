import * as XLSX from 'xlsx';

export type RawRow = Record<string, unknown>;

export const IMPORT_PAGE_SIZE = 1000;
export const DEFAULT_BATCH_SIZE = 300;

export const normalizeHeader = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const asText = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

export const onlyDigits = (value: unknown) => asText(value).replace(/\D+/g, '');

export const getField = (row: RawRow, headers: string | string[]) => {
  const candidates = Array.isArray(headers) ? headers : [headers];

  for (const header of candidates) {
    const normalizedTarget = normalizeHeader(header);
    const key = Object.keys(row).find((item) => normalizeHeader(item) === normalizedTarget);
    if (key) return row[key];
  }

  return '';
};

export const parseMoney = (value: unknown) => {
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

export const parseNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = asText(value).replace(',', '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseDate = (value: unknown) => {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = asText(value);
  if (!text) return null;

  const match = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (match) {
    const [, dd, mm, yyyyRaw] = match;
    const year = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
    const iso = `${year.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const date = new Date(`${iso}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : iso;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const normalizeTime = (value: unknown) => {
  const text = asText(value);
  if (!text) return '12:00';

  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '12:00';

  const hours = match[1].padStart(2, '0');
  const minutes = match[2].padStart(2, '0');
  const seconds = match[3]?.padStart(2, '0') ?? '00';

  return `${hours}:${minutes}:${seconds}`;
};

export const parseDateTime = (dateValue: unknown, timeValue?: unknown) => {
  const isoDate = parseDate(dateValue);
  if (!isoDate) return null;

  const time = normalizeTime(timeValue);
  const localDate = new Date(`${isoDate}T${time}`);
  if (Number.isNaN(localDate.getTime())) return null;

  return localDate.toISOString();
};

export const addMinutes = (isoDateTime: string, minutes: number) => {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
};

export const buildNotes = (entries: Array<[string, unknown]>) =>
  entries
    .map(([label, value]) => {
      const text = asText(value);
      return text ? `${label}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');

export const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export const readWorkbookRows = async (file: File) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<RawRow>(worksheet, { defval: '' });
  const headers = rawRows[0] ? Object.keys(rawRows[0]) : [];

  return { workbook, sheetName, worksheet, rawRows, headers };
};

export const hasRequiredHeaders = (headers: string[], requiredHeaders: string[]) =>
  requiredHeaders.filter(
    (header) => !headers.some((item) => normalizeHeader(item) === normalizeHeader(header)),
  );
