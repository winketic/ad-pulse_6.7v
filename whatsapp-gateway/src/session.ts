import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  Browsers,
  type WASocket,
  type proto,
  type Chat,
  type Contact,
} from "baileys";
import QRCode from "qrcode";
import { config } from "./config";
import { logger } from "./logger";
import { authDir, loadChats, mergeChats, saveChats, saveMeta, clearSession } from "./store";
import { saveMediaBuffer } from "./media";
import { deliverMessages, deliverSessionStatus } from "./webhook";
import type { ChatInfo, InboundMessage, SessionMeta, SessionStatus } from "./types";

const log = logger("session");

/** Baileys принимает pino-подобный логгер; уводим его вывод в наш. */
const baileysLogger = (() => {
  const self: Record<string, unknown> = {
    level: config.logLevel,
    child: () => self,
    trace: (o: unknown, m?: string) => log.trace(typeof m === "string" ? m : "", o),
    debug: (o: unknown, m?: string) => log.debug(typeof m === "string" ? m : "", o),
    info: (o: unknown, m?: string) => log.debug(typeof m === "string" ? m : "", o),
    warn: (o: unknown, m?: string) => log.warn(typeof m === "string" ? m : "", o),
    error: (o: unknown, m?: string) => log.error(typeof m === "string" ? m : "", o),
    fatal: (o: unknown, m?: string) => log.error(typeof m === "string" ? m : "", o),
  };
  return self;
})();

const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * Защита от «лавины истории»: при первом подключении WhatsApp отдаёт старые
 * сообщения, и без фильтра они превратились бы в десятки вымышленных
 * транзакций по материалам. Всё старше суток игнорируем — свежие офлайн-
 * сообщения при этом проходят (клиент мог быть не в сети несколько часов).
 */
const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000;

function jidToPhone(jid: string): string | null {
  const user = jid.split("@")[0]?.split(":")[0] ?? "";
  return /^\d{6,20}$/.test(user) ? user : null;
}

function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

function isIgnoredJid(jid: string): boolean {
  return (
    !jid ||
    jid === "status@broadcast" ||
    jid.endsWith("@broadcast") ||
    jid.endsWith("@newsletter") ||
    jid.endsWith("@lid")
  );
}

/** Развернуть обёртки (исчезающие сообщения, view-once, документ с подписью и т.п.). */
function unwrapMessage(message: proto.IMessage | null | undefined): proto.IMessage | null {
  let current = message ?? null;
  for (let depth = 0; depth < 4 && current; depth++) {
    const wrapper =
      current.ephemeralMessage?.message ??
      current.viewOnceMessage?.message ??
      current.viewOnceMessageV2?.message ??
      current.documentWithCaptionMessage?.message ??
      null;
    if (!wrapper) return current;
    current = wrapper;
  }
  return current;
}

type ContentType = InboundMessage["content_type"];

function extractContent(message: proto.IMessage): {
  text: string | null;
  contentType: ContentType;
  mediaNode: proto.Message.IImageMessage | proto.Message.IAudioMessage | proto.Message.IDocumentMessage | proto.Message.IVideoMessage | null;
  mimetype: string | null;
  filename: string | null;
} {
  const textOf = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const imageNode = message.imageMessage ?? null;
  const audioNode = message.audioMessage ?? null;
  const docNode = message.documentMessage ?? null;
  const videoNode = message.videoMessage ?? null;

  if (imageNode) {
    return {
      text: textOf(imageNode.caption),
      contentType: "image",
      mediaNode: imageNode,
      mimetype: imageNode.mimetype ?? "image/jpeg",
      filename: null,
    };
  }
  if (audioNode) {
    return {
      text: null,
      contentType: "voice",
      mediaNode: audioNode,
      mimetype: audioNode.mimetype ?? "audio/ogg",
      filename: null,
    };
  }
  if (docNode) {
    return {
      text: textOf(docNode.caption),
      contentType: "document",
      mediaNode: docNode,
      mimetype: docNode.mimetype ?? "application/octet-stream",
      filename: docNode.fileName ?? null,
    };
  }
  if (videoNode) {
    return {
      text: textOf(videoNode.caption),
      contentType: "other",
      mediaNode: videoNode,
      mimetype: videoNode.mimetype ?? "video/mp4",
      filename: null,
    };
  }

  const text =
    textOf(message.conversation) ??
    textOf(message.extendedTextMessage?.text) ??
    textOf(message.buttonsResponseMessage?.selectedDisplayText) ??
    textOf(message.listResponseMessage?.title) ??
    textOf(message.templateButtonReplyMessage?.selectedDisplayText) ??
    null;

  return { text, contentType: "text", mediaNode: null, mimetype: null, filename: null };
}

