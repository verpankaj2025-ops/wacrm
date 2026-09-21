'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import * as XLSX from 'xlsx';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  XCircle,
  MessageCircle,
} from 'lucide-react';

interface ImportModalProps {
  open: boolean;
  onOpenChange: (
    open: boolean,
  ) => void;
  onImported: () => void;
}

interface ParsedRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  sequence?: string;
  opt_in?: boolean;
  start_at?: string;
}

interface AutomationOption {
  id: string;
  name: string;
  is_active: boolean;
}

interface ImportResult {
  imported: number;
  enrolled: number;
  skipped: number;
  failed: number;
}

function normaliseHeader(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(
      /[\s_-]+/g,
      '_',
    );
}

function parseOptIn(
  value: unknown,
): boolean | undefined {
  const text =
    String(
      value ?? '',
    )
      .trim()
      .toLowerCase();

  if (!text) {
    return undefined;
  }

  if (
    [
      'yes',
      'true',
      '1',
      'y',
      'opted_in',
      'opt-in',
      'optin',
    ].includes(
      text,
    )
  ) {
    return true;
  }

  if (
    [
      'no',
      'false',
      '0',
      'n',
      'opted_out',
      'opt-out',
      'optout',
    ].includes(
      text,
    )
  ) {
    return false;
  }

  return undefined;
}

function parseWorkbook(
  buffer: ArrayBuffer,
): ParsedRow[] {
  const workbook =
    XLSX.read(
      buffer,
      {
        type: 'array',
        cellDates: false,
      },
    );

  const firstSheet =
    workbook.Sheets[
      workbook.SheetNames[0]
    ];

  if (!firstSheet) {
    return [];
  }

  const matrix =
    XLSX.utils.sheet_to_json<
      unknown[]
    >(
      firstSheet,
      {
        header: 1,
        defval: '',
        raw: false,
      },
    );

  if (
    matrix.length <
    2
  ) {
    return [];
  }

  const headers =
    matrix[0].map(
      normaliseHeader,
    );

  const phoneIndex =
    headers.findIndex(
      (header) =>
        [
          'phone',
          'mobile',
          'mobile_number',
          'phone_number',
          'whatsapp',
          'whatsapp_number',
        ].includes(
          header,
        ),
    );

  if (
    phoneIndex <
    0
  ) {
    return [];
  }

  const indexOf =
    (...names: string[]) =>
      headers.findIndex(
        (header) =>
          names.includes(
            header,
          ),
      );

  const nameIndex =
    indexOf(
      'name',
      'full_name',
      'customer_name',
    );

  const emailIndex =
    indexOf(
      'email',
      'email_address',
    );

  const companyIndex =
    indexOf(
      'company',
      'business',
    );

  const sequenceIndex =
    indexOf(
      'sequence',
      'automation',
      'followup_sequence',
    );

  const optInIndex =
    indexOf(
      'opt_in',
      'optin',
      'whatsapp_opt_in',
      'whatsapp_consent',
    );

  const startAtIndex =
    indexOf(
      'start_at',
      'start_time',
      'next_followup_at',
      'next_followup',
    );

  const rows: ParsedRow[] =
    [];

  for (
    let i = 1;
    i < matrix.length;
    i++
  ) {
    const row =
      matrix[i] ?? [];

    const phone =
      String(
        row[phoneIndex] ??
          '',
      ).trim();

    if (!phone) {
      continue;
    }

    rows.push({
      phone,
      name:
        nameIndex >= 0
          ? String(
              row[nameIndex] ??
                '',
            ).trim() ||
            undefined
          : undefined,
      email:
        emailIndex >= 0
          ? String(
              row[emailIndex] ??
                '',
            ).trim() ||
            undefined
          : undefined,
      company:
        companyIndex >= 0
          ? String(
              row[companyIndex] ??
                '',
            ).trim() ||
            undefined
          : undefined,
      sequence:
        sequenceIndex >= 0
          ? String(
              row[sequenceIndex] ??
                '',
            ).trim() ||
            undefined
          : undefined,
      opt_in:
        optInIndex >= 0
          ? parseOptIn(
              row[optInIndex],
            )
          : undefined,
      start_at:
        startAtIndex >= 0
          ? String(
              row[startAtIndex] ??
                '',
            ).trim() ||
            undefined
          : undefined,
    });
  }

  return rows;
}

