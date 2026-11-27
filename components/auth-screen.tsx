import Link from 'next/link';
import { appUrl } from '../lib/config';
import { google, login, signup } from '../app/actions';
import { safeDestination } from '../lib/validation';
import { Button } from './ui/button';

const messages: Record<string, string> = {
  invalid: 'Check your email and password. New passwords must have at least 12 characters.',
  rate: 'Sign-in attempts are temporarily limited. Please try again later.',
  login: 'We could not sign you in. Check your credentials and confirm your email.',
  signup: 'We could not create your account. Please try again.',
  'password-reset': 'Password updated. Sign in with your new password.',
  confirm: 'Check your email for a confirmation link.',
  oauth: 'Google sign-in is unavailable. Please try again.',
  callback: 'This sign-in link is invalid or expired. Please sign in again.',
  required: 'Sign in to continue to your organization.',
};

export function AuthScreen({ mode, next, status }: { mode: 'login' | 'signup'; next?: string; status?: string }) {
  const registering = mode === 'signup';
  const destination = safeDestination(next);
  return (
    <main className="auth">
      <aside className="auth-panel" aria-label="Relaxio CRM">
        <span className="brand-mark" aria-hidden="true">✳</span>
        <div className="wordmark">Relaxio CRM</div>
      </aside>
      <section className="auth-content">
        <h1>{registering ? 'Create an account' : 'Welcome back'}</h1>
        {status && Object.hasOwn(messages, status) && <p className="notice" role="status">{messages[status]}</p>}
        <form action={registering ? signup : login} className="stack">
          <input type="hidden" name="next" value={destination} />
          <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label>Password<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'}
            minLength={registering ? 12 : undefined} maxLength={72} required /></label>
          {registering && <p className="muted text-sm">Use at least 12 characters.</p>}
          <Button>{registering ? 'Create account' : 'Sign in'}</Button>
        </form>
        {!registering && process.env.RELAXIO_DATA_MODE === 'wacrm' && (
          <Link href={appUrl('/forgot-password').href}>Forgot password?</Link>
        )}
        {process.env.RELAXIO_DATA_MODE !== 'wacrm' && <form action={google} className="stack">
          <input type="hidden" name="next" value={destination} />
          <Button variant="outline">Continue with Google</Button>
        </form>}
        <Link href={(registering ? '/login' : '/signup') + '?' + new URLSearchParams({ next: destination })}>
          {registering ? 'Sign in' : 'Create an account'}
        </Link>
      </section>
    </main>
  );
}
