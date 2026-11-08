/** Состояние сессии WhatsApp для одной компании. */
export type SessionStatus =
  | "starting"
  | "qr"          // ждём сканирования QR клиентом
  | "connecting"
  | "open"        // подключено, сообщения идут
  | "closed"      // соединение оборвано, идёт переподключение
  | "logged_out"  // клиент отвязал устройство или WhatsApp разлогинил
  | "failed";     // непоправимая ошибка

export interface SessionMeta {
  companyId: string;
  status: SessionStatus;
  /** QR в виде data:image/png;base64,... — отдаётся в UI */
  qr: string | null;
  /** Номер, к которому привязана сессия (после успешного подключения) */
  phoneNumber: string | null;
  /** Имя профиля WhatsApp */
  pushName: string | null;
  connectedAt: string | null;
  updatedAt: string;
  lastError: string | null;
}

/** Чат в списке выбора — то, что видит клиент в настройках. */
export interface ChatInfo {
  /** Стабильный идентификатор: 79001234567@s.whatsapp.net или 1203...@g.us */
  jid: string;
  /** Название: для группы — название группы, для личного — имя контакта */
  name: string;
  isGroup: boolean;
  /** Телефон для личных чатов (только цифры) */
  phone: string | null;
  lastMessageAt: number | null;
  unreadCount: number;
}

/** Нормализованное входящее сообщение — то, что уходит вебхуком в AD Pulse. */
export interface InboundMessage {
  message_id: string;
  company_id: string;
  chat_id: string;
  chat_name: string;
  chat_type: "whatsapp" | "whatsgroup";
  sender_name: string | null;
  sender_phone: string | null;
  text: string | null;
  content_type: "text" | "voice" | "image" | "document" | "other";
  media_url: string | null;
  media_mimetype: string | null;
  media_name: string | null;
  timestamp: number;
}

export interface WebhookPayload {
  event: "message.add";
  provider: "adpulse-gateway";
  data: InboundMessage[];
  meta: { idempotency_key: string; timestamp: number };
}

/** Событие смены состояния сессии — чтобы приложение узнавало об отвязке номера. */
export interface SessionStatusMessage {
  company_id: string;
  status: SessionStatus;
  phone_number: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface SessionStatusPayload {
  event: "session.status";
  provider: "adpulse-gateway";
  data: SessionStatusMessage[];
  meta: { idempotency_key: string; timestamp: number };
}

export type WebhookEvent = WebhookPayload | SessionStatusPayload;
