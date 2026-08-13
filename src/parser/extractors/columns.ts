import type { ERColumn } from '@/types/er-diagram';

export function mergeColumnsByPriority(
  ddlColumns: ERColumn[] = [],
  databaseColumns: ERColumn[] = [],
  inferredColumns: ERColumn[] = [],
): ERColumn[] {
  const merged = new Map<string, ERColumn>();
  for (const column of inferredColumns) merged.set(column.name.toLowerCase(), { ...column, source: column.source ?? 'sql-inferred' });
  for (const column of databaseColumns) merged.set(column.name.toLowerCase(), { ...column, source: 'database' });
  for (const column of ddlColumns) merged.set(column.name.toLowerCase(), { ...column, source: 'ddl' });
  return [...merged.values()];
}
