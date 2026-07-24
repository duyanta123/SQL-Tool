export interface CTEInfo {
  name: string;
  id: string;
  columns: string[];
  stmt: any;
  statementId: string;
}

export function extractCTEs(select: any, statementId: string): CTEInfo[] {
  const ctes: CTEInfo[] = [];
  if (!select.with || !Array.isArray(select.with)) return ctes;

  for (const cte of select.with) {
    const name = cte.name?.value ?? (typeof cte.name === 'string' ? cte.name : '');
    if (!name) continue;
    const columns: string[] = [];
    if (cte.columns && Array.isArray(cte.columns)) {
      for (const c of cte.columns) {
        columns.push(c.value ?? c.column ?? c);
      }
    }
    const stmt = cte.stmt?.ast ?? cte.stmt;
    ctes.push({
      name,
      id: `cte::${name}`,
      columns,
      stmt,
      statementId,
    });
  }

  return ctes;
}
