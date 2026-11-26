import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Logo } from "@/components/Logo";
import WelcomeForm from "./WelcomeForm";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.company_id) redirect("/dashboard");

  const metadata = user.user_metadata ?? {};

  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Почта подтверждена</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Остался один шаг — создаём компанию</p>
        </div>
        <WelcomeForm
          defaultCompany={typeof metadata.company_name === "string" ? metadata.company_name : ""}
          defaultContact={typeof metadata.contact_name === "string" ? metadata.contact_name : ""}
        />
      </div>
    </div>
  );
}
