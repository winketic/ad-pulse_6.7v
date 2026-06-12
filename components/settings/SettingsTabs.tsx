"use client";

export type TabId = "profile" | "company" | "team";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Профиль" },
  { id: "company", label: "Компания" },
  { id: "team",    label: "Команда"  },
];

export default function SettingsTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  return (
    <div
      className="flex gap-1 p-1 rounded-xl mb-6"
      style={{ background: "var(--bg)" }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold text-center transition-all"
            style={{
              background: isActive ? "#00f5c4" : "transparent",
              color: isActive ? "#05050a" : "rgba(255,255,255,0.7)",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
