import type { ParseResult } from './index';
import type { ParseWarning } from '@/types/sql';
import { buildERGraph } from './er-builder';
import { buildDataFlowGraph } from './dataflow-builder';
import { asNode, identifier, statementType } from './ast-normalizer';
import type { DatabaseSchemaSnapshot } from '@/types/database';

const SUPPORTED = new Set(['select', 'insert', 'update', 'delete', 'create']);

export function createParseResult(statements: unknown[], schemaSnapshot?: DatabaseSchemaSnapshot | null): ParseResult {
  const warnings: ParseWarning[] = [];
  statements.forEach((statement, index) => {
    const node = asNode(statement);
    const type = statementType(node);
    const supportedCreate = type !== 'create' || identifier(node?.keyword).toLowerCase() === 'table';
    if (!SUPPORTED.has(type) || !supportedCreate) {
      warnings.push({
        code: 'unsupported-statement',
        message: `第 ${index + 1} 条语句（${type || '未知类型'}）暂不支持可视化`,
        statementIndex: index,
      });
    }
  });
  const erGraph = buildERGraph(statements, schemaSnapshot);
  const dfGraph = buildDataFlowGraph(statements);
  return {
    erGraph,
    dfGraph,
    error: null,
    warnings,
    stats: {
      tableCount: erGraph.nodes.filter(node => node.kind === 'table').length,
      joinCount: erGraph.edges.length,
      cteCount: erGraph.nodes.filter(node => node.kind === 'cte').length,
      subqueryCount: erGraph.nodes.filter(node => node.kind === 'subquery').length,
    },
  };
}
