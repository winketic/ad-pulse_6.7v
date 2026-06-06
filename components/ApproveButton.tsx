"use client";

import { useState } from "react";

export function ApproveButton({ registrationId }: { registrationId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = "/admin/registrations";
      } else {
        alert("Ошибка: " + data.error);
        setLoading(false);
      }
    } catch {
      alert("Ошибка соединения. Попробуйте снова.");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleApprove}
      disabled={loading}
      style={{
        background: "#05050a",
        color: "#00f5c4",
        padding: "14px 36px",
        borderRadius: "10px",
        fontWeight: 600,
        fontSize: "15px",
        border: "none",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
        display: "block",
        margin: "24px auto 0",
        width: "100%",
      }}
    >
      {loading ? "Одобряем…" : "✓ Одобрить"}
    </button>
  );
}
