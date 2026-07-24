import type { Cardinality } from '@/types/er-diagram';
import { AliasResolver } from '../utils/alias-resolver';
import { extractEQPairs, pairsToConditionSQL, pairsToJoinConditions } from '../utils/condition-expr';

export interface JoinInfo {
  sourceTableId: string;
  targetTableId: string;
  joinType: 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN' | 'CROSS JOIN' | 'FK';
  cardinality: Cardinality;
  conditions: Array<{
    leftTable: string;
    leftColumn: string;
    rightTable: string;
    rightColumn: string;
    operator: string;
  }>;
  sourceColumns: string[];
  targetColumns: string[];
  conditionSQL: string;
  highConfidence: boolean;
}

function resolveJoinType(joinStr: string): JoinInfo['joinType'] {
  const j = joinStr.toUpperCase();
  if (j.includes('LEFT')) return 'LEFT JOIN';
  if (j.includes('RIGHT')) return 'RIGHT JOIN';
  if (j.includes('CROSS')) return 'CROSS JOIN';
  return 'INNER JOIN';
}

function inferCardinality(
  joinType: JoinInfo['joinType'],
  sourceCols: string[],
  targetCols: string[],
  isFK: boolean
): Cardinality {
  if (isFK) return 'N:1';
  if (joinType === 'LEFT JOIN') return '1:N';
  if (joinType === 'RIGHT JOIN') return 'N:1';
  if (joinType === 'CROSS JOIN') return 'N:M';
  // Check if columns look like PK
  const sourceIsId = sourceCols.some(c => c.toLowerCase() === 'id');
  const targetIsId = targetCols.some(c => c.toLowerCase() === 'id');
  if (sourceIsId && !targetIsId) return '1:N';
  if (!sourceIsId && targetIsId) return 'N:1';
  return 'N:M';
}

export function extractJoinsFromSelect(
  select: any,
  resolver: AliasResolver,
  aliasToId: Map<string, string>,
  _statementId: string
): JoinInfo[] {
  const joins: JoinInfo[] = [];
  if (!select.from || !Array.isArray(select.from)) return joins;

  // Find first table (primary source)
  let primaryTable: string | null = null;
  for (const f of select.from) {
    if (f && !f.join && f.table) {
      const tName = typeof f.table === 'string' ? f.table : (f.table?.table ?? f.table?.name ?? '');
      const alias = f.as || tName;
      const resolved = resolver.resolve(typeof alias === 'string' ? alias : tName);
      const key = (typeof alias === 'string' ? alias : tName).toLowerCase();
      primaryTable = aliasToId.get(key) ?? resolved.table ?? null;
      break;
    }
    if (f && f.expr && f.expr.ast && f.as) {
      const key = f.as.toLowerCase();
      primaryTable = aliasToId.get(key) ?? f.as;
      break;
    }
  }

  if (!primaryTable) return joins;

  for (const from of select.from) {
    if (!from || !from.join) continue;

    const joinType = resolveJoinType(from.join);
    let targetTable: string | null = null;
    let targetAlias: string | null = null;

    if (from.table) {
      const tName = typeof from.table === 'string' ? from.table : (from.table?.table ?? from.table?.name ?? '');
      targetAlias = from.as || tName;
      const key = (typeof targetAlias === 'string' ? targetAlias : tName).toLowerCase();
      targetTable = aliasToId.get(key) ?? null;
      if (!targetTable) {
        const resolved = resolver.resolve(typeof targetAlias === 'string' ? targetAlias : tName);
        targetTable = resolved.table ?? null;
      }
    } else if (from.expr && from.expr.ast && from.as) {
      targetAlias = from.as;
      targetTable = aliasToId.get(from.as.toLowerCase()) ?? from.as;
    }

    if (!targetTable) continue;

    let pairs: ReturnType<typeof extractEQPairs> = [];
    let sourceCols: string[] = [];
    let targetCols: string[] = [];
    let conditionSQL = '';

    if (from.on) {
      pairs = extractEQPairs(from.on);
      sourceCols = pairs.map(p => p.leftColumn);
      targetCols = pairs.map(p => p.rightColumn);
      conditionSQL = pairsToConditionSQL(pairs, alias => {
        const key = alias.toLowerCase();
        return aliasToId.get(key) ?? resolver.resolve(alias).table ?? alias;
      });
    } else if (from.using && Array.isArray(from.using)) {
      pairs = from.using.map((col: any) => {
        const colName = col.column ?? col;
        return {
          leftTable: primaryTable!,
          leftColumn: colName,
          rightTable: targetTable!,
          rightColumn: colName,
          operator: '=',
        };
      });
      sourceCols = from.using.map((c: any) => c.column ?? c);
      targetCols = sourceCols;
      conditionSQL = `USING (${sourceCols.join(', ')})`;
    }

    const conditions = pairsToJoinConditions(pairs, alias => {
      const key = alias.toLowerCase();
      return aliasToId.get(key) ?? resolver.resolve(alias).table ?? alias;
    });

    const cardinality = inferCardinality(joinType, sourceCols, targetCols, false);

    joins.push({
      sourceTableId: primaryTable,
      targetTableId: targetTable,
      joinType,
      cardinality,
      conditions,
      sourceColumns: sourceCols,
      targetColumns: targetCols,
      conditionSQL,
      highConfidence: false,
    });
  }

  return joins;
}

export function extractFKJoins(
  fks: Array<{ tableId: string; column: string; refTableId: string; refColumn: string }>
): JoinInfo[] {
  return fks.map(fk => ({
    sourceTableId: fk.refTableId,
    targetTableId: fk.tableId,
    joinType: 'FK',
    cardinality: 'N:1',
    conditions: [
      {
        leftTable: fk.refTableId,
        leftColumn: fk.refColumn,
        rightTable: fk.tableId,
        rightColumn: fk.column,
        operator: '=',
      },
    ],
    sourceColumns: [fk.refColumn],
    targetColumns: [fk.column],
    conditionSQL: `${fk.refTableId}.${fk.refColumn} = ${fk.tableId}.${fk.column}`,
    highConfidence: true,
  }));
}
