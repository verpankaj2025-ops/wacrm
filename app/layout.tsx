import type { Metadata } from 'next';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/instrument-serif/400.css';
import './styles.css';

export const metadata: Metadata = {
  title: 'Relaxio CRM',
  referrer: 'no-referrer',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
