import { AuthScreen } from '../../components/auth-screen';

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; status?: string }> }) {
  return <AuthScreen mode="login" {...await searchParams} />;
}
