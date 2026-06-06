import { createServiceClient } from "@/lib/supabase/service";

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log(`[telegram] TELEGRAM_BOT_TOKEN not set — skip send to ${chatId}`);
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[telegram] sendMessage error [${res.status}]: ${body}`);
  }
}

export async function sendTelegramAlert(companyId: string, message: string): Promise<void> {
  const service = createServiceClient();
  const { data } = await service
    .from("companies")
    .select("telegram_chat_id, telegram_connected")
    .eq("id", companyId)
    .single();

  if (data?.telegram_connected && data?.telegram_chat_id) {
    await sendTelegramMessage(data.telegram_chat_id, message);
  }
}
