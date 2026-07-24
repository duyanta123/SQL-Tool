export interface UpdateInfo {
  targetTableId: string;
  targetTableName: string;
}

export function extractUpdate(update: any): UpdateInfo {
  const table = update.table;
  const tableName = typeof table === 'object'
    ? (table.table ?? table.name ?? '')
    : table;
  const db = typeof table === 'object' ? table.db : undefined;
  const targetId = db ? `${db}.${tableName}` : tableName;

  return {
    targetTableId: targetId,
    targetTableName: tableName,
  };
}
