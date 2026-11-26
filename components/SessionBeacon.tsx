"use client";

import { useEffect } from "react";

const KEY = "adpulse.session-ping.v1";

/**
 * Один запрос на сессию: сообщает серверу IP и устройство входа. Сервер
 * заводит запись в user_devices и пишет письмо, если пара IP+устройство новая.
 * Сбой запроса не влияет на работу приложения.
 */
export default function SessionBeacon() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {
      return;
    }

    fetch("/api/auth/session", { method: "POST", cache: "no-store" })
      .then(() => {
        try { sessionStorage.setItem(KEY, "1"); } catch { /* приватный режим */ }
      })
      .catch(() => { /* сеть недоступна — не блокируем интерфейс */ });
  }, []);

  return null;
}
