"use client";

interface TelegramCardProps {
  companyId: string;
  telegramConnected: boolean;
  isAdmin: boolean;
}

export default function TelegramCard({ companyId, telegramConnected, isAdmin }: TelegramCardProps) {
  const code = companyId.slice(0, 8);

  return (
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#229ED9]/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-[#229ED9]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#ededed]">Уведомления в Telegram</h3>
          <p className="text-xs text-[#888888] mt-0.5">
            {telegramConnected ? "Подключён" : "Получайте алерты о материалах"}
          </p>
        </div>
        <div className="ml-auto">
          {telegramConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Подключён
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1f1f1f] text-[#888888]">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              Не подключён
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-5">
        {telegramConnected ? (
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#ededed]">Telegram подключён ✓</p>
              <p className="text-xs text-[#888888] mt-0.5">
                Вы получаете алерты о перерасходе, браке и критических остатках.
              </p>
            </div>
          </div>
        ) : isAdmin ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-[#229ED9]/5 border border-[#229ED9]/20">
              <span className="text-lg shrink-0">1</span>
              <div>
                <p className="text-sm text-[#888888]">
                  Найдите бота{" "}
                  <a
                    href="https://t.me/adpulse_alerts_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#229ED9] hover:underline"
                  >
                    @adpulse_alerts_bot
                  </a>{" "}
                  в Telegram и нажмите <strong>Start</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-[#161616] border border-[#1f1f1f]">
              <span className="text-lg shrink-0">2</span>
              <div>
                <p className="text-sm text-[#888888] mb-2">
                  Отправьте боту ваш код подключения:
                </p>
                <div className="flex items-center gap-2">
                  <code className="px-3 py-1.5 rounded-lg bg-[#05050a] text-[#00f5c4] text-base font-mono font-bold tracking-widest">
                    {code}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(code)}
                    className="p-1.5 rounded-lg text-[#888888] hover:text-[#888888] hover:bg-[#1f1f1f] transition-colors"
                    title="Скопировать"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#888888]">
            Подключение Telegram доступно только администратору.
          </p>
        )}
      </div>
    </div>
  );
}
