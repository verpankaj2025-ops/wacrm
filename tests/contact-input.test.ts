import { expect, test } from 'vitest';
import { csvReport, parseContactCsv, normalizePhone, MAX_CSV_BYTES } from '../lib/contact-input';

test('normalizes Indian local and international numbers and rejects extensions', () => {
  expect(normalizePhone('09876543210')).toBe('+919876543210');
  expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
  expect(normalizePhone('+1 202 555 0123')).toBe('+12025550123');
  expect(normalizePhone('Contact +919876543210')).toBeUndefined();
  expect(normalizePhone('9876543210 ext 123')).toBeUndefined();
});

test('validates CSV rows, keeps the first normalized phone and neutralizes formula cells', () => {
  const result = parseContactCsv(new TextEncoder().encode(
    'name,phone,kind\r\n"=Jane, Example",09876543210,lead\r\nOther,+919876543210,contact\r\nBad,bad,lead\r\nMissing\r\n'));
  expect(result).toEqual({
    rows: [{ name: "'=Jane, Example", phone_e164: '+919876543210', kind: 'lead' }],
    rejected: [{ row: 3, reason: 'Duplicate phone within file' }, { row: 4, reason: 'Invalid phone' }, { row: 5, reason: 'Incorrect number of columns' }],
  });
  expect(csvReport([['=2+2', ' +SUM(A1)', '-2', '@test', 'regular']]))
    .toBe('"\'=2+2","\' +SUM(A1)","\'-2","\'@test","regular"\r\n');
});

test('rejects oversized, over-row-limit and malformed CSV files without echoing input', () => {
  const encode = (data: string) => new TextEncoder().encode(data);
  expect(() => parseContactCsv(new Uint8Array(MAX_CSV_BYTES + 1))).toThrow('256 KiB');
  expect(() => parseContactCsv(encode('name,phone\n' + 'Name,9876543210\n'.repeat(501)))).toThrow('500');
  expect(() => parseContactCsv(encode('name,phone\n"unclosed,9876543210'))).toThrow('Malformed CSV');
  expect(() => parseContactCsv(encode('"name,phone"\nJane,9876543210'))).toThrow('Use the columns');
});
