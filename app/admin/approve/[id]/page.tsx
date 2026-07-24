import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Logo } from "@/components/Logo";
import { ApproveButton } from "@/components/ApproveButton";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "altai.dx@gmail.com";

export default async function AdminApprovePage({ params }: { params: { id: string } }) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) notFound();

  const service = createServiceClient();
  const { data: reg, error } = await service
    .from("registrations")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !reg) notFound();

  const isPending = reg.status === "pending";

  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md relative z-[1]">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size={48} />
          </div>
          <h1 className="text-xl font-bold text-[var(--text)]">Одобрение заявки</h1>
        </div>

        <div className="dp-auth-card">
          {!isPending && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning)]/25 text-sm text-[var(--warning)]">
              Эта заявка уже {reg.status === "approved" ? "одобрена" : "отклонена"}.
            </div>
          )}

          <h2 className="text-base font-semibold text-[var(--text)] mb-4">Данные заявки</h2>

          <div className="mb-2">
            {[
              { label: "Компания", value: reg.company_name },
              { label: "Контакт", value: reg.contact_name },
              { label: "Email", value: reg.email },
              { label: "Телефон", value: reg.phone || "—" },
              {
                label: "Дата",
                value: new Date(reg.created_at).toLocaleDateString("ru-RU", {
                  day: "2-digit", month: "long", year: "numeric",
                }),
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start gap-4 py-2.5 border-b border-[var(--border)] last:border-0">
                <span className="text-xs text-[var(--muted)] shrink-0">{label}</span>
                <span className="text-sm text-[var(--text)] text-right break-all">{value}</span>
              </div>
            ))}
          </div>

          {isPending && <ApproveButton registrationId={params.id} />}

          <div className="mt-5 text-center">
            <Link href="/admin/registrations" className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
              ← Все заявки
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
