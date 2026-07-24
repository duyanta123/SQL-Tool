import type { JoinCondition } from '@/types/er-diagram';
import { identifier } from '../ast-normalizer';

export interface EQPair {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  operator: string;
}

function extractTableName(colRef: any): string {
  if (!colRef) return '';
  if (typeof colRef === 'string') return colRef;
  if (colRef.table) return identifier(colRef.table);
  return colRef.expr?.table ?? '';
}

function extractColumnName(colRef: any): string {
  if (!colRef) return '';
  if (typeof colRef === 'string') return colRef;
  if (colRef.column) return identifier(colRef.column);
  if (colRef.expr?.column) {
    return identifier(colRef.expr.column);
  }
  return '';
}

function isColumnRef(node: any): boolean {
  return node && (node.type === 'column_ref' || (node.column !== undefined && node.type !== 'binary_expr'));
}

export function extractEQPairs(expr: any): EQPair[] {
  const pairs: EQPair[] = [];
  collectEQ(expr, pairs);
  return pairs;
}

function collectEQ(node: any, pairs: EQPair[]): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'binary_expr') {
    if (node.operator === 'AND') {
      collectEQ(node.left, pairs);
      collectEQ(node.right, pairs);
      return;
    }
    if (node.operator === '=' && isColumnRef(node.left) && isColumnRef(node.right)) {
      pairs.push({
        leftTable: extractTableName(node.left),
        leftColumn: extractColumnName(node.left),
        rightTable: extractTableName(node.right),
        rightColumn: extractColumnName(node.right),
        operator: '=',
      });
      return;
    }
    // Non-AND operators: try to find EQ within
    collectEQ(node.left, pairs);
    collectEQ(node.right, pairs);
  }
}

export function binaryToSQL(expr: any, resolveTable?: (alias: string) => string): string {
  if (!expr) return '';

  if (typeof expr === 'string') return expr;

  if (expr.type === 'binary_expr') {
    const left = binaryToSQL(expr.left, resolveTable);
    const right = binaryToSQL(expr.right, resolveTable);
    const op = expr.operator;
    if (op === 'AND') return `${left} AND ${right}`;
    if (op === 'OR') return `${left} OR ${right}`;
    return `${left} ${op} ${right}`;
  }

  if (isColumnRef(expr)) {
    const tbl = extractTableName(expr);
    const col = extractColumnName(expr);
    const resolved = tbl && resolveTable ? resolveTable(tbl) : tbl;
    return resolved ? `${resolved}.${col}` : col;
  }

  if (expr.type === 'single_quote_string') return `'${expr.value}'`;
  if (expr.type === 'number') return String(expr.value);
  if (expr.type === 'null') return 'NULL';
  if (expr.type === 'bool') return expr.value ? 'TRUE' : 'FALSE';
  if (expr.type === 'function') {
    const args = expr.args?.type === 'expr_list'
      ? expr.args.value.map((a: any) => binaryToSQL(a, resolveTable)).join(', ')
      : expr.args ? binaryToSQL(expr.args, resolveTable) : '';
    const name = typeof expr.name === 'object'
      ? (expr.name.name?.[0]?.value ?? expr.name.toString())
      : expr.name;
    return `${name}(${args})`;
  }

  if (expr.value !== undefined) return String(expr.value);

  return '';
}

export function pairsToJoinConditions(pairs: EQPair[], resolveTable: (alias: string) => string): JoinCondition[] {
  return pairs.map(p => ({
    leftTable: resolveTable(p.leftTable) || p.leftTable,
    leftColumn: p.leftColumn,
    rightTable: resolveTable(p.rightTable) || p.rightTable,
    rightColumn: p.rightColumn,
    operator: p.operator,
  }));
}

export function pairsToConditionSQL(pairs: EQPair[], resolveTable: (alias: string) => string): string {
  return pairs
    .map(p => {
      const lt = resolveTable(p.leftTable) || p.leftTable;
      const rt = resolveTable(p.rightTable) || p.rightTable;
      return `${lt}.${p.leftColumn} ${p.operator} ${rt}.${p.rightColumn}`;
    })
    .join(' AND ');
}
