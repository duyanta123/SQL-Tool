import type { ERColumn } from '@/types/er-diagram';
import type { TableInfo } from './tables';

export interface ColumnInfo {
  tableId: string;
  columns: ERColumn[];
}

export function inferColumnsFromJoin(
  tables: TableInfo[],
  joins: Array<{
    sourceTable: string;
    targetTable: string;
    sourceColumns: string[];
    targetColumns: string[];
  }>
): Map<string, ERColumn[]> {
  const columnMap = new Map<string, ERColumn[]>();

  for (const t of tables) {
    const cols: ERColumn[] = [];
    if (t.tableType === 'physical') {
      // Add inferred id column
      cols.push({ name: 'id', type: 'int', isPK: true, isFK: false });
    }
    columnMap.set(t.id, cols);
  }

  // Infer FK columns from joins
  for (const j of joins) {
    const targetCols = columnMap.get(j.targetTable) ?? [];
    const sourceCols = columnMap.get(j.sourceTable) ?? [];

    for (let i = 0; i < j.sourceColumns.length; i++) {
      const sCol = j.sourceColumns[i];
      const tCol = j.targetColumns[i];
      if (!sCol || !tCol) continue;

      // Target column is likely FK referencing source
      const existingT = targetCols.find(c => c.name === tCol);
      const sourceTableName = tables.find(t => t.id === j.sourceTable)?.tableName ?? j.sourceTable;
      if (existingT) {
        existingT.isFK = true;
        existingT.fkRefTable = sourceTableName;
        existingT.fkRefColumn = sCol;
      } else {
        targetCols.push({
          name: tCol,
          type: 'int',
          isPK: false,
          isFK: true,
          fkRefTable: sourceTableName,
          fkRefColumn: sCol,
        });
      }

      // Source column might be PK if it's named id
      if (sCol.toLowerCase() === 'id') {
        const existingS = sourceCols.find(c => c.name === sCol);
        if (existingS) {
          existingS.isPK = true;
        } else {
          sourceCols.push({ name: sCol, type: 'int', isPK: true, isFK: false });
        }
      }
    }

    columnMap.set(j.sourceTable, sourceCols);
    columnMap.set(j.targetTable, targetCols);
  }

  return columnMap;
}

export function mergeDDLColumns(
  tableId: string,
  ddlColumns: ERColumn[],
  inferredColumns: ERColumn[]
): ERColumn[] {
  if (ddlColumns.length > 0) return ddlColumns;
  return inferredColumns;
}

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
