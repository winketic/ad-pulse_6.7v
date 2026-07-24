"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";
import { updateMyProfile } from "@/app/(dashboard)/dashboard/settings/actions";

type Step = "name" | "position" | "password";
const STEPS: Step[] = ["name", "position", "password"];
const STEP_LABELS: Record<Step, string> = {
  name: "Ваше имя",
  position: "Должность",
  password: "Пароль",
};

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  if (pwd.length === 0) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { score, label: "Слабый", color: "bg-[var(--danger)]" };
  if (score <= 2) return { score, label: "Средний", color: "bg-[var(--warning)]" };
  if (score <= 3) return { score, label: "Хороший", color: "bg-[var(--warning)]" };
  return { score, label: "Надёжный", color: "bg-[var(--success)]" };
}

export default function InvitePage() {
  const [step, setStep] = useState<Step>("name");
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // ── Verify invite token / pick up existing session ───────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("error") === "expired") {
      setError("Ссылка недействительна или истекла. Попросите администратора отправить приглашение повторно.");
      return;
    }

    const token_hash = params.get("token_hash");
    const type = params.get("type");

    if (token_hash) {
      supabase.auth
        .verifyOtp({ token_hash, type: (type as "invite") ?? "invite" })
        .then(({ error: otpError }) => {
          if (otpError) {
            setError("Ссылка недействительна или истекла. Попросите администратора отправить приглашение повторно.");
          } else {
            setReady(true);
          }
        });
      return;
    }

    // Fallback: token already processed (PKCE code exchange) or hash-based flow
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  // ── Pre-fill name/position from existing profile (if any) ─
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, position")
        .eq("id", user.id)
        .single();

      // Team invites store the email as a placeholder full_name — treat that
      // as "not set yet" rather than pre-filling the name field with an email.
      const isPlaceholder = !profile?.full_name || profile.full_name === user.email;
      if (!isPlaceholder) setFullName(profile!.full_name!);
      if (profile?.position) setPosition(profile.position);
    })();
  }, [ready, supabase]);

  const stepIndex = STEPS.indexOf(step);

  function goNext() {
    setError("");
    if (step === "name") {
      if (!fullName.trim()) { setError("Введите ваше имя"); return; }
      setStep("position");
      return;
    }
    if (step === "position") {
      setStep("password");
      return;
    }
  }

  function goBack() {
    setError("");
    if (step === "position") setStep("name");
    else if (step === "password") setStep("position");
  }

  const validatePassword = (): string | null => {
    if (password.length < 8) return "Пароль должен содержать минимум 8 символов";
    if (password !== confirm) return "Пароли не совпадают";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validatePassword();
    if (validationError) { setError(validationError); return; }

    setError("");
    setLoading(true);

    try {
      await updateMyProfile(fullName, position);
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : "Не удалось сохранить профиль");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("Не удалось установить пароль. Попробуйте обновить страницу.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const strength = passwordStrength(password);
  const strengthWidth = strength.score > 0 ? `${(strength.score / 5) * 100}%` : "0%";

  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md relative z-[1]">
        {/* Logo */}
        <div className="text-center mb-8 fade-in-up">
          <div className="flex justify-center mb-4">
            <Logo size={64} />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">
            Добро пожаловать в AD Pulse
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">Настройте аккаунт перед началом работы</p>
        </div>

        <div className="dp-auth-card fade-in-up" style={{ animationDelay: "60ms" }}>
          {!ready ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-[var(--muted)]">
              <svg className="animate-spin h-6 w-6 text-[var(--accent)]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Проверяем приглашение…</span>
            </div>
          ) : (
            <>
              {/* Step progress */}
              <div className="flex items-center gap-2 mb-6">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex-1 flex items-center gap-2">
                    <div
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i <= stepIndex ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"
                      }`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs font-medium text-[var(--muted)] mb-5">
                Шаг {stepIndex + 1} из {STEPS.length} — {STEP_LABELS[step]}
              </p>

              {/* ── Step: name ──────────────────────────── */}
              {step === "name" && (
                <form
                  onSubmit={(e) => { e.preventDefault(); goNext(); }}
                  className="space-y-5"
                >
                  <div>
                    <label htmlFor="full-name" className="block text-sm font-medium text-[var(--text)] mb-1.5">
                      Как вас зовут?
                    </label>
                    <input
                      id="full-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Иван Иванов"
                      required
                      autoFocus
                      maxLength={100}
                      className="field-input"
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]/25">
                      <span className="text-sm text-[var(--danger)]">{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!fullName.trim()}
                    className="dp-btn-primary w-full min-h-[52px] rounded-xl text-base"
                  >
                    Далее
                  </button>
                </form>
              )}

              {/* ── Step: position ──────────────────────── */}
              {step === "position" && (
                <form
                  onSubmit={(e) => { e.preventDefault(); goNext(); }}
                  className="space-y-5"
                >
                  <div>
                    <label htmlFor="position" className="block text-sm font-medium text-[var(--text)] mb-1.5">
                      Должность
                      <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">(необязательно)</span>
                    </label>
                    <input
                      id="position"
                      type="text"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      placeholder="Начальник склада"
                      autoFocus
                      maxLength={100}
                      className="field-input"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={goBack}
                      className="dp-btn-secondary px-5"
                    >
                      Назад
                    </button>
                    <button
                      type="submit"
                      className="dp-btn-primary flex-1 min-h-[52px] rounded-xl text-base"
                    >
                      Далее
                    </button>
                  </div>
                </form>
              )}

              {/* ── Step: password ──────────────────────── */}
              {step === "password" && (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-[var(--text)] mb-1.5">
                      Новый пароль
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Минимум 8 символов"
                      required
                      minLength={8}
                      autoFocus
                      autoComplete="new-password"
                      className="field-input"
                    />
                    {password.length > 0 && (
                      <div className="mt-2">
                        <div className="h-1 w-full bg-[var(--surface-3)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                            style={{ width: strengthWidth }}
                          />
                        </div>
                        <p className={`text-xs mt-1 ${strength.score >= 4 ? "text-[var(--success)]" : strength.score >= 3 ? "text-[var(--warning)]" : "text-[var(--danger)]"}`}>
                          {strength.label}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="confirm" className="block text-sm font-medium text-[var(--text)] mb-1.5">
                      Подтвердите пароль
                    </label>
                    <input
                      id="confirm"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Повторите пароль"
                      required
                      autoComplete="new-password"
                      className="field-input"
                    />
                    {confirm.length > 0 && password !== confirm && (
                      <p className="text-xs text-[var(--danger)] mt-1">Пароли не совпадают</p>
                    )}
                    {confirm.length > 0 && password === confirm && password.length >= 8 && (
                      <p className="text-xs text-[var(--success)] mt-1">✓ Пароли совпадают</p>
                    )}
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]/25">
                      <svg className="w-4 h-4 text-[var(--danger)] shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-[var(--danger)]">{error}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={goBack}
                      disabled={loading}
                      className="dp-btn-secondary px-5"
                    >
                      Назад
                    </button>
                    <button
                      type="submit"
                      disabled={loading || password.length < 8 || password !== confirm}
                      className="dp-btn-primary flex-1 min-h-[52px] rounded-xl text-base"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Сохранение…
                        </span>
                      ) : "Войти в систему"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
