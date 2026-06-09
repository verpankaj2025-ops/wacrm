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

export async function GET() {
const guard = await requireUser()

if (!guard.ok) {
return NextResponse.json(guard.body, {
status: guard.status,
})
}

const { userId, supabase } = guard

const { data: profile } = await supabase
  .from('profiles')
  .select('account_id')
  .eq('user_id', userId)
  .single()

if (!profile?.account_id) {
  return NextResponse.json(
    { error: 'Profile account not found' },
    { status: 403 }
  )
}

const admin = supabaseAdmin()

const { data, error } = await admin
  .from('tasks')
  .select('*')
  .eq('account_id', profile.account_id)
  .order('created_at', { ascending: false })

if (error) {
return NextResponse.json(
{ error: error.message },
{ status: 500 }
)
}

return NextResponse.json({
tasks: data ?? [],
})
}

export async function POST(request: Request) {
const guard = await requireUser()

if (!guard.ok) {
return NextResponse.json(
guard.body,
{ status: guard.status }
)
}

const { userId, supabase } = guard

const { data: profile } = await supabase
.from('profiles')
.select('account_id')
.eq('user_id', userId)
.single()

const accountId = profile?.account_id

if (!accountId) {
return NextResponse.json(
{
error: 'Your profile is not linked to an account.',
},
{
status: 403,
}
)
}

const body = await request.json().catch(() => null)

if (!body?.title?.trim()) {
return NextResponse.json(
{ error: 'title is required' },
{ status: 400 }
)
}

const admin = supabaseAdmin()

const { data, error } = await admin
.from('tasks')
.insert({
account_id: accountId,
created_by: userId,

  title: body.title.trim(),
  description: body.description ?? null,

  priority: body.priority ?? 'medium',
  status: 'pending',

  due_at: body.due_at ?? null,

  assigned_to: body.assigned_to ?? null,

  contact_id: body.contact_id ?? null,
  conversation_id: body.conversation_id ?? null,
})
.select()
.single()


if (error) {
return NextResponse.json(
{ error: error.message },
{ status: 500 }
)
}

return NextResponse.json(
{ task: data },
{ status: 201 }
)
}
