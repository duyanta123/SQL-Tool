import type { DatabaseSchemaSnapshot, SchemaTable } from '@/types/database';
import type { ERColumn, ERGraph, ERGraphEdge, ERGraphNode, JoinCondition } from '@/types/er-diagram';

export function buildDatabaseSchemaGraph(snapshot: DatabaseSchemaSnapshot | null, selectedTableIds: string[]): ERGraph {
  if (!snapshot) return { nodes: [], edges: [] };
  const selected = new Set(selectedTableIds);
  const tables = snapshot.tables.filter(table => selected.has(table.id));
  const tableIds = new Set(tables.map(table => table.id));
  const nodes: ERGraphNode[] = tables.map(table => ({
    id: nodeId(table.id),
    kind: 'table' as const,
    tableName: table.name,
    displayName: table.schema ? `${table.schema}.${table.name}` : table.name,
    tableType: table.kind === 'view' ? 'view' : 'physical',
    columns: columnsFromTable(table),
    source: 'database' as const,
    statementId: 'database-schema',
    comment: table.comment,
  }));
  const edges: ERGraphEdge[] = [];
  for (const table of tables) {
    for (const foreignKey of table.foreignKeys) {
      if (!tableIds.has(foreignKey.referencedTableId)) continue;
      const conditions: JoinCondition[] = foreignKey.columns.map((column, index) => ({
        leftTable: table.id,
        leftColumn: column,
        rightTable: foreignKey.referencedTableId,
        rightColumn: foreignKey.referencedColumns[index] ?? '',
        operator: '=',
      }));
      const allUnique = foreignKey.columns.every(column => table.columns.some(item => item.name.toLowerCase() === column.toLowerCase() && (item.isUnique || item.isPrimaryKey)));
      edges.push({
        id: `schema-edge::${table.id}::${foreignKey.id}`,
        source: nodeId(table.id),
        target: nodeId(foreignKey.referencedTableId),
        kind: 'join',
        joinType: 'FK',
        cardinality: allUnique ? '1:1' : 'N:1',
        cardinalityBasis: allUnique ? 'unique-foreign-key' : 'foreign-key',
        conditions,
        sourceColumns: foreignKey.columns,
        targetColumns: foreignKey.referencedColumns,
        conditionSQL: conditions.map(condition => `${condition.leftTable}.${condition.leftColumn} = ${condition.rightTable}.${condition.rightColumn}`).join(' AND '),
        highConfidence: true,
      });
    }
  }
  return { nodes, edges };
}

function nodeId(tableId: string): string {
  return `database::${tableId}`;
}

function columnsFromTable(table: SchemaTable): ERColumn[] {
  return table.columns.map(column => {
    // 列名比较统一大小写不敏感，与 er-builder 的 columnsFromDatabaseTable 规则一致
    const foreignKey = table.foreignKeys.find(key => key.columns.some(name => name.toLowerCase() === column.name.toLowerCase()));
    const index = foreignKey?.columns.findIndex(name => name.toLowerCase() === column.name.toLowerCase()) ?? -1;
    return {
      name: column.name,
      type: column.type || 'unknown',
      source: 'database',
      isPK: column.isPrimaryKey,
      isFK: !!foreignKey,
      isUnique: column.isUnique,
      nullable: column.nullable,
      fkRefTable: foreignKey?.referencedTableId,
      fkRefColumn: index >= 0 ? foreignKey?.referencedColumns[index] : undefined,
      comment: column.comment,
    };
  });
}
