"use client";

import { useState } from "react";
import { activateAccount } from "./actions";

export default function WelcomeForm({
  defaultCompany,
  defaultContact,
}: {
  defaultCompany: string;
  defaultContact: string;
}) {
  const [company, setCompany] = useState(defaultCompany);
  const [contact, setContact] = useState(defaultContact);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await activateAccount({ company_name: company, contact_name: contact });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать компанию.");
      setLoading(false);
    }
  };

  return (
    <div className="dp-auth-card">
      <h2 className="text-lg font-semibold text-[var(--text)] mb-1">Ваша компания</h2>
      <p className="text-sm text-[var(--muted)] mb-6">
        Сразу после этого включится пилот на 30 дней: все функции, без карты.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Название компании</label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            maxLength={160}
            className="dp-input"
            placeholder="ТОО «Стройматериалы»"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Ваше имя</label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            required
            maxLength={120}
            className="dp-input"
            placeholder="Иван Петров"
          />
        </div>
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
        )}
        <button type="submit" disabled={loading} className="dp-btn-primary w-full py-2.5">
          {loading ? "Создаём компанию…" : "Начать пилот"}
        </button>
      </form>
    </div>
  );
}
