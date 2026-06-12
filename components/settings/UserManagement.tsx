"use client";

import { useState, useTransition } from "react";
import {
  updateUserRole,
  removeUserFromCompany,
  inviteUserByEmail,
  type UserRow,
} from "@/app/(dashboard)/dashboard/settings/actions";

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
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Пользователи</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">{users.length} участников</p>
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
        <form onSubmit={handleInvite} className="px-5 py-4 border-b border-[var(--border)] bg-[var(--bg3)] space-y-3">
          <p className="text-xs font-semibold text-[var(--muted)]">Добавить пользователя</p>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="w-full px-3 py-2.5 border border-[var(--border)] rounded-lg text-sm bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#00f5c4]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Роль</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full px-3 py-2.5 border border-[var(--border)] rounded-lg text-sm bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#00f5c4]"
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
              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted)] hover:bg-[var(--bg3)] transition-colors"
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
          <p className="text-sm text-[var(--muted)]">Пользователей нет</p>
        </div>
      ) : (() => {
        const sorted = [...users].sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));

        const RoleEdit = ({ user }: { user: UserRow }) => {
          const isEditingRole = editingRoleId === user.id;
          const isSelf = user.id === currentUserId;
          if (!isEditingRole) return (
            <div className="flex items-center gap-2 flex-wrap">
              <RoleBadge role={user.role} />
              {isAdmin && !isSelf && (
                <button onClick={() => setEditingRoleId(user.id)}
                  className="text-[10px] text-[var(--muted)] hover:text-[#00f5c4] hover:underline">
                  изменить
                </button>
              )}
            </div>
          );
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <select value={roleValues[user.id] ?? user.role}
                onChange={(e) => setRoleValues((prev) => ({ ...prev, [user.id]: e.target.value }))}
                className="px-2 py-1.5 border border-[var(--border)] rounded-md text-xs bg-[var(--bg3)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[#00f5c4]">
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={() => handleRoleSave(user.id)} disabled={isPending}
                className="text-xs text-[#00f5c4] font-medium hover:underline disabled:opacity-50">Сохранить</button>
              <button onClick={() => setEditingRoleId(null)}
                className="text-xs text-[var(--muted)] hover:underline">Отмена</button>
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
          <div className="divide-y divide-[var(--border)]">
            {sorted.map((user) => {
              const isMe = user.id === currentUserId;
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
                      <p className="text-sm font-medium text-[var(--text)] truncate">
                        {user.full_name ?? user.email}
                        {isMe && <span className="ml-1 text-xs text-[var(--muted)]">(вы)</span>}
                      </p>
                      <p className="text-xs text-[var(--muted)] truncate">{user.email}</p>
                      {user.position && <p className="text-xs text-[var(--muted)] mt-0.5">{user.position}</p>}
                      <div className="mt-2"><RoleEdit user={user} /></div>
                      {isRemoving && <RemoveConfirm user={user} />}
                    </div>
                    {isAdmin && !isMe && !isRemoving && (
                      <button onClick={() => setRemovingId(user.id)}
                        className="p-1.5 rounded-lg text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
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
        );
      })()}
    </div>
  );
}
