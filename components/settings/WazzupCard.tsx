"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { disconnectWazzup, saveWazzupConfig } from "@/app/(dashboard)/dashboard/settings/actions";

interface WazzupCardProps {
  isConnected: boolean;
  expiresAt: string | null;
  flash: string | null;
  hasConfig: boolean;
  configEmail: string | null;
  configClientId: string | null;
  isAdmin: boolean;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Partner credentials form (desktop-only) ────────────────

function CredentialsForm({
  hasConfig,
  configEmail,
  configClientId,
}: {
  hasConfig: boolean;
  configEmail: string | null;
  configClientId: string | null;
}) {
  const [editing, setEditing] = useState(!hasConfig);
  const [email, setEmail] = useState(configEmail ?? "");
  const [password, setPassword] = useState("");
  const [clientId, setClientId] = useState(configClientId ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await saveWazzupConfig(email, password, clientId);
        setEditing(false);
        setPassword("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  if (!editing && hasConfig) {
    return (
      <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 mb-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500">Партнёрский аккаунт Wazzup</p>
          <p className="text-sm text-gray-800 font-mono mt-0.5 truncate">{configEmail}</p>
          {configClientId && (
            <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">
              Client ID: {configClientId}
            </p>
          )}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-gray-400 hover:text-[#1a472a] transition-colors ml-3 shrink-0"
        >
          Изменить
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Client ID партнёра Wazzup
        </label>
        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="2083-9002"
          required
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#1a472a]"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Email партнёрского аккаунта Wazzup
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="partner@example.com"
          required
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#1a472a]"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Пароль партнёрского аккаунта
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={hasConfig ? "Оставьте пустым, чтобы не менять" : "••••••••"}
          required={!hasConfig}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#1a472a]"
        />
      </div>
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex gap-2">
        {hasConfig && (
          <button
            type="button"
            onClick={() => { setEditing(false); setPassword(""); setError(""); }}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Отмена
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-1.5 rounded-lg bg-[#1a472a] text-white text-xs font-semibold hover:bg-[#1a472a]/90 disabled:opacity-50 transition-colors"
        >
          {pending ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

// ── Main card ──────────────────────────────────────────────

export default function WazzupCard({
  isConnected,
  expiresAt,
  flash,
  hasConfig,
  configEmail,
  configClientId,
  isAdmin,
}: WazzupCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState("");
  const [showFlash, setShowFlash] = useState(!!flash);

  useEffect(() => {
    if (!flash) return;
    setShowFlash(true);
    const timer = setTimeout(() => {
      setShowFlash(false);
      router.replace("/dashboard/settings");
    }, 5000);
    return () => clearTimeout(timer);
  }, [flash, router]);

  const handleDisconnect = useCallback(() => {
    setError("");
    startTransition(async () => {
      try {
        await disconnectWazzup();
        router.refresh();
        setConfirmDisconnect(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка отключения");
      }
    });
  }, [router]);

  const isSuccess = flash === "connected";
  const isError = flash === "error";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Flash message */}
      {showFlash && (isSuccess || isError) && (
        <div
          className={`flex items-center gap-3 px-5 py-3.5 border-b ${
            isSuccess
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <svg
            className={`w-4 h-4 shrink-0 ${
              isSuccess ? "text-green-600" : "text-red-500"
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            {isSuccess ? (
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            ) : (
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            )}
          </svg>
          <span
            className={`text-sm font-medium ${
              isSuccess ? "text-green-800" : "text-red-700"
            }`}
          >
            {isSuccess
              ? "WhatsApp успешно подключён к вашей компании"
              : "Не удалось подключить WhatsApp. Попробуйте снова"}
          </span>
          <button
            onClick={() => setShowFlash(false)}
            className="ml-auto p-0.5 rounded text-gray-400 hover:text-gray-600"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Card header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#25D366]/10 flex items-center justify-center">
          <WhatsAppIcon className="w-5 h-5 text-[#25D366]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            WhatsApp через Wazzup
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Подключите WhatsApp для получения сообщений
          </p>
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-5">
        {isConnected ? (
          // ── Connected state ─────────────────────────────
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 shrink-0">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  WhatsApp подключён
                </p>
                {expiresAt && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Токен действителен до:{" "}
                    <span className="text-gray-600">
                      {new Date(expiresAt).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Disconnect */}
            {confirmDisconnect ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-800 flex-1">
                  Отключить WhatsApp? Получение сообщений прекратится.
                </p>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    disabled={isPending}
                    className="px-3.5 py-1.5 rounded-lg text-sm border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={isPending}
                    className="px-3.5 py-1.5 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {isPending && (
                      <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {isPending ? "Отключение..." : "Да, отключить"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDisconnect(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-red-300 hover:text-red-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Отключить
              </button>
            )}
          </div>
        ) : (
          // ── Disconnected state ──────────────────────────
          <div>
            {/* Credentials form — desktop only, admin only */}
            {isAdmin && (
              <div className="hidden md:block">
                <p className="text-xs font-medium text-gray-500 mb-3">
                  Шаг 1 — Укажите данные партнёрского аккаунта Wazzup
                </p>
                <CredentialsForm hasConfig={hasConfig} configEmail={configEmail} configClientId={configClientId} />
                <p className="text-xs font-medium text-gray-500 mb-3">
                  Шаг 2 — Подключите WhatsApp аккаунт
                </p>
              </div>
            )}

            {/* Mobile notice (non-admin or mobile) */}
            {isAdmin && (
              <div className="md:hidden flex items-start gap-2 mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-amber-700">
                  Настройка подключения доступна только с компьютера
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 shrink-0">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  WhatsApp не подключён
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Авторизуйтесь через партнёрский кабинет Wazzup
                </p>
              </div>
            </div>

            <a
              href={hasConfig || !isAdmin ? "/api/wazzup/connect" : "#"}
              onClick={!hasConfig && isAdmin ? (e) => e.preventDefault() : undefined}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors shadow-sm ${
                hasConfig || !isAdmin
                  ? "bg-[#25D366] hover:bg-[#1ebe5c]"
                  : "bg-gray-300 cursor-not-allowed"
              }`}
              title={!hasConfig && isAdmin ? "Сначала сохраните данные партнёрского аккаунта" : undefined}
            >
              <WhatsAppIcon className="w-4 h-4" />
              Подключить WhatsApp через Wazzup
            </a>
            {!hasConfig && isAdmin && (
              <p className="mt-2 text-xs text-gray-400 hidden md:block">
                Сначала укажите данные партнёрского аккаунта выше
              </p>
            )}
          </div>
        )}

        {/* Action error */}
        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