export class WhatsAppSession {
  readonly companyId: string;
  private sock: WASocket | null = null;
  private meta: SessionMeta;
  private chats = new Map<string, ChatInfo>();
  private contactNames = new Map<string, string>();
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private chatsDirty = false;
  private chatsFlushTimer: NodeJS.Timeout | null = null;

  constructor(companyId: string, meta?: SessionMeta | null) {
    this.companyId = companyId;
    this.meta = meta ?? {
      companyId,
      status: "starting",
      qr: null,
      phoneNumber: null,
      pushName: null,
      connectedAt: null,
      updatedAt: new Date().toISOString(),
      lastError: null,
    };
  }

  getMeta(): SessionMeta {
    return { ...this.meta };
  }

  async init(): Promise<void> {
    const cached = await loadChats(this.companyId);
    for (const chat of cached) this.chats.set(chat.jid, chat);
    await this.connect();
  }

  private async setStatus(status: SessionStatus, patch: Partial<SessionMeta> = {}): Promise<void> {
    const previous = this.meta.status;
    this.meta = {
      ...this.meta,
      ...patch,
      status,
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveMeta(this.meta);
    } catch (err) {
      log.warn(`не удалось сохранить статус сессии ${this.companyId}`, err);
    }

    // Сообщаем приложению только о значимых переходах. «closed» не шлём:
    // это транзитное состояние, мы сразу переподключаемся сами.
    const isSignificant =
      status === "open" || status === "logged_out" || status === "failed";
    if (isSignificant && previous !== status) {
      void deliverSessionStatus({
        company_id: this.companyId,
        status,
        phone_number: this.meta.phoneNumber,
        last_error: this.meta.lastError,
        updated_at: this.meta.updatedAt,
      }).catch((err) => log.warn(`статус сессии не доставлен ${this.companyId}`, err));
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(authDir(this.companyId));
      // Если сервер версий недоступен — стартуем с версией из библиотеки.
      const latest = await fetchLatestBaileysVersion().catch(() => null);

      const sock = makeWASocket({
        auth: state,
        ...(latest ? { version: latest.version } : {}),
        logger: baileysLogger as never,
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: config.syncHistory,
        markOnlineOnConnect: false,
        getMessage: async () => undefined,
      });

      this.sock = sock;
      sock.ev.on("creds.update", saveCreds);
      sock.ev.on("connection.update", (update) => {
        void this.onConnectionUpdate(update).catch((err) =>
          log.error(`connection.update ${this.companyId}`, err)
        );
      });
      sock.ev.on("messages.upsert", (event) => {
        void this.onMessagesUpsert(event).catch((err) =>
          log.error(`messages.upsert ${this.companyId}`, err)
        );
      });
      sock.ev.on("messaging-history.set", (event) => {
        void this.onHistorySync(event).catch((err) =>
          log.error(`messaging-history.set ${this.companyId}`, err)
        );
      });
      sock.ev.on("chats.upsert", (chats) => this.onChatsUpsert(chats, false));
      sock.ev.on("chats.update", (chats) => this.onChatsUpsert(chats, true));
      sock.ev.on("contacts.upsert", (contacts) => this.onContacts(contacts));
      sock.ev.on("contacts.update", (contacts) => this.onContacts(contacts));

      log.info(`сессия ${this.companyId}: подключение запущено`);
    } catch (err) {
      log.error(`не удалось стартовать сессию ${this.companyId}`, err);
      await this.setStatus("failed", { lastError: (err as Error).message });
    }
  }

