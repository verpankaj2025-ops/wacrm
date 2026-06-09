import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'

async function requireUser() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false as const,
      status: 401,
      body: { error: 'Unauthorized' },
    }
  }

  return {
    ok: true as const,
    userId: user.id,
    supabase,
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser()

  if (!guard.ok) {
    return NextResponse.json(guard.body, {
      status: guard.status,
    })
  }

  const body = await request.json().catch(() => null)

  const { id } = await params

  const updateData: Record<string, unknown> = {}

  if (body?.title !== undefined) {
    updateData.title = body.title
  }

  if (body?.description !== undefined) {
    updateData.description = body.description
  }

  if (body?.priority !== undefined) {
    updateData.priority = body.priority
  }

  if (body?.assigned_to !== undefined) {
    updateData.assigned_to = body.assigned_to
  }

  if (body?.status !== undefined) {
    updateData.status = body.status

    if (body.status === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }
  }

  updateData.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin()
    .from('tasks')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ task: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireUser()

  if (!guard.ok) {
    return NextResponse.json(guard.body, {
      status: guard.status,
    })
  }

  const { id } = await params

  const { error } = await supabaseAdmin()
    .from('tasks')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
  })
}