import { AliasResolver, tableIdFromRef } from '../utils/alias-resolver';
import type { TableInfo } from './tables';
import { extractJoinsFromSelect } from './joins';
import type { JoinInfo } from './joins';
import { extractCTEs } from './ctes';

let subqueryCounter = 0;
export function resetCounters() {
  subqueryCounter = 0;
}

function nextSubqueryId(): string {
  subqueryCounter += 1;
  return `subquery_${subqueryCounter}`;
}

function getTableRef(from: any) {
  return {
    table: typeof from.table === 'string' ? from.table : from.table?.table ?? from.table?.name ?? '',
    db: typeof from.db === 'string' ? from.db : from.db?.name ?? undefined,
    schema: from.schema,
    as: from.as,
  };
}

export function extractTablesFromSelects(
  select: any,
  resolver: AliasResolver,
  statementId: string
): { tables: TableInfo[]; aliasToId: Map<string, string> } {
  const tables: TableInfo[] = [];
  const aliasToId = new Map<string, string>();
  const seen = new Set<string>();

  resolver.pushScope();

  // Register CTEs first
  const ctes = extractCTEs(select, statementId);
  for (const cte of ctes) {
    if (!seen.has(cte.id)) {
      seen.add(cte.id);
      tables.push({
        id: cte.id,
        tableName: cte.name,
        tableType: 'cte',
        statementId,
        sqlPreview: 'CTE',
      });
    }
    resolver.registerAlias(cte.name, cte.name, undefined, undefined, 'cte');
    aliasToId.set(cte.name.toLowerCase(), cte.id);
  }

  // Process FROM
  if (select.from && Array.isArray(select.from)) {
    collectFromTables(select.from, resolver, tables, seen, aliasToId, statementId);
  }

  resolver.popScope();
  return { tables, aliasToId };
}

function collectFromTables(
  fromArr: any[],
  resolver: AliasResolver,
  tables: TableInfo[],
  seen: Set<string>,
  aliasToId: Map<string, string>,
  statementId: string
): void {
  for (const from of fromArr) {
    if (!from) continue;

    // Regular table or JOIN table
    if (from.table) {
      const ref = getTableRef(from);
      const id = tableIdFromRef({ table: ref.table, db: ref.db, schema: ref.schema });
      const alias = ref.as || undefined;
      const aliasKey = (alias || ref.table).toLowerCase();
      resolver.registerAlias(alias || ref.table, ref.table, ref.db, ref.schema, 'physical');
      aliasToId.set(aliasKey, id);
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

    // Subquery
    if (from.expr && from.expr.ast) {
      const sqId = nextSubqueryId();
      const alias = from.as || sqId;
      resolver.registerAlias(alias, sqId, undefined, undefined, 'subquery');
      aliasToId.set(alias.toLowerCase(), sqId);
      if (!seen.has(sqId)) {
        seen.add(sqId);
        tables.push({
          id: sqId,
          tableName: alias,
          alias,
          tableType: 'subquery',
          statementId,
          sqlPreview: 'SELECT ...',
        });
      }
      // Recurse into subquery
      resolver.pushScope();
      if (from.expr.ast.from) {
        collectFromTables(from.expr.ast.from, resolver, tables, seen, aliasToId, statementId);
      }
      resolver.popScope();
    }
  }
}

export function extractJoins(
  select: any,
  resolver: AliasResolver,
  aliasToId: Map<string, string>,
  statementId: string
): JoinInfo[] {
  return extractJoinsFromSelect(select, resolver, aliasToId, statementId);
}
