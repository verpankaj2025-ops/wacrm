import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { replayAutomation } from '@/lib/automations/engine'
import type { AutomationTriggerType } from '@/types'

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string
      logId: string
    }>
  },
) {
  try {
    const { id, logId } = await params

    const ctx = await requireRole('agent')

    const admin = supabaseAdmin()

    const { data: automation } = await admin
      .from('automations')
      .select('id, account_id')
      .eq('id', id)
      .maybeSingle()

    if (!automation || automation.account_id !== ctx.accountId) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 },
      )
    }

    const { data: log } = await admin
      .from('automation_logs')
      .select('*')
      .eq('id', logId)
      .eq('automation_id', id)
      .maybeSingle()

    if (!log) {
      return NextResponse.json(
        { error: 'Log not found' },
        { status: 404 },
      )
    }

    await replayAutomation({
      automationId: id,
      contactId: log.contact_id,
      triggerEvent: log.trigger_event as AutomationTriggerType,
    })

    return NextResponse.json({
      ok: true,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}