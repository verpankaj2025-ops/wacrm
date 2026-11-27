import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { savePassword } from './actions';

export default async function ResetPassword({searchParams}: {searchParams: Promise<{status?: string}>}) {
  if (!(await cookies()).has('relaxio-recovery-user')) redirect('/forgot-password?status=expired');
  const {status} = await searchParams;
  return <main className="single card stack">
    <h1>Set a new password</h1>
    {status && <p role="alert">Could not save the password. Use at least 12 characters and enter it twice.</p>}
    <form action={savePassword} className="stack">
      <label>New password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
      <label>Confirm password<input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
      <button className="button button-primary">Save new password</button>
    </form>
  </main>;
}
