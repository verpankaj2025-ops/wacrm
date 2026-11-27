'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { organizationAccess } from '../../lib/organization-access';
import { contactKinds, contactName, ContactCsvError, csvReport, fieldKinds, labelInput, MAX_CSV_BYTES, normalizePhone, parseContactCsv, parseFieldValue } from '../../lib/contact-input';
import { uuid } from '../../lib/validation';

export type ContactResult = { status?: string; report?: string; error?: string };
const denied = { error: 'You do not have permission to edit contacts.' };
const invalid = { error: 'Check the information and try again.' };
const failure = { error: 'The change could not be saved.' };
const fieldSlot = z.string().regex(/^(?:[1-9]|1[0-9]|20)$/).transform(Number);

async function writer(form: FormData) {
  const access = await organizationAccess();
  const expectedOrg = uuid.safeParse(form.get('workspace'));
  if (!access?.org || !access.writable || !expectedOrg.success || expectedOrg.data !== access.org.org_id) return null;
  return { client: access.client, org: access.org.org_id };
}

function saved(status: string) {
  revalidatePath('/contacts');
  return { status };
}

export async function importCsv(_: ContactResult, form: FormData): Promise<ContactResult> {
  const access = await writer(form);
  if (!access) return denied;
  const file = form.get('csv');
  if (!(file instanceof File) || !file.size || file.size > MAX_CSV_BYTES) return { error: 'Choose a CSV file up to 256 KiB.' };
  try {
    const { rows, rejected } = parseContactCsv(new Uint8Array(await file.arrayBuffer()));
    let inserted = 0;
    if (rows.length) {
      const { data, error } = await access.client.rpc('import_contacts', { p_org: access.org, p_rows: rows });
      if (error || typeof data !== 'number') return failure;
      inserted = data;
    }
    return {
      ...saved(`${inserted} imported · ${rows.length - inserted} already present · ${rejected.length} rejected`),
      report: rejected.length ? csvReport([['Row', 'Reason'], ...rejected.map(item => [String(item.row), item.reason])]) : undefined,
    };
  } catch (error) {
    return { error: error instanceof ContactCsvError ? error.message : 'The import could not be completed.' };
  }
}

export async function saveContact(_: ContactResult, form: FormData): Promise<ContactResult> {
  const access = await writer(form);
  if (!access) return denied;
  const parsed = z.object({ name: contactName, phone: z.string().max(80), kind: z.enum(contactKinds), id: uuid.optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid;
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: 'Enter a valid phone number.' };
  const row = { name: parsed.data.name, phone_e164: phone, kind: parsed.data.kind };
  const table = access.client.from('contacts');
  const result = parsed.data.id
    ? await table.update(row).eq('org_id', access.org).eq('id', parsed.data.id).select('id').single()
    : await table.insert({ org_id: access.org, ...row }).select('id').single();
  if (result.error?.code === '23505') return { error: 'That phone number already belongs to a contact in this organization.' };
  if (result.error) return failure;
  return saved(parsed.data.id ? 'Contact updated.' : 'Contact added.');
}

export async function createTag(_: ContactResult, form: FormData): Promise<ContactResult> {
  const access = await writer(form);
  if (!access) return denied;
  const name = labelInput.safeParse(form.get('name'));
  if (!name.success) return invalid;
  const { error } = await access.client.from('contact_tags').insert({ org_id: access.org, name: name.data });
  if (error?.code === '23505') return { error: 'A tag with that name already exists.' };
  return error ? failure : saved('Tag created.');
}

export async function createField(_: ContactResult, form: FormData): Promise<ContactResult> {
  const access = await writer(form);
  if (!access) return denied;
  const input = z.object({ name: labelInput, kind: z.enum(fieldKinds) }).safeParse(Object.fromEntries(form));
  if (!input.success) return invalid;
  const { error } = await access.client.rpc('create_contact_field', { p_org: access.org, p_name: input.data.name, p_kind: input.data.kind });
  if (error?.code === '23505') return { error: 'A field with that name already exists.' };
  if (error?.code === '23514') return { error: 'Each organization can have up to 20 custom fields.' };
  return error ? failure : saved('Custom field created.');
}

export async function toggleTag(_: ContactResult, form: FormData): Promise<ContactResult> {
  const access = await writer(form);
  if (!access) return denied;
  const input = z.object({ id: uuid, tag: uuid, operation: z.enum(['attach', 'remove']) }).safeParse(Object.fromEntries(form));
  if (!input.success) return invalid;
  const { id, tag, operation } = input.data;
  const table = access.client.from('contact_tag_links');
  const { error } = operation === 'attach'
    ? await table.upsert({ org_id: access.org, contact_id: id, tag_id: tag }, { ignoreDuplicates: true, onConflict: 'org_id,contact_id,tag_id' })
    : await table.delete().eq('org_id', access.org).eq('contact_id', id).eq('tag_id', tag);
  return error ? failure : saved(operation === 'attach' ? 'Tag attached.' : 'Tag removed.');
}

export async function saveFieldValue(_: ContactResult, form: FormData): Promise<ContactResult> {
  const access = await writer(form);
  if (!access) return denied;
  const input = z.object({ id: uuid, slot: fieldSlot, value: z.string().max(500) }).safeParse(Object.fromEntries(form));
  if (!input.success) return invalid;
  const { id, slot, value } = input.data;
  const table = access.client.from('contact_field_values');
  if (!value.trim()) {
    const { error } = await table.delete().eq('org_id', access.org).eq('contact_id', id).eq('field_slot', slot);
    return error ? failure : saved('Field cleared.');
  }
  const definition = await access.client.from('contact_fields').select('kind').eq('org_id', access.org).eq('slot', slot).single();
  const kind = z.enum(fieldKinds).safeParse(definition.data?.kind);
  if (!kind.success) return invalid;
  let parsed: ReturnType<typeof parseFieldValue>;
  try {
    parsed = parseFieldValue(kind.data, value);
  } catch {
    return { error: 'Enter a value that matches the field type.' };
  }
  const updated = await table.update({ value: parsed }).eq('org_id', access.org).eq('contact_id', id).eq('field_slot', slot).select('field_slot');
  if (updated.error) return failure;
  if (!updated.data.length) {
    const { error } = await table.insert({ org_id: access.org, contact_id: id, field_slot: slot, field_kind: kind.data, value: parsed });
    if (error) return failure;
  }
  return saved('Field saved.');
}
