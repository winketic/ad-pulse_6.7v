"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";

const TOTAL_STEPS = 4;

const STEP_TITLES = [
  "Как вас зовут?",
  "Ваша должность",
  "Установите пароль",
  "Добро пожаловать!",
];

const STEP_SUBTITLES = [
  "Введите ваше полное имя — оно будет видно коллегам",
  "Укажите вашу должность в компании",
  "Придумайте надёжный пароль для входа в систему",
  "Вот что вы можете делать в AD Pulse",
];

const ROLE_FEATURES: Record<string, { icon: string; text: string }[]> = {
  admin: [
    { icon: "⚙️", text: "Управлять пользователями и настройками" },
    { icon: "📦", text: "Справочник материалов — добавлять, редактировать" },
    { icon: "📊", text: "Отчёты, планы и все транзакции" },
    { icon: "💬", text: "Подключить WhatsApp и Telegram" },
  ],
  manager: [
    { icon: "📊", text: "Производственные планы — создавать и контролировать" },
    { icon: "📋", text: "Отчёты с экспортом в Excel" },
    { icon: "📦", text: "Полный учёт движения материалов" },
    { icon: "💡", text: "Аналитика остатков в реальном времени" },
  ],
  warehouse: [
    { icon: "➕", text: "Фиксировать приход материалов" },
    { icon: "➖", text: "Отмечать расход и брак" },
    { icon: "🔄", text: "Оформлять возврат" },
    { icon: "📱", text: "Отправлять данные через WhatsApp" },
  ],
  workshop: [
    { icon: "➖", text: "Учитывать расход материалов цеха" },
    { icon: "📋", text: "Смотреть производственные планы" },
    { icon: "📱", text: "Отправлять данные через WhatsApp" },
  ],
};

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>("warehouse");
  const router = useRouter();
  const supabase = createClient();

  function nextStep() {
    setError("");
    if (step === 1) {
      if (!fullName.trim()) { setError("Введите ваше имя"); return; }
    }
    setStep((s) => s + 1);
  }

  async function handleFinish() {
    setError("");
    if (password.length < 8) { setError("Минимум 8 символов"); return; }
    if (password !== confirmPassword) { setError("Пароли не совпадают"); return; }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Сессия истекла — войдите снова."); setLoading(false); return; }

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        position: position.trim() || null,
      })
      .eq("id", user.id);

    if (profileErr) {
      setError("Ошибка обновления профиля: " + profileErr.message);
      setLoading(false);
      return;
    }

    const { error: pwErr } = await supabase.auth.updateUser({ password });
    if (pwErr) {
      setError("Ошибка установки пароля: " + pwErr.message);
      setLoading(false);
      return;
    }

    // Fetch role for welcome step
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    setUserRole(profileData?.role ?? "warehouse");
    setLoading(false);
    setStep(4);
  }

  const progressPct = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#05050a" }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Logo size={48} />
          <p className="text-sm mt-3" style={{ color: "#9ca3af" }}>AD Pulse</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: "#0d0d14", borderColor: "#1f1f2e" }}>

          {/* Progress bar */}
          <div className="h-1 w-full" style={{ background: "#1f1f2e" }}>
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: "#00f5c4" }}
            />
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-between px-6 pt-5 pb-1">
            <div className="flex gap-2">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full transition-all duration-300"
                  style={{
                    background: i + 1 <= step ? "#00f5c4" : "#2a2a3d",
                  }}
                />
              ))}
            </div>
            <span className="text-xs" style={{ color: "#6b7280" }}>
              Шаг {step} из {TOTAL_STEPS}
            </span>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 pt-4">
            <h1 className="text-xl font-bold mb-1" style={{ color: "#f9fafb" }}>
              {STEP_TITLES[step - 1]}
            </h1>
            <p className="text-sm mb-6" style={{ color: "#6b7280" }}>
              {STEP_SUBTITLES[step - 1]}
            </p>

            {/* Step 1 — Name */}
            {step === 1 && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#d1d5db" }}>
                  Полное имя <span style={{ color: "#00f5c4" }}>*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && nextStep()}
                  placeholder="Иван Иванов"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: "#1a1a2e",
                    border: "1px solid #2a2a3d",
                    color: "#f9fafb",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "#00f5c4"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#2a2a3d"; }}
                />
              </div>
            )}

            {/* Step 2 — Position */}
            {step === 2 && (
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "#d1d5db" }}>
                  Должность
                  <span className="ml-2 text-xs font-normal" style={{ color: "#6b7280" }}>(необязательно)</span>
                </label>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && nextStep()}
                  placeholder="Начальник склада"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: "#1a1a2e",
                    border: "1px solid #2a2a3d",
                    color: "#f9fafb",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "#00f5c4"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#2a2a3d"; }}
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  {["Начальник склада", "Менеджер", "Директор", "Мастер цеха"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPosition(p)}
                      className="px-3 py-1.5 rounded-lg text-xs transition-all"
                      style={{
                        background: position === p ? "#00f5c4" : "#1a1a2e",
                        color: position === p ? "#05050a" : "#9ca3af",
                        border: `1px solid ${position === p ? "#00f5c4" : "#2a2a3d"}`,
                        fontWeight: position === p ? 600 : 400,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3 — Password */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "#d1d5db" }}>
                    Новый пароль <span style={{ color: "#00f5c4" }}>*</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Минимум 8 символов"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: "#1a1a2e",
                      border: "1px solid #2a2a3d",
                      color: "#f9fafb",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "#00f5c4"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#2a2a3d"; }}
                  />
                  {password.length > 0 && (
                    <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "#1a1a2e" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((password.length / 12) * 100, 100)}%`,
                          background: password.length < 8 ? "#ef4444" : password.length < 12 ? "#f59e0b" : "#00f5c4",
                        }}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "#d1d5db" }}>
                    Подтвердите пароль <span style={{ color: "#00f5c4" }}>*</span>
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Повторите пароль"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: "#1a1a2e",
                      border: `1px solid ${confirmPassword && confirmPassword !== password ? "#ef4444" : "#2a2a3d"}`,
                      color: "#f9fafb",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = confirmPassword && confirmPassword !== password ? "#ef4444" : "#00f5c4";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = confirmPassword && confirmPassword !== password ? "#ef4444" : "#2a2a3d";
                    }}
                  />
                  {confirmPassword && confirmPassword === password && password.length >= 8 && (
                    <p className="text-xs mt-1.5" style={{ color: "#00f5c4" }}>✓ Пароли совпадают</p>
                  )}
                </div>
              </div>
            )}

            {/* Step 4 — Role welcome */}
            {step === 4 && (
              <div className="space-y-3">
                {(ROLE_FEATURES[userRole] ?? ROLE_FEATURES.warehouse).map((feat, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "#1a1a2e", border: "1px solid #2a2a3d" }}>
                    <span className="text-xl">{feat.icon}</span>
                    <span className="text-sm" style={{ color: "#d1d5db" }}>{feat.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 px-4 py-3 rounded-xl text-sm" style={{ background: "#2d1515", color: "#f87171", border: "1px solid #3d1f1f" }}>
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className={`flex gap-3 mt-6 ${step > 1 ? "flex-row" : ""}`}>
              {step > 1 && step < 4 && (
                <button
                  onClick={() => { setStep((s) => s - 1); setError(""); }}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                  style={{ background: "#1a1a2e", color: "#9ca3af", border: "1px solid #2a2a3d" }}
                >
                  ← Назад
                </button>
              )}
              {step < 3 ? (
                <button
                  onClick={nextStep}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "#00f5c4", color: "#05050a" }}
                >
                  Далее →
                </button>
              ) : step === 3 ? (
                <button
                  onClick={handleFinish}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "#00f5c4", color: "#05050a" }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Сохраняем...
                    </>
                  ) : "Далее →"}
                </button>
              ) : (
                <button
                  onClick={() => router.replace("/dashboard")}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "#00f5c4", color: "#05050a" }}
                >
                  Начать работу →
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "#374151" }}>
          Это займёт меньше минуты
        </p>
      </div>
    </div>
  );
}
