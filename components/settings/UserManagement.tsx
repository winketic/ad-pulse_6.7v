"use client";

import { useState, useTransition } from "react";
import {
  updateUserRole,
  removeUserFromCompany,
  inviteUserByEmail,
  type UserRow,
} from "@/app/(dashboard)/dashboard/settings/actions";
import FireBanner from "./FireBanner";

const ROLES = [
  { value: "admin", label: "Администратор" },
  { value: "manager", label: "Менеджер" },
  { value: "warehouse", label: "Склад" },
  { value: "workshop", label: "Цех" },
];

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: "bg-purple-500/15 border border-purple-500/20", text: "text-purple-300" },
  manager: { bg: "bg-blue-500/15 border border-blue-500/20", text: "text-blue-300" },
  warehouse: { bg: "bg-amber-500/15 border border-amber-500/20", text: "text-amber-300" },
  workshop: { bg: "bg-emerald-500/15 border border-emerald-500/20", text: "text-emerald-300" },
};

const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  manager: 1,
  warehouse: 2,
  workshop: 3,
};

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLORS[role] ?? ROLE_COLORS.warehouse;
  const label = ROLES.find((r) => r.value === role)?.label ?? role;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {label}
    </span>
  );
}

interface UserManagementProps {
  users: UserRow[];
  currentUserId: string;
  isAdmin: boolean;
}

