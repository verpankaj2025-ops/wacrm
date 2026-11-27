import { parse } from 'csv-parse/sync';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { z } from 'zod';

export const MAX_CSV_BYTES = 256 * 1024;
export const MAX_CSV_ROWS = 500;
export const contactKinds = ['contact', 'lead'] as const;
export const fieldKinds = ['text', 'number', 'boolean', 'date'] as const;
export const labelInput = z.string().trim().min(1).max(48).regex(/^[^\u0000-\u001f\u007f]+$/);
export const contactName = z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f]+$/);
export type ContactInput = { name: string; phone_e164: string; kind: typeof contactKinds[number] };
export type RejectedRow = { row: number; reason: string };

export function normalizePhone(value: string) {
  if (value.length > 80) return;
  const phone = parsePhoneNumberFromString(value.trim(), { defaultCountry: 'IN', extract: false });
  if (phone && !phone.ext && phone.isValid()) return phone.number;
}

function neutralize(value: string) {
  return /^[\s\uFEFF]*[=+@-]/u.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
}

export function csvReport(rows: string[][]) {
  return rows.map(row => row.map(cell => '"' + neutralize(cell).replaceAll('"', '""') + '"').join(',') + '\r\n').join('');
}

export class ContactCsvError extends Error {}

export function parseContactCsv(bytes: Uint8Array) {
  if (bytes.length > MAX_CSV_BYTES) throw new ContactCsvError('CSV file must be at most 256 KiB.');
  let records: string[][];
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    records = parse(source, { bom: true, relax_column_count: true, to: MAX_CSV_ROWS + 2 });
  } catch {
    throw new ContactCsvError('Malformed CSV. Upload a valid UTF-8 CSV file.');
  }
  const [header, ...body] = records;
  const columns = header?.map(cell => cell.trim().toLowerCase());
  if (columns?.[0] !== 'name' || columns[1] !== 'phone' ||
      !(columns.length === 2 || (columns.length === 3 && columns[2] === 'kind'))) {
    throw new ContactCsvError('Use the columns name,phone or name,phone,kind in that order.');
  }
  if (!body.length) throw new ContactCsvError('The CSV must contain at least one data row.');
  if (body.length > MAX_CSV_ROWS) throw new ContactCsvError('CSV file must contain at most 500 data rows.');
  const rows: ContactInput[] = [];
  const rejected: RejectedRow[] = [];
  const seen = new Set<string>();
  for (const [index, record] of body.entries()) {
    const [rawName = '', rawPhone = '', rawKind = 'contact'] = record;
    const name = contactName.safeParse(neutralize(rawName.trim()));
    const phone = normalizePhone(rawPhone);
    const kind = z.enum(contactKinds).safeParse(rawKind.trim().toLowerCase() || 'contact');
    let reason: string;
    if (record.length !== header.length) reason = 'Incorrect number of columns';
    else if (!name.success) reason = 'Invalid name';
    else if (!phone) reason = 'Invalid phone';
    else if (!kind.success) reason = 'Invalid kind';
    else if (seen.has(phone)) reason = 'Duplicate phone within file';
    else {
      rows.push({ name: name.data, phone_e164: phone, kind: kind.data });
      seen.add(phone);
      continue;
    }
    rejected.push({ row: index + 2, reason });
  }
  return { rows, rejected };
}

export function parseFieldValue(kind: typeof fieldKinds[number], input: string) {
  const trimmed = input.trim();
  switch (kind) {
    case 'text': return z.string().min(1).max(500).parse(trimmed);
    case 'number': return z.string().regex(/^-?(?:\d+\.?\d*|\.\d+)$/).transform(Number)
      .pipe(z.number().min(-1e12).max(1e12)).parse(trimmed);
    case 'boolean': return z.enum(['true', 'false']).parse(trimmed) === 'true';
    case 'date': return z.iso.date().refine(value => !value.startsWith('0000-')).parse(trimmed);
  }
}