  private async onConnectionUpdate(update: {
    connection?: string;
    lastDisconnect?: { error?: unknown };
    qr?: string;
  }): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      await this.setStatus("qr", { qr: dataUrl, lastError: null });
      log.info(`сессия ${this.companyId}: QR готов, ждём сканирования`);
      return;
    }

    if (connection === "connecting") {
      await this.setStatus(this.meta.status === "open" ? "open" : "connecting");
      return;
    }

    if (connection === "open") {
      this.reconnectAttempt = 0;
      const me = this.sock?.user;
      const phone = me?.id ? jidToPhone(me.id) : null;
      await this.setStatus("open", {
        qr: null,
        phoneNumber: phone,
        pushName: me?.name ?? me?.verifiedName ?? null,
        connectedAt: this.meta.connectedAt ?? new Date().toISOString(),
        lastError: null,
      });
      log.info(`сессия ${this.companyId}: подключено как ${phone ?? "?"}`);
      return;
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      const isLoggedOut = code === DisconnectReason.loggedOut || code === 401;

      if (isLoggedOut) {
        log.warn(`сессия ${this.companyId}: устройство отвязано (${code})`);
        await this.setStatus("logged_out", {
          qr: null,
          phoneNumber: null,
          lastError: "WhatsApp отвязал устройство — требуется повторное сканирование QR",
        });
        await clearSession(this.companyId).catch(() => undefined);
        return;
      }

      this.reconnectAttempt++;
      const delay = Math.min(1_000 * 2 ** (this.reconnectAttempt - 1), RECONNECT_MAX_DELAY_MS);
      await this.setStatus("closed", {
        lastError: `соединение оборвано (${code ?? "unknown"}), переподключение через ${Math.round(delay / 1000)}с`,
      });
      log.warn(`сессия ${this.companyId}: обрыв (${code}), переподключение #${this.reconnectAttempt}`);

      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        void this.connect();
      }, delay);
    }
  }

  private onChatsUpsert(chats: Array<Partial<Chat>>, isUpdate: boolean): void {
    const incoming: ChatInfo[] = [];
    for (const chat of chats) {
      const jid = typeof chat.id === "string" ? chat.id : "";
      if (isIgnoredJid(jid)) continue;

      const isGroup = isGroupJid(jid);
      // Для групп Baileys кладёт название группы в name — отдельного subject в актуальном типе нет.
      const name = (chat.name ?? "").trim();
      const prev = this.chats.get(jid);

      // На chats.update Baileys присылает только изменившиеся поля — не теряем имя.
      if (isUpdate && !name && !prev) continue;

      incoming.push({
        jid,
        name: name || prev?.name || this.fallbackName(jid),
        isGroup,
        phone: isGroup ? null : jidToPhone(jid),
        lastMessageAt: chat.conversationTimestamp
          ? Number(chat.conversationTimestamp) * 1000
          : prev?.lastMessageAt ?? null,
        unreadCount: chat.unreadCount ?? prev?.unreadCount ?? 0,
      });
    }
    if (incoming.length > 0) this.applyChats(incoming);
  }

  private onContacts(contacts: Array<Partial<Contact>>): void {
    let changed = false;
    for (const contact of contacts) {
      const jid = typeof contact.id === "string" ? contact.id : "";
      if (!jid || isGroupJid(jid) || isIgnoredJid(jid)) continue;
      const name = (contact.name ?? contact.notify ?? "").trim();
      if (!name) continue;
      if (this.contactNames.get(jid) !== name) {
        this.contactNames.set(jid, name);
        changed = true;
      }
    }
    if (!changed) return;

    // Обновляем имена личных чатов, у которых своего названия нет.
    const patched: ChatInfo[] = [];
    for (const [jid, chat] of this.chats) {
      if (chat.isGroup) continue;
      const contactName = this.contactNames.get(jid);
      if (contactName && chat.name !== contactName) {
        patched.push({ ...chat, name: contactName });
      }
    }
    if (patched.length > 0) this.applyChats(patched);
  }

  private async onHistorySync(event: {
    chats?: Array<Partial<Chat>>;
    contacts?: Array<Partial<Contact>>;
  }): Promise<void> {
    this.onContacts(event.contacts ?? []);
    this.onChatsUpsert(event.chats ?? [], false);
    log.info(
      `сессия ${this.companyId}: история синхронизирована, чатов всего ${this.chats.size}`
    );
  }

  private applyChats(incoming: ChatInfo[]): void {
    const merged = mergeChats([...this.chats.values()], incoming);
    this.chats = new Map(merged.map((c) => [c.jid, c]));
    this.scheduleChatsFlush();
  }

  /** Запись на диск с задержкой — history sync присылает чаты пачками. */
  private scheduleChatsFlush(): void {
    this.chatsDirty = true;
    if (this.chatsFlushTimer) return;
    this.chatsFlushTimer = setTimeout(() => {
      this.chatsFlushTimer = null;
      if (!this.chatsDirty) return;
      this.chatsDirty = false;
      void saveChats(this.companyId, [...this.chats.values()]).catch((err) =>
        log.warn(`не удалось сохранить чаты ${this.companyId}`, err)
      );
    }, 2_000);
  }

  private fallbackName(jid: string): string {
    if (isGroupJid(jid)) return `Группа ${jidToPhone(jid) ?? jid}`;
    const phone = jidToPhone(jid);
    return phone ? `+${phone}` : jid;
  }

  private resolveChatName(jid: string, pushName: string | null): string {
    const known = this.chats.get(jid)?.name?.trim();
    if (known) return known;
    const contactName = this.contactNames.get(jid)?.trim();
    if (contactName) return contactName;
    if (pushName?.trim()) return pushName.trim();
    return this.fallbackName(jid);
  }

  getChats(): ChatInfo[] {
    return [...this.chats.values()]
      .filter((c) => !isIgnoredJid(c.jid))
      .map((c) => ({
        ...c,
        name: c.isGroup ? c.name : this.contactNames.get(c.jid) ?? c.name,
      }))
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  }

  private async onMessagesUpsert(event: {
    messages: proto.IWebMessageInfo[];
    type: string;
  }): Promise<void> {
    if (event.type !== "notify" && event.type !== "append") return;

    const outbound: InboundMessage[] = [];

    for (const raw of event.messages) {
      try {
        const message = await this.normalize(raw);
        if (message) outbound.push(message);
      } catch (err) {
        log.error(`не удалось разобрать сообщение ${this.companyId}`, err);
      }
    }

    if (outbound.length > 0) await deliverMessages(outbound);
  }

  private async normalize(raw: proto.IWebMessageInfo): Promise<InboundMessage | null> {
    const key = raw.key;
    if (!key?.remoteJid || isIgnoredJid(key.remoteJid)) return null;
    // Нас интересует только входящий поток: исходящие клиент пишет сам.
    if (key.fromMe) return null;
    // Групповые сообщения вне watched-чатов отсекает приложение — здесь не фильтруем,
    // иначе клиент не увидит новый чат в списке выбора.

    const body = unwrapMessage(raw.message);
    if (!body) return null;

    const rawTimestamp = raw.messageTimestamp
      ? Number(raw.messageTimestamp) * 1000
      : Date.now();
    if (Date.now() - rawTimestamp > MAX_MESSAGE_AGE_MS) return null;

    const jid = key.remoteJid;
    const isGroup = isGroupJid(jid);
    const pushName = typeof raw.pushName === "string" ? raw.pushName : null;
    const content = extractContent(body);

    let mediaUrl: string | null = null;
    let mediaMimetype: string | null = content.mimetype;
    let mediaName: string | null = content.filename;

    if (content.mediaNode && config.mediaEnabled) {
      try {
        const buffer = (await downloadMediaMessage(
          raw,
          "buffer",
          {},
          {
            logger: baileysLogger as never,
            reuploadRequest: this.sock?.updateMediaMessage,
          } as never
        )) as Buffer;

        const saved = await saveMediaBuffer(
          this.companyId,
          buffer,
          content.mimetype ?? "application/octet-stream",
          content.filename
        );
        mediaUrl = saved.url;
        mediaMimetype = saved.mimetype;
        mediaName = saved.name;
      } catch (err) {
        log.warn(`не удалось скачать медиа ${this.companyId}`, err);
      }
    }

    const senderJid = isGroup ? key.participant ?? jid : jid;
    const timestamp = rawTimestamp;

    const messageId = key.id ?? `${jid}-${timestamp}`;
    const chatName = this.resolveChatName(jid, pushName);

    this.applyChats([
      {
        jid,
        name: chatName,
        isGroup,
        phone: isGroup ? null : jidToPhone(jid),
        lastMessageAt: timestamp,
        unreadCount: 0,
      },
    ]);

    return {
      message_id: messageId,
      company_id: this.companyId,
      chat_id: jid,
      chat_name: chatName,
      chat_type: isGroup ? "whatsgroup" : "whatsapp",
      sender_name: pushName,
      sender_phone: jidToPhone(senderJid),
      text: content.text,
      content_type: content.contentType,
      media_url: mediaUrl,
      media_mimetype: mediaMimetype,
      media_name: mediaName,
      timestamp,
    };
  }

  async logout(): Promise<void> {
    try {
      await this.sock?.logout();
    } catch (err) {
      log.warn(`logout ${this.companyId}`, err);
    }
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.sock = null;
    await clearSession(this.companyId).catch(() => undefined);
    this.chats.clear();
    await this.setStatus("logged_out", {
      qr: null,
      phoneNumber: null,
      lastError: null,
    });
  }

  /** Полный останов без отвязки устройства — для graceful shutdown. */
  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.chatsFlushTimer) clearTimeout(this.chatsFlushTimer);
    void saveChats(this.companyId, [...this.chats.values()]).catch(() => undefined);
    try {
      this.sock?.end(undefined);
    } catch {
      /* сокет уже закрыт */
    }
    this.sock = null;
  }
}
