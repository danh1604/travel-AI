import { AuthForm } from "@/components/auth-form";
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const query = await searchParams;
  return <AuthForm mode="login" area="admin" returnTo={typeof query.next === "string" ? query.next : undefined} />;
}
