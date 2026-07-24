import { AliasResolver, tableIdFromRef } from '../utils/alias-resolver';

export interface TableInfo {
  id: string;
  tableName: string;
  db?: string;
  schema?: string;
  alias?: string;
  tableType: 'physical' | 'cte' | 'subquery' | 'view';
  statementId: string;
  sqlPreview?: string;
}

let subqueryCounter = 0;

export function resetSubqueryCounter(): void {
  subqueryCounter = 0;
}

export function nextSubqueryId(): string {
  subqueryCounter += 1;
  return `subquery_${subqueryCounter}`;
}

function getTableRef(from: any): { table: string; db?: string; schema?: string; as?: string } {
  let table = '';
  if (typeof from.table === 'string') {
    table = from.table;
  } else if (from.table) {
    table = from.table.table ?? from.table.name ?? '';
  } else if (typeof from === 'object' && from.name) {
    table = from.name;
  }
  return {
    table: table || 'unknown',
    db: typeof from.db === 'string' ? from.db : from.db?.name ?? undefined,
    schema: typeof from.schema === 'string' ? from.schema : undefined,
    as: from.as ? String(from.as) : undefined,
  };
}

export function extractTablesFromStatements(statements: any[]): TableInfo[] {
  const tables: TableInfo[] = [];
  const seen = new Set<string>();

  statements.forEach((stmt, stmtIdx) => {
    const statementId = `stmt_${stmtIdx + 1}`;
    const resolver = new AliasResolver();

    if (stmt.type === 'create' && stmt.keyword === 'table') {
      const ref = getTableRef(stmt.table || stmt);
      const id = tableIdFromRef({ table: ref.table, db: ref.db, schema: ref.schema });
      if (!seen.has(id)) {
        seen.add(id);
        tables.push({
          id,
          tableName: ref.table,
          db: ref.db,
          schema: ref.schema,
          tableType: 'physical',
          statementId,
        });
      }
      return;
    }

    if (stmt.type === 'insert') {
      const ref = getTableRef(stmt.table || stmt);
      const id = tableIdFromRef({ table: ref.table, db: ref.db, schema: ref.schema });
      if (!seen.has(id)) {
        seen.add(id);
        tables.push({
          id,
          tableName: ref.table,
          db: ref.db,
          schema: ref.schema,
          alias: ref.as,
          tableType: 'physical',
          statementId,
        });
      }
    }

    if (stmt.type === 'update') {
      const ref = getTableRef(stmt.table || stmt);
      const id = tableIdFromRef({ table: ref.table, db: ref.db, schema: ref.schema });
      if (!seen.has(id)) {
        seen.add(id);
        tables.push({
          id,
          tableName: ref.table,
          db: ref.db,
          schema: ref.schema,
          tableType: 'physical',
          statementId,
        });
      }
      if (stmt.from) {
        extractFromTables(stmt.from, resolver, tables, seen, statementId);
      }
    }

    if (stmt.type === 'select' || (stmt.from && stmt.columns)) {
      if (stmt.with && Array.isArray(stmt.with)) {
        for (const cte of stmt.with) {
          const cteName = cte.name?.value ?? cte.name ?? '';
          if (!cteName) continue;
          const cteId = `cte::${cteName}`;
          if (!seen.has(cteId)) {
            seen.add(cteId);
            tables.push({
              id: cteId,
              tableName: cteName,
              tableType: 'cte',
              statementId,
              sqlPreview: truncateSQL(stmt._sql || ''),
            });
          }
          resolver.registerAlias(cteName, cteName, undefined, undefined, 'cte');
        }
      }

      if (stmt.from) {
        extractFromTables(stmt.from, resolver, tables, seen, statementId);
      }
    }
  });

  return tables;
}

function extractFromTables(
  fromArr: any[],
  resolver: AliasResolver,
  tables: TableInfo[],
  seen: Set<string>,
  statementId: string
): void {
  if (!Array.isArray(fromArr)) return;
  resolver.pushScope();

  for (const from of fromArr) {
    if (!from) continue;

    if (from.table && !from.join && !from.expr) {
      const ref = getTableRef(from);
      if (!ref.table || ref.table === 'unknown') continue;
      const id = tableIdFromRef({ table: ref.table, db: ref.db, schema: ref.schema });
      const alias = ref.as;
      resolver.registerAlias(alias, ref.table, ref.db, ref.schema, 'physical');
      if (!seen.has(id)) {
        seen.add(id);
        tables.push({
          id,
          tableName: ref.table,
          db: ref.db,
          schema: ref.schema,
          alias,
          tableType: 'physical',
          statementId,
        });
      }
      continue;
    }

    if (from.join && from.table) {
      const ref = getTableRef(from);
      if (!ref.table || ref.table === 'unknown') continue;
      const id = tableIdFromRef({ table: ref.table, db: ref.db, schema: ref.schema });
      const alias = ref.as;
      resolver.registerAlias(alias, ref.table, ref.db, ref.schema, 'physical');
      if (!seen.has(id)) {
        seen.add(id);
        tables.push({
          id,
          tableName: ref.table,
          db: ref.db,
          schema: ref.schema,
          alias,
          tableType: 'physical',
          statementId,
        });
      }
      continue;
    }

    if (from.expr && from.expr.ast) {
      const sqId = nextSubqueryId();
      const alias = from.as || sqId;
      resolver.registerAlias(alias, sqId, undefined, undefined, 'subquery');
      if (!seen.has(sqId)) {
        seen.add(sqId);
        tables.push({
          id: sqId,
          tableName: alias,
          alias,
          tableType: 'subquery',
          statementId,
          sqlPreview: truncateSQL(extractSQLPreview(from.expr.ast)),
        });
      }
      if (from.expr.ast.from) {
        extractFromTables(from.expr.ast.from, resolver, tables, seen, statementId);
      }
      continue;
    }
  }

  resolver.popScope();
}

function truncateSQL(sql: string, max = 80): string {
  const s = sql.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '...' : s;
}

function extractSQLPreview(_ast: any): string {
  return 'SELECT ...';
}
