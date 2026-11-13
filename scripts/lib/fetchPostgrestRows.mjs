export async function fetchPostgrestRows(baseUrl, key, table, selectOrQuery, options = {}) {
  const pageSize = options.pageSize || 1000;
  const rows = [];
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`rest/v1/${table}`, normalizedBase);
    if (typeof selectOrQuery === 'string' && selectOrQuery.includes('=')) {
      const searchParams = new URLSearchParams(selectOrQuery);
      for (const [k, v] of searchParams.entries()) {
        url.searchParams.set(k, v);
      }
    } else {
      url.searchParams.set('select', selectOrQuery);
      if (options.order) url.searchParams.set('order', options.order);
      if (options.filter) url.searchParams.set(options.filter[0], options.filter[1]);
    }
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Range-Unit': 'items',
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (response.status === 416) return rows;
    if (!response.ok) {
      if (response.status === 404 && table === 'series_weekly_movers') {
        console.warn('Weekly movers view is not deployed; generating a feed without mover entries.');
        return [];
      }
      throw new Error(`${table} returned HTTP ${response.status}`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`${table} returned an invalid response`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
