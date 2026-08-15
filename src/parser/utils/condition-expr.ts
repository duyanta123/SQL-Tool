import type { JoinCondition } from '@/types/er-diagram';
import { identifier } from '../ast-normalizer';
import { expressionToSQL } from './expression-sql';

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
    // OR 分支下的等值对不具备合取语义，不再提取；完整语义由 conditionSQL 文本承载
    if (node.operator === 'OR') return;
    // Non-AND operators: try to find EQ within
    collectEQ(node.left, pairs);
    collectEQ(node.right, pairs);
  }
}

/**
 * 把条件表达式（JOIN ON / WHERE / HAVING）还原为可读 SQL。
 * 支持 AND/OR 与括号分组、IN、函数、CASE、类型转换等，别名可按需解析为表名。
 */
export function binaryToSQL(expr: any, resolveTable?: (alias: string) => string): string {
  if (!expr) return '';
  return expressionToSQL(expr, 300, resolveTable) ?? '';
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
