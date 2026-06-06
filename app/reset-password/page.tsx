"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import Image from "next/image";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") setReady(true);
        if (event === "SIGNED_IN" && !ready) {
          supabase.auth.signOut();
        }
      }
    );
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Пароли не совпадают");
    if (password.length < 8) return setError("Минимум 8 символов");
    setLoading(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
    } else {
      await supabase.auth.signOut();
      router.push("/login?message=password_updated");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f4f4f5",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "-apple-system, sans-serif",
    }}>
      <div style={{ maxWidth: "400px", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <Image src="/logo.svg" width={64} height={64} alt="AD Pulse" priority />
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "12px 0 4px" }}>AD Pulse</h1>
          <p style={{ color: "#9ca3af", fontSize: "14px", margin: 0 }}>Система учёта материалов</p>
        </div>

        <div style={{
          background: "#fff",
          borderRadius: "16px",
          padding: "40px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}>
          {!ready ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#6b7280", marginBottom: "16px" }}>
                Проверяем ссылку...
              </p>
              <a href="/forgot-password" style={{ color: "#1a472a", fontSize: "14px" }}>
                Запросить новую ссылку
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 24px" }}>
                Новый пароль
              </h2>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "14px", color: "#374151", display: "block", marginBottom: "6px" }}>
                  Новый пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "15px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ fontSize: "14px", color: "#374151", display: "block", marginBottom: "6px" }}>
                  Подтвердите пароль
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Повторите пароль"
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "15px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {error && (
                <div style={{
                  background: "#fef2f2",
                  border: "1px solid #fee2e2",
                  borderRadius: "8px",
                  padding: "12px",
                  color: "#dc2626",
                  fontSize: "14px",
                  marginBottom: "16px",
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  background: "#1a472a",
                  color: "#fff",
                  padding: "14px",
                  borderRadius: "10px",
                  fontSize: "15px",
                  fontWeight: 600,
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Сохраняем..." : "Сохранить пароль"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
