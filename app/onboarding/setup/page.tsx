"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { addSetupMaterial, inviteSetupMember, markSetupCompleted } from "./actions";

const UNITS = ["кг", "тонна", "шт", "м3", "м2", "литр", "пог.м", "тн"];
const ROLES = [
  { value: "manager", label: "Менеджер" },
  { value: "warehouse", label: "Кладовщик" },
  { value: "workshop", label: "Мастер цеха" },
];
const TOTAL_STEPS = 3;

const STEP_TITLES = [
  "Добавьте материалы",
  "WhatsApp интеграция",
  "Пригласите команду",
];
const STEP_SUBS = [
  "Укажите материалы вашего производства — система будет их отслеживать.",
  "Подключите WhatsApp для автоматического учёта сообщений кладовщиков.",
  "Добавьте сотрудников — они получат письмо для входа в систему.",
];

type AddedMaterial = { id: string; name: string; unit: string };
type InvitedMember = { email: string; role: string };

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [finishing, setFinishing] = useState(false);
  const router = useRouter();

  // Step 1 state
  const [matName, setMatName] = useState("");
  const [matUnit, setMatUnit] = useState("кг");
  const [matAdding, setMatAdding] = useState(false);
  const [matError, setMatError] = useState("");
  const [addedMats, setAddedMats] = useState<AddedMaterial[]>([]);

  // Step 3 state
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState("warehouse");
  const [invSending, setInvSending] = useState(false);
  const [invError, setInvError] = useState("");
  const [invitedMembers, setInvitedMembers] = useState<InvitedMember[]>([]);

  async function handleAddMaterial() {
    if (!matName.trim()) { setMatError("Введите название материала"); return; }
    setMatError("");
    setMatAdding(true);
    const res = await addSetupMaterial(matName.trim(), matUnit);
    setMatAdding(false);
    if ("error" in res) { setMatError(res.error); return; }
    setAddedMats((prev) => [...prev, { id: res.id, name: matName.trim(), unit: matUnit }]);
    setMatName("");
  }

  async function handleInvite() {
    if (!invEmail.trim()) { setInvError("Введите email"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invEmail.trim())) { setInvError("Некорректный email"); return; }
    setInvError("");
    setInvSending(true);
    const res = await inviteSetupMember(invEmail.trim(), invRole);
    setInvSending(false);
    if ("error" in res) { setInvError(res.error); return; }
    setInvitedMembers((prev) => [...prev, { email: invEmail.trim(), role: invRole }]);
    setInvEmail("");
  }

  async function handleFinish() {
    setFinishing(true);
    await markSetupCompleted();
    router.replace("/dashboard");
  }

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#05050a" }}>
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Logo size={48} />
          <p className="text-sm mt-3" style={{ color: "#9ca3af" }}>Настройка AD Pulse</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: "#0d0d14", borderColor: "#1f1f2e" }}>

          {/* Progress */}
          <div className="h-1 w-full" style={{ background: "#1f1f2e" }}>
            <div className="h-full transition-all duration-500"
              style={{ width: `${progress}%`, background: "#00f5c4" }} />
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-between px-6 pt-5 pb-1">
            <div className="flex gap-2">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full transition-all duration-300"
                  style={{ background: i + 1 <= step ? "#00f5c4" : "#2a2a3d" }} />
              ))}
            </div>
            <span className="text-xs" style={{ color: "#6b7280" }}>
              Шаг {step} из {TOTAL_STEPS}
            </span>
          </div>

          <div className="px-6 pb-6 pt-4">
            <h1 className="text-xl font-bold mb-1" style={{ color: "#f9fafb" }}>
              {STEP_TITLES[step - 1]}
            </h1>
            <p className="text-sm mb-6" style={{ color: "#6b7280" }}>
              {STEP_SUBS[step - 1]}
            </p>

            {/* ── Step 1: Materials ───────────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={matName}
                    onChange={(e) => setMatName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddMaterial()}
                    placeholder="Цемент М400"
                    autoFocus
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: "#1a1a2e", border: "1px solid #2a2a3d", color: "#f9fafb" }}
                    onFocus={(e) => { e.target.style.borderColor = "#00f5c4"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#2a2a3d"; }}
                  />
                  <select
                    value={matUnit}
                    onChange={(e) => setMatUnit(e.target.value)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: "#1a1a2e", border: "1px solid #2a2a3d", color: "#f9fafb", minWidth: "80px" }}
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                {matError && (
                  <p className="text-xs" style={{ color: "#f87171" }}>{matError}</p>
                )}
                <button
                  onClick={handleAddMaterial}
                  disabled={matAdding}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                  style={{ background: "#1a1a2e", color: "#00f5c4", border: "1px solid #2a2a3d" }}
                >
                  {matAdding ? "Добавляем…" : "+ Добавить материал"}
                </button>

                {addedMats.length > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1f1f2e" }}>
                    {addedMats.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-4 py-2.5"
                        style={{ borderBottom: "1px solid #1f1f2e" }}>
                        <span className="text-sm" style={{ color: "#f9fafb" }}>{m.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(0,245,196,0.1)", color: "#00f5c4" }}>
                          {m.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {addedMats.length === 0 && (
                  <p className="text-xs text-center" style={{ color: "#4b5563" }}>
                    Можно добавить позже в разделе «Материалы»
                  </p>
                )}
              </div>
            )}

            {/* ── Step 2: WhatsApp ─────────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="rounded-xl p-4 space-y-3" style={{ background: "#1a1a2e", border: "1px solid #2a2a3d" }}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(0,245,196,0.1)" }}>
                      <svg className="w-4 h-4" style={{ color: "#00f5c4" }} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#f9fafb" }}>Wazzup интеграция</p>
                      <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
                        Кладовщики пишут в WhatsApp — AD Pulse автоматически фиксирует приход/расход материалов без ручного ввода.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2" style={{ borderTop: "1px solid #2a2a3d" }}>
                    {["Парсит входящие сообщения", "Создаёт транзакции автоматически", "Отправляет алерты в Telegram"].map((feat) => (
                      <div key={feat} className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 shrink-0" style={{ color: "#00f5c4" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs" style={{ color: "#9ca3af" }}>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-center" style={{ color: "#4b5563" }}>
                  Настройку можно завершить позже в разделе «Настройки → WhatsApp»
                </p>
              </div>
            )}

            {/* ── Step 3: Team ─────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    placeholder="ivan@company.kz"
                    autoFocus
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: "#1a1a2e", border: "1px solid #2a2a3d", color: "#f9fafb" }}
                    onFocus={(e) => { e.target.style.borderColor = "#00f5c4"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#2a2a3d"; }}
                  />
                  <select
                    value={invRole}
                    onChange={(e) => setInvRole(e.target.value)}
                    className="px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: "#1a1a2e", border: "1px solid #2a2a3d", color: "#f9fafb" }}
                  >
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                {invError && <p className="text-xs" style={{ color: "#f87171" }}>{invError}</p>}
                <button
                  onClick={handleInvite}
                  disabled={invSending}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                  style={{ background: "#1a1a2e", color: "#00f5c4", border: "1px solid #2a2a3d" }}
                >
                  {invSending ? "Отправляем…" : "Отправить приглашение"}
                </button>

                {invitedMembers.length > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1f1f2e" }}>
                    {invitedMembers.map((m, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5"
                        style={{ borderBottom: "1px solid #1f1f2e" }}>
                        <span className="text-sm" style={{ color: "#f9fafb" }}>{m.email}</span>
                        <span className="text-xs" style={{ color: "#00f5c4" }}>
                          {ROLES.find((r) => r.value === m.role)?.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {invitedMembers.length === 0 && (
                  <p className="text-xs text-center" style={{ color: "#4b5563" }}>
                    Пригласить команду можно в любое время в «Настройках»
                  </p>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className={`flex gap-3 mt-6`}>
              {step > 1 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="py-3 px-5 rounded-xl text-sm font-medium"
                  style={{ background: "#1a1a2e", color: "#9ca3af", border: "1px solid #2a2a3d" }}
                >
                  ← Назад
                </button>
              )}
              {step < TOTAL_STEPS ? (
                <>
                  <button
                    onClick={() => setStep((s) => s + 1)}
                    className="flex-1 py-3 rounded-xl text-sm font-medium"
                    style={{ background: "#1a1a2e", color: "#9ca3af", border: "1px solid #2a2a3d" }}
                  >
                    Пропустить
                  </button>
                  <button
                    onClick={() => setStep((s) => s + 1)}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold"
                    style={{ background: "#00f5c4", color: "#05050a" }}
                  >
                    Далее →
                  </button>
                </>
              ) : (
                <button
                  onClick={handleFinish}
                  disabled={finishing}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "#00f5c4", color: "#05050a" }}
                >
                  {finishing ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Сохраняем…
                    </>
                  ) : "Завершить настройку →"}
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "#374151" }}>
          Все настройки можно изменить позже в разделе «Настройки»
        </p>
      </div>
    </div>
  );
}
