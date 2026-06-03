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
  admin: { bg: "bg-purple-100", text: "text-purple-700" },
  manager: { bg: "bg-blue-100", text: "text-blue-700" },
  warehouse: { bg: "bg-amber-100", text: "text-amber-700" },
  workshop: { bg: "bg-green-100", text: "text-green-700" },
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
        await inviteUserByEmail(inviteEmail.trim(), inviteRole);
        setInviteEmail("");
        setInviteRole("warehouse");
        setShowInvite(false);
        flash("Пользователь добавлен в компанию");
      } catch (e) {
        flash(e instanceof Error ? e.message : "Ошибка", true);
      }
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Пользователи</h2>
          <p className="text-xs text-gray-400 mt-0.5">{users.length} участников</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-lg bg-[#1a472a] text-white text-xs font-medium hover:bg-[#1a472a]/90 transition-colors"
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
        <div className={`mx-5 mt-4 px-3 py-2.5 rounded-lg text-sm ${actionError ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {actionError || actionSuccess}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="px-5 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
          <p className="text-xs font-semibold text-gray-700">Добавить пользователя</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#1a472a]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Роль</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#1a472a]"
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
              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending || !inviteEmail.trim()}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-lg bg-[#1a472a] text-white text-sm font-medium hover:bg-[#1a472a]/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Добавление…" : "Добавить"}
            </button>
          </div>
        </form>
      )}

      {/* User list */}
      {users.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-400">Пользователей нет</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {users.map((user) => {
            const isMe = user.id === currentUserId;
            const isRemoving = removingId === user.id;
            const isEditingRole = editingRoleId === user.id;

            return (
              <div key={user.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-[#1a472a]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[#1a472a] text-sm font-semibold uppercase">
                      {(user.full_name ?? user.email).charAt(0)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.full_name ?? user.email}
                        {isMe && <span className="ml-1 text-xs text-gray-400">(вы)</span>}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>

                    {/* Role */}
                    <div className="mt-2">
                      {isAdmin && !isMe && isEditingRole ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={roleValues[user.id] ?? user.role}
                            onChange={(e) => setRoleValues((prev) => ({ ...prev, [user.id]: e.target.value }))}
                            className="px-2 py-1.5 border border-gray-200 rounded-md text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#1a472a]"
                          >
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleRoleSave(user.id)}
                            disabled={isPending}
                            className="text-xs text-[#1a472a] font-medium hover:underline disabled:opacity-50"
                          >
                            Сохранить
                          </button>
                          <button
                            onClick={() => setEditingRoleId(null)}
                            className="text-xs text-gray-400 hover:underline"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <RoleBadge role={user.role} />
                          {isAdmin && !isMe && (
                            <button
                              onClick={() => setEditingRoleId(user.id)}
                              className="text-[10px] text-gray-400 hover:text-[#1a472a] hover:underline"
                            >
                              изменить
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Remove confirm */}
                    {isRemoving && (
                      <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
                        <p className="text-xs text-red-700 mb-2">
                          Удалить пользователя из компании?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setRemovingId(null)}
                            className="px-3 py-1.5 min-h-[36px] rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Отмена
                          </button>
                          <button
                            onClick={() => handleRemove(user.id)}
                            disabled={isPending}
                            className="px-3 py-1.5 min-h-[36px] rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {isPending ? "Удаление…" : "Удалить"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Remove button */}
                  {isAdmin && !isMe && !isRemoving && (
                    <button
                      onClick={() => setRemovingId(user.id)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                      title="Удалить из компании"
                    >
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
}