export default function UserManagement({
  users,
  currentUserId,
  isAdmin,
}: UserManagementProps) {
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleValues, setRoleValues] = useState<Record<string, string>>(
    Object.fromEntries(users.map((u) => [u.id, u.role]))
  );

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("warehouse");

  const flash = (msg: string, isError = false) => {
    if (isError) { setActionError(msg); setActionSuccess(""); }
    else { setActionSuccess(msg); setActionError(""); }
    setTimeout(() => { setActionError(""); setActionSuccess(""); }, 4000);
  };

  const handleRoleSave = (userId: string) => {
    startTransition(async () => {
      try {
        await updateUserRole(userId, roleValues[userId]);
        setEditingRoleId(null);
        flash("Роль обновлена");
      } catch (e) {
        flash(e instanceof Error ? e.message : "Ошибка", true);
      }
    });
  };

  const handleRemove = (userId: string) => {
    startTransition(async () => {
      try {
        await removeUserFromCompany(userId);
        setRemovingId(null);
        flash("Пользователь удалён из компании");
      } catch (e) {
        flash(e instanceof Error ? e.message : "Ошибка", true);
        setRemovingId(null);
      }
    });
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const result = await inviteUserByEmail(inviteEmail.trim(), inviteRole);
        if ("error" in result) {
          flash(result.error, true);
          return;
        }
        setInviteEmail("");
        setInviteRole("warehouse");
        setShowInvite(false);
        if (!result.emailSent) {
          flash("Пользователь добавлен. Письмо не отправлено — отправьте ссылку вручную.");
        } else {
          flash("Приглашение отправлено на email");
        }
      } catch (e) {
        flash(e instanceof Error ? e.message : "Ошибка", true);
      }
    });
  };

  return (
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#ededed]">Пользователи</h2>
          <p className="text-xs text-[#888888] mt-0.5">{users.length} участников</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-lg bg-[#00f5c4] text-[#0a0a0a] text-xs font-medium hover:bg-[#00ddb3] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Добавить
          </button>
        )}
      </div>

      {/* Flash messages */}
      {(actionError || actionSuccess) && (
        <div className={`mx-5 mt-4 px-3 py-2.5 rounded-lg text-sm ${actionError ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-[#00f5c4]/10 border border-[#00f5c4]/20 text-[#00f5c4]"}`}>
          {actionError || actionSuccess}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="px-5 py-4 border-b border-[#1f1f1f] bg-[#161616] space-y-3">
          <p className="text-xs font-semibold text-[#888888]">Добавить пользователя</p>
          <div>
            <label className="block text-xs text-[#888888] mb-1">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="w-full px-3 py-2.5 border border-[#1f1f1f] rounded-lg text-sm bg-[#111111] focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#00f5c4]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#888888] mb-1">Роль</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#1f1f1f] rounded-lg text-sm bg-[#111111] focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#00f5c4]"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-[#1f1f1f] text-sm text-[#888888] hover:bg-[#1f1f1f] transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending || !inviteEmail.trim()}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg bg-[#00f5c4] text-[#0a0a0a] text-sm font-medium hover:bg-[#00ddb3] disabled:opacity-50 transition-colors"
            >
              {isPending ? "Добавление…" : "Добавить"}
            </button>
          </div>
        </form>
      )}

      {/* User list */}
      {users.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[#888888]">Пользователей нет</p>
        </div>
      ) : (() => {
        const sorted = [...users].sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));
        const meUser = sorted.find((u) => u.id === currentUserId) ?? null;
        const otherCards = sorted.filter(
          (u) => u.id !== currentUserId &&
            (u.avatar_url !== null || (u.banner_color !== null && u.banner_color !== "#00f5c4"))
        );
        const rowUsers = sorted.filter(
          (u) => u.id !== currentUserId &&
            u.avatar_url === null && (u.banner_color === null || u.banner_color === "#00f5c4")
        );

        const RoleEdit = ({ user }: { user: UserRow }) => {
          const isEditingRole = editingRoleId === user.id;
          const isSelf = user.id === currentUserId;
          if (!isEditingRole) return (
            <div className="flex items-center gap-2 flex-wrap">
              <RoleBadge role={user.role} />
              {isAdmin && !isSelf && (
                <button onClick={() => setEditingRoleId(user.id)}
                  className="text-[10px] text-[#888888] hover:text-[#00f5c4] hover:underline">
                  изменить
                </button>
              )}
            </div>
          );
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <select value={roleValues[user.id] ?? user.role}
                onChange={(e) => setRoleValues((prev) => ({ ...prev, [user.id]: e.target.value }))}
                className="px-2 py-1.5 border border-[#1f1f1f] rounded-md text-xs bg-[#161616] text-[#ededed] focus:outline-none focus:ring-1 focus:ring-[#00f5c4]">
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={() => handleRoleSave(user.id)} disabled={isPending}
                className="text-xs text-[#00f5c4] font-medium hover:underline disabled:opacity-50">Сохранить</button>
              <button onClick={() => setEditingRoleId(null)}
                className="text-xs text-[#888888] hover:underline">Отмена</button>
            </div>
          );
        };

        const RemoveConfirm = ({ user }: { user: UserRow }) => (
          <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-xs text-red-400 mb-2">Удалить пользователя из компании?</p>
            <div className="flex gap-2">
              <button onClick={() => setRemovingId(null)}
                className="px-3 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                Отмена
              </button>
              <button onClick={() => handleRemove(user.id)} disabled={isPending}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors">
                {isPending ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        );

        return (
          <div className="p-4 flex flex-col gap-3">

            {/* ── Current user — Discord card with fire banner ── */}
            {meUser && (
              <div className="rounded-xl bg-[#161616] border border-[#1f1f1f]">
                {/* Fire banner */}
                <div className="relative h-[80px] rounded-t-xl overflow-hidden">
                  <FireBanner />
                </div>

                {/* Content */}
                <div className="relative px-4 pb-4">
                  {/* Avatar overlapping banner */}
                  <div className="absolute -top-7 left-4">
                    {meUser.avatar_url ? (
                      <img src={meUser.avatar_url} alt={meUser.full_name ?? ""}
                        className="w-14 h-14 rounded-full object-cover ring-4 ring-[#161616]" />
                    ) : (
                      <div className="w-14 h-14 rounded-full ring-4 ring-[#161616] flex items-center justify-center text-white font-bold text-xl bg-[#2a0a3e]">
                        {(meUser.full_name ?? meUser.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Text — padded to clear avatar */}
                  <div className="pt-10">
                    <p className="text-sm font-bold text-[#ededed] truncate">
                      {meUser.full_name ?? meUser.email}
                      <span className="ml-1.5 text-xs font-normal text-[#888888]">(вы)</span>
                    </p>
                    <p className="text-xs text-[#888888] truncate mt-0.5">{meUser.email}</p>
                    {meUser.position && <p className="text-xs text-[#888888] mt-0.5">{meUser.position}</p>}
                    <div className="mt-1.5"><RoleBadge role={meUser.role} /></div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Other users with avatar/custom banner ── */}
            {otherCards.map((user) => {
              const isRemoving = removingId === user.id;
              const banner = user.banner_color ?? "#1a1a2e";
              const initials = (user.full_name ?? user.email).charAt(0).toUpperCase();
              return (
                <div key={user.id} className="group">
                  <div className="relative rounded-xl overflow-hidden" style={{ background: banner }}>
                    <div className="absolute inset-0 bg-black/45 pointer-events-none" />
                    {isAdmin && !isRemoving && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button onClick={() => setEditingRoleId(editingRoleId === user.id ? null : user.id)}
                          className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                          title="Изменить роль">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => setRemovingId(user.id)}
                          className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-red-500/80 transition-colors"
                          title="Удалить из компании">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <div className="relative z-10 flex items-center gap-3 p-4 min-h-[90px]">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.full_name ?? ""}
                          className="w-12 h-12 rounded-full object-cover ring-2 ring-white/20 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-full ring-2 ring-white/20 flex items-center justify-center text-white font-bold text-lg shrink-0 bg-white/20">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{user.full_name ?? user.email}</p>
                        <p className="text-xs text-white/60 truncate">{user.email}</p>
                        {user.position && <p className="text-xs text-white/50 truncate">{user.position}</p>}
                        <div className="mt-1.5"><RoleEdit user={user} /></div>
                      </div>
                    </div>
                  </div>
                  {isRemoving && <RemoveConfirm user={user} />}
                </div>
              );
            })}

            {/* ── Regular rows ── */}
            {rowUsers.length > 0 && (
              <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] divide-y divide-[#1f1f1f]">
                {rowUsers.map((user) => {
                  const isRemoving = removingId === user.id;
                  return (
                    <div key={user.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#00f5c4]/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[#00f5c4] text-sm font-semibold uppercase">
                            {(user.full_name ?? user.email).charAt(0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#ededed] truncate">{user.full_name ?? user.email}</p>
                          <p className="text-xs text-[#888888] truncate">{user.email}</p>
                          {user.position && <p className="text-xs text-[#888888] mt-0.5">{user.position}</p>}
                          <div className="mt-2"><RoleEdit user={user} /></div>
                          {isRemoving && <RemoveConfirm user={user} />}
                        </div>
                        {isAdmin && !isRemoving && (
                          <button onClick={() => setRemovingId(user.id)}
                            className="p-1.5 rounded-lg text-[#444444] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                            title="Удалить из компании">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
