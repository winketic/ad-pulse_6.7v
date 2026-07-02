"use client";

import { useState, useEffect, useCallback } from "react";

// Detects network errors (fetch failure, no connection) vs server errors.
// Returns true if the error looks like a network issue.
export function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("load failed") ||
      msg.includes("networkerror")
    );
  }
  return false;
}

// Key prefix for localStorage pending items
const STORAGE_PREFIX = "adpulse_pending_";

export type PendingItem<T> = {
  key: string;
  payload: T;
  label: string; // human-readable description shown in retry banner
  savedAt: number;
};

export function savePending<T>(key: string, payload: T, label: string) {
  try {
    const item: PendingItem<T> = { key, payload, label, savedAt: Date.now() };
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(item));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

export function loadPending<T>(key: string): PendingItem<T> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as PendingItem<T>) : null;
  } catch {
    return null;
  }
}

export function clearPending(key: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}

// Hook: watches navigator.onLine and returns current status.
// Useful for disabling submit buttons when offline.
export function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}
