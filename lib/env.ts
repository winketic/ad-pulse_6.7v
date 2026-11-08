/**
 * Чтение секретов из окружения.
 *
 * Переменные на Vercel часто копируют из мессенджеров и дашбордов. Вместе со
 * значением приезжает невидимый BOM (U+FEFF). В заголовке `Authorization:
 * Bearer <token>` он валит fetch: «Cannot convert argument to a ByteString
 * because the character at index 7 has a value of 65279».
 *
 * Проверено на практике: так молча не работал весь GPT-разбор сообщений и
 * распознавание фото — падал только fetch, а ошибка глоталась в catch.
 *
 * Поэтому все секреты читаем через этот помощник: только печатные ASCII.
 */
export function readSecret(name: string): string {
  return (process.env[name] ?? "").replace(/[^\x21-\x7E]/g, "");
}

/** Есть ли переменная (после очистки). */
export function hasSecret(name: string): boolean {
  return readSecret(name).length > 0;
}
