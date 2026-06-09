"use client";

import { useState, useTransition, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  updateMyProfile,
  saveAvatarUrl,
  saveBannerColor,
} from "@/app/(dashboard)/dashboard/settings/actions";

const BANNER_COLORS = [
  "#00f5c4",
  "#7b5ea7",
  "#2563eb",
  "#0891b2",
  "#dc2626",
  "#f59e0b",
  "#374151",
  "#0a0a0a",
  "linear-gradient(135deg, #00f5c4, #7b5ea7)",
  "linear-gradient(135deg, #2563eb, #7b5ea7)",
  "linear-gradient(135deg, #f59e0b, #dc2626)",
  "linear-gradient(135deg, #0891b2, #00f5c4)",
];

const inputCls =
  "w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm text-[#ededed] bg-[#111111] focus:outline-none focus:ring-2 focus:ring-[#00f5c4]/20 focus:border-[#00f5c4] transition-colors";

interface ProfileCardProps {
  fullName: string | null;
  email: string;
  roleLabel: string;
  roleBg: string;
  roleText: string;
  position: string | null;
  userId: string;
  companyId: string | null;
  avatarUrl: string | null;
  bannerColor: string | null;
}

export default function ProfileCard({
  fullName,
  email,
  roleLabel,
  roleBg,
  roleText,
  position,
  userId,
  companyId,
  avatarUrl,
  bannerColor,
}: ProfileCardProps) {
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(fullName ?? "");
  const [posVal, setPosVal] = useState(position ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Optimistic display state
  const [displayName, setDisplayName] = useState(fullName);
  const [displayPos, setDisplayPos] = useState(position);
  const [displayAvatar, setDisplayAvatar] = useState(avatarUrl);
  const [displayBanner, setDisplayBanner] = useState(bannerColor ?? "#00f5c4");
  const [avatarKey, setAvatarKey] = useState(0); // cache-bust
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const initials = (displayName ?? email ?? "U")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // ── Avatar upload ──────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) { setError("Файл слишком большой (макс. 2 MB)"); return; }
    if (!["image/jpeg", "image/png"].includes(file.type)) { setError("Только JPG и PNG"); return; }

    setUploadingAvatar(true);
    setError("");

    const ext = file.type === "image/jpeg" ? "jpg" : "png";
    const folder = companyId ?? userId;
    const path = `${folder}/${userId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setError("Ошибка загрузки: " + uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

    try {
      await saveAvatarUrl(publicUrl);
      setDisplayAvatar(publicUrl);
      setAvatarKey((k) => k + 1); // bust browser cache
    } catch {
      setError("Не удалось сохранить аватар");
    }
    setUploadingAvatar(false);
  }

  // ── Banner color ───────────────────────────────────────
  function handleColorSelect(color: string) {
    setDisplayBanner(color);
    startTransition(async () => {
      try { await saveBannerColor(color); } catch { /* non-fatal */ }
    });
  }

  // ── Profile fields ─────────────────────────────────────
  function handleCancel() {
    setNameVal(displayName ?? "");
    setPosVal(displayPos ?? "");
    setError("");
    setEditing(false);
  }

  function handleSave() {
    setError("");
    if (!nameVal.trim()) { setError("Имя не может быть пустым"); return; }
    startTransition(async () => {
      try {
        await updateMyProfile(nameVal, posVal);
        setDisplayName(nameVal.trim());
        setDisplayPos(posVal.trim() || null);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка сохранения");
      }
    });
  }

  return (
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] overflow-hidden">
      {/* ── Banner ────────────────────────────────────── */}
      <div className="h-20 pointer-events-none" style={{ background: displayBanner }} />

      {/* ── Avatar + color swatches ────────────────────── */}
      <div className="relative z-10 px-5 flex items-end gap-4 -mt-6">
        {/* Avatar */}
        <div className="relative shrink-0 group">
          {displayAvatar ? (
            <img
              key={avatarKey}
              src={`${displayAvatar}?t=${avatarKey}`}
              alt={displayName ?? ""}
              className="w-14 h-14 rounded-full object-cover ring-2 ring-white shadow-sm"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full ring-2 ring-[#1f1f1f] shadow-sm flex items-center justify-center text-white text-lg font-bold"
              style={{ background: displayBanner === "#0a0a0a" ? "#1f1f1f" : displayBanner }}
            >
              {initials}
            </div>
          )}

          {/* Camera overlay */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-wait"
            title="Загрузить фото"
          >
            {uploadingAvatar ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Banner color swatches — hidden when gradient banner is active */}
        {!displayBanner.includes("gradient") && (
          <div className="flex items-center gap-1.5 pb-1">
            {BANNER_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleColorSelect(color)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                style={{
                  background: color,
                  outline: displayBanner === color ? "2px solid #00f5c4" : "2px solid transparent",
                  outlineOffset: "2px",
                }}
                title={color}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Card header ────────────────────────────────── */}
      <div className="px-5 pt-3 pb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#ededed]">Профиль</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-[#00f5c4] hover:underline font-medium"
          >
            Изменить
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-red-50 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* ── Content ────────────────────────────────────── */}
      <div className="px-5 pb-5">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1">
                Полное имя <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                placeholder="Иван Иванов"
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1">
                Должность
                <span className="ml-1.5 text-[#888888] font-normal">(необязательно)</span>
              </label>
              <input
                type="text"
                value={posVal}
                onChange={(e) => setPosVal(e.target.value)}
                placeholder="Начальник склада"
                className={inputCls}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-[#888888] hover:bg-[#161616] transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 py-2 rounded-lg bg-[#00f5c4] text-white text-sm font-semibold hover:bg-[#163d24] transition-colors disabled:opacity-60"
              >
                {isPending ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-[#888888] mb-0.5">Полное имя</p>
              <p className="text-sm font-medium text-[#ededed]">{displayName ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#888888] mb-0.5">Email</p>
              <p className="text-sm text-[#888888] truncate">{email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#888888] mb-0.5">Роль</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${roleBg} ${roleText}`}>
                {roleLabel}
              </span>
            </div>
            {displayPos && (
              <div>
                <p className="text-xs font-medium text-[#888888] mb-0.5">Должность</p>
                <p className="text-sm text-[#888888]">{displayPos}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-[#888888] mb-0.5">ID пользователя</p>
              <p className="text-xs text-[#888888] font-mono truncate">{userId}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
