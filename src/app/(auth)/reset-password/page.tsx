import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { savePassword } from './actions';

export default async function ResetPassword({searchParams}: {searchParams: Promise<{status?: string}>}) {
  if (!(await cookies()).has('relaxio-recovery-user')) redirect('/forgot-password?expired=1');
  const {status} = await searchParams;
  return <main className="mx-auto mt-24 grid w-full max-w-md gap-5 rounded-xl border bg-card p-6 text-card-foreground">
    <h1 className="text-2xl font-semibold">Set a new password</h1>
    {status && <p role="alert">Could not save the password. Use at least 12 characters and enter it twice.</p>}
    <form action={savePassword} className="grid gap-4">
      <label className="grid gap-2">New password<input className="rounded-md border bg-background px-3 py-2" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
      <label className="grid gap-2">Confirm password<input className="rounded-md border bg-background px-3 py-2" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
      <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground">Save new password</button>
    </form>
  </main>;
}
