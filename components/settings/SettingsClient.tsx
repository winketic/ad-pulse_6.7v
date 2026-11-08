"use client";

import { useState } from "react";
import SettingsTabs, { type TabId } from "./SettingsTabs";
import ProfileCard from "./ProfileCard";
import CompanySettings from "./CompanySettings";
import UserManagement from "./UserManagement";
import WhatsAppCard from "./WhatsAppCard";
import TelegramCard from "./TelegramCard";
import type { UserRow } from "@/app/(dashboard)/dashboard/settings/actions";

interface SettingsClientProps {
  // Profile
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
  // Company
  companyName: string;
  telegramConnected: boolean;
  // WhatsApp (свой шлюз)
  isConnected: boolean;
  phoneNumber: string | null;
  // Users
  users: UserRow[];
  // Meta
  isAdmin: boolean;
  canEditCompany: boolean;
  initialTab: TabId;
  // Threshold alerts section (server-rendered slot)
  thresholdSection?: React.ReactNode;
}

export default function SettingsClient({
  fullName, email, roleLabel, roleBg, roleText,
  position, userId, companyId, avatarUrl, bannerColor,
  companyName, telegramConnected,
  isConnected, phoneNumber,
  users, isAdmin, canEditCompany,
  initialTab, thresholdSection,
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-display text-[var(--text)]">Настройки</h1>
      </div>

      <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ── Профиль ───────────────────────────────────── */}
      {activeTab === "profile" && (
        <>
          <ProfileCard
            fullName={fullName}
            email={email}
            roleLabel={roleLabel}
            roleBg={roleBg}
            roleText={roleText}
            position={position}
            userId={userId}
            companyId={companyId}
            avatarUrl={avatarUrl}
            bannerColor={bannerColor}
          />
        </>
      )}

      {/* ── Компания ──────────────────────────────────── */}
      {activeTab === "company" && (
        <div className="space-y-4">
          <CompanySettings
            companyId={companyId}
            companyName={companyName}
            canEdit={canEditCompany}
          />

          <WhatsAppCard
            isConnected={isConnected}
            phoneNumber={phoneNumber}
            isAdmin={isAdmin}
          />

          {companyId && (
            <TelegramCard
              companyId={companyId}
              telegramConnected={telegramConnected}
              isAdmin={isAdmin}
            />
          )}

          {thresholdSection}
        </div>
      )}

      {/* ── Команда ───────────────────────────────────── */}
      {activeTab === "team" && (
        companyId ? (
          <UserManagement
            users={users}
            currentUserId={userId}
            isAdmin={isAdmin}
          />
        ) : (
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] py-12 text-center">
            <p className="text-sm text-[var(--muted)]">Компания не найдена</p>
          </div>
        )
      )}
    </div>
  );
}