export function ImportModal({
  open,
  onOpenChange,
  onImported,
}: ImportModalProps) {
  const supabase =
    createClient();

  const { accountId } =
    useAuth();

  const fileInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const [
    file,
    setFile,
  ] =
    useState<File | null>(
      null,
    );

  const [
    parsedRows,
    setParsedRows,
  ] =
    useState<ParsedRow[]>(
      [],
    );

  const [
    automations,
    setAutomations,
  ] =
    useState<
      AutomationOption[]
    >([]);

  const [
    defaultSequenceId,
    setDefaultSequenceId,
  ] =
    useState('');

  const [
    enrollSequence,
    setEnrollSequence,
  ] =
    useState(false);

  const [
    consentConfirmed,
    setConsentConfirmed,
  ] =
    useState(false);

  const [
    importing,
    setImporting,
  ] =
    useState(false);

  const [
    result,
    setResult,
  ] =
    useState<
      ImportResult | null
    >(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    void (async () => {
      const {
        data,
        error,
      } =
        await supabase
          .from('automations')
          .select(
            'id,name,is_active',
          )
          .eq(
            'account_id',
            accountId ?? '',
          )
          .order(
            'name',
            {
              ascending: true,
            },
          );

      if (error) {
        toast.error(
          'Failed to load sequences',
        );
        return;
      }

      const options =
        (data ?? []) as AutomationOption[];

      setAutomations(
        options,
      );

      const firstActive =
        options.find(
          (
            automation,
          ) =>
            automation.is_active,
        );

      if (
        firstActive &&
        !defaultSequenceId
      ) {
        setDefaultSequenceId(
          firstActive.id,
        );
      }
    })();
  }, [
    open,
    accountId,
  ]);

  function reset() {
    setFile(null);
    setParsedRows([]);
    setResult(null);
    setDefaultSequenceId('');
    setEnrollSequence(false);
    setConsentConfirmed(false);

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value =
        '';
    }
  }

  function handleOpenChange(
    value: boolean,
  ) {
    if (!value) {
      reset();
    }

    onOpenChange(
      value,
    );
  }

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selected =
      event.target.files?.[0];

    if (!selected) {
      return;
    }

    setFile(
      selected,
    );
    setResult(null);

    try {
      const buffer =
        await selected.arrayBuffer();

      const rows =
        parseWorkbook(
          buffer,
        );

      if (
        rows.length ===
        0
      ) {
        toast.error(
          'No valid rows found. Required column: phone/mobile/whatsapp.',
        );

        setParsedRows(
          [],
        );

        return;
      }

      setParsedRows(
        rows,
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to read file.',
      );

      setParsedRows(
        [],
      );
    }
  }

  async function handleImport() {
    if (
      parsedRows.length ===
      0
    ) {
      return;
    }

    if (
      enrollSequence &&
      !defaultSequenceId
    ) {
      toast.error(
        'Select a follow-up sequence.',
      );
      return;
    }

    if (
      enrollSequence &&
      !consentConfirmed
    ) {
      toast.error(
        'Confirm WhatsApp opt-in before starting the sequence.',
      );
      return;
    }

    setImporting(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/contacts/import-sequence',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body:
              JSON.stringify({
                rows:
                  parsedRows,
                default_sequence_id:
                  defaultSequenceId ||
                  null,
                enroll_sequence:
                  enrollSequence,
                consent_confirmed:
                  consentConfirmed,
              }),
          },
        );

      const payload =
        await response
          .json()
          .catch(
            () => ({}),
          );

      if (
        !response.ok
      ) {
        throw new Error(
          payload?.error ??
            'Import failed.',
        );
      }

      const nextResult:
        ImportResult = {
        imported:
          payload?.imported ??
          0,
        enrolled:
          payload?.enrolled ??
          0,
        skipped:
          payload?.skipped ??
          0,
        failed:
          payload?.failed ??
          0,
      };

      setResult(
        nextResult,
      );

      if (
        nextResult.imported >
        0
      ) {
        toast.success(
          `${nextResult.imported} contacts imported`,
        );

        onImported();
      }

      if (
        nextResult.enrolled >
        0
      ) {
        toast.success(
          `${nextResult.enrolled} leads enrolled in follow-up sequence`,
        );
      }

      if (
        nextResult.failed >
        0
      ) {
        toast.error(
          `${nextResult.failed} rows failed`,
        );
      }
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Import failed',
      );
    } finally {
      setImporting(
        false,
      );
    }
  }

  const preview =
    parsedRows.slice(
      0,
      6,
    );

  const sequenceColumnCount =
    parsedRows.filter(
      (row) =>
        !!row.sequence,
    ).length;

  return (
    <Dialog
      open={open}
      onOpenChange={
        handleOpenChange
      }
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-700 bg-slate-900 text-slate-200 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-white">
            Import Leads
          </DialogTitle>

          <DialogDescription className="text-slate-400">
            Excel (.xlsx/.xls) and CSV are supported.
            Required: phone. Optional: name, email,
            company, sequence and opt_in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">

          <div
            onClick={() =>
              fileInputRef.current?.click()
            }
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/50 p-8 transition hover:border-primary/50 hover:bg-primary/5"
          >
            {file ? (
              <>
                <FileSpreadsheet className="size-9 text-primary" />

                <p className="text-sm text-slate-200">
                  {file.name}
                </p>

                <p className="text-xs text-slate-500">
                  {parsedRows.length} rows detected
                </p>
              </>
            ) : (
              <>
                <Upload className="size-9 text-slate-500" />

                <p className="text-sm text-slate-300">
                  Upload Excel or CSV
                </p>

                <p className="text-xs text-slate-500">
                  Up to 1,000 leads per import
                </p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={
              handleFileChange
            }
            className="hidden"
          />

          {parsedRows.length > 0 &&
            !result && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <MessageCircle className="size-4 text-primary" />
                      <span className="text-sm font-semibold text-white">
                        Follow-up sequence
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      Imported leads can be enrolled in an
                      existing editable automation sequence.
                    </p>
                  </div>

                  <Switch
                    checked={
                      enrollSequence
                    }
                    onCheckedChange={
                      setEnrollSequence
                    }
                  />
                </div>

                {enrollSequence && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">
                        Default sequence
                      </label>

                      <select
                        value={
                          defaultSequenceId
                        }
                        onChange={(event) =>
                          setDefaultSequenceId(
                            event.target.value,
                          )
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                      >
                        <option value="">
                          Select sequence
                        </option>

                        {automations
                          .filter(
                            (
                              automation,
                            ) =>
                              automation.is_active,
                          )
                          .map(
                            (
                              automation,
                            ) => (
                              <option
                                key={
                                  automation.id
                                }
                                value={
                                  automation.id
                                }
                              >
                                {
                                  automation.name
                                }
                              </option>
                            ),
                          )}
                      </select>
                    </div>

                    {sequenceColumnCount > 0 && (
                      <p className="text-[11px] text-primary">
                        {sequenceColumnCount} rows contain
                        their own sequence value. Those values
                        will override the default sequence when
                        they match an existing automation name
                        or ID.
                      </p>
                    )}

                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
                      <input
                        type="checkbox"
                        checked={
                          consentConfirmed
                        }
                        onChange={(event) =>
                          setConsentConfirmed(
                            event.target.checked,
                          )
                        }
                        className="mt-0.5"
                      />

                      <span className="text-[11px] leading-5 text-amber-200/80">
                        I confirm these contacts have opted in
                        to receive WhatsApp messages from this
                        business.
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

          {preview.length > 0 &&
            !result && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Preview
                </p>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800">
                        <th className="px-3 py-2 text-left text-slate-400">
                          Phone
                        </th>
                        <th className="px-3 py-2 text-left text-slate-400">
                          Name
                        </th>
                        <th className="px-3 py-2 text-left text-slate-400">
                          Sequence
                        </th>
                        <th className="px-3 py-2 text-left text-slate-400">
                          Opt-in
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {preview.map(
                        (
                          row,
                          index,
                        ) => (
                          <tr
                            key={
                              index
                            }
                            className="border-t border-slate-800"
                          >
                            <td className="px-3 py-2 font-mono text-slate-300">
                              {
                                row.phone
                              }
                            </td>

                            <td className="px-3 py-2 text-slate-300">
                              {
                                row.name ??
                                '-'
                              }
                            </td>

                            <td className="px-3 py-2 text-slate-400">
                              {
                                row.sequence ??
                                'Default'
                              }
                            </td>

                            <td className="px-3 py-2">
                              <span
                                className={
                                  row.opt_in ===
                                  false
                                    ? 'text-red-400'
                                    : row.opt_in ===
                                      true
                                      ? 'text-emerald-400'
                                      : 'text-slate-500'
                                }
                              >
                                {row.opt_in ===
                                false
                                  ? 'No'
                                  : row.opt_in ===
                                    true
                                    ? 'Yes'
                                    : 'Unknown'}
                              </span>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>

                {parsedRows.length >
                  preview.length && (
                  <p className="text-[11px] text-slate-500">
                    +{' '}
                    {parsedRows.length -
                      preview.length}{' '}
                    more rows
                  </p>
                )}
              </div>
            )}

          {result && (
            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-sm font-semibold text-white">
                Import Complete
              </p>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-900 p-3">
                  <div className="text-xs text-slate-500">
                    Imported
                  </div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {
                      result.imported
                    }
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900 p-3">
                  <div className="text-xs text-slate-500">
                    Enrolled
                  </div>
                  <div className="mt-1 text-lg font-bold text-primary">
                    {
                      result.enrolled
                    }
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900 p-3">
                  <div className="text-xs text-slate-500">
                    Skipped
                  </div>
                  <div className="mt-1 text-lg font-bold text-yellow-400">
                    {
                      result.skipped
                    }
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900 p-3">
                  <div className="text-xs text-slate-500">
                    Failed
                  </div>
                  <div className="mt-1 text-lg font-bold text-red-400">
                    {
                      result.failed
                    }
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-slate-700 bg-slate-900">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              handleOpenChange(
                false,
              )
            }
            disabled={
              importing
            }
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            {result
              ? 'Close'
              : 'Cancel'}
          </Button>

          {!result && (
            <Button
              type="button"
              disabled={
                parsedRows.length ===
                  0 ||
                importing
              }
              onClick={
                handleImport
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importing && (
                <Loader2 className="size-4 animate-spin" />
              )}

              {enrollSequence
                ? `Import & Start Sequence (${parsedRows.length})`
                : `Import ${parsedRows.length} Contacts`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
