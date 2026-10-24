const DEFAULT_PAGE_SIZE = 1000;

/** Fetch every row from a company-scoped Supabase query in bounded pages. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(`Не удалось загрузить историю операций: ${error.message}`);

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) {
      // Короткая страница может быть не концом данных, а признаком того, что
      // сервер обрезал выдачу (db-max-rows). Проверяем пробным запросом одной
      // строки со смещением сразу за уже полученными данными.
      const probeFrom = rows.length;
      const probe = await fetchPage(probeFrom, probeFrom);
      if (probe.error) throw new Error(`Не удалось загрузить историю операций: ${probe.error.message}`);

      const probeRows = probe.data ?? [];
      if (probeRows.length > 0) {
        throw new Error("Сервер вернул меньше строк, чем запрошено: история обрезана");
      }

      return rows;
    }
  }
}
