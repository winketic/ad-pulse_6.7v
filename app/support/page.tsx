import Link from "next/link";
import { Logo } from "@/components/Logo";
import PublicSupportForm from "./PublicSupportForm";

export const metadata = {
  title: "Поддержка — AD Pulse",
  description: "Напишите в поддержку AD Pulse: подключение, счета, учёт материалов.",
};

export default function PublicSupportPage() {
  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Поддержка AD Pulse</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Поможем с подключением, счетами и учётом</p>
        </div>

        <PublicSupportForm />

        <p className="text-center text-sm text-[var(--muted)] mt-6">
          Уже работаете в системе?{" "}
          <Link href="/login" className="font-medium text-[var(--text)] hover:text-[var(--link)] transition-colors">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
