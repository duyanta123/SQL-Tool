export interface InsertInfo {
  targetTableId: string;
  targetTableName: string;
  hasSelectSource: boolean;
  isValues: boolean;
}

export function extractInsert(insert: any, _statementId: string): InsertInfo {
  const table = insert.table;
  const tableName = typeof table === 'object' ? (table.table ?? table.name ?? '') : table;
  const db = typeof table === 'object' ? table.db : undefined;
  const targetId = db ? `${db}.${tableName}` : tableName;

  const hasSelectSource = !!(
    insert.values &&
    Array.isArray(insert.values) &&
    insert.values.some((v: any) => v?.ast || v?.type === 'select')
  );
  const isValues = !hasSelectSource;

  return {
    targetTableId: targetId,
    targetTableName: tableName,
    hasSelectSource,
    isValues,
  };
}
