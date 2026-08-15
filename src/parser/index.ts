import type { Dialect, ParseError, ParseStats, ParseWarning } from '@/types/sql';
import type { ERGraph } from '@/types/er-diagram';
import type { DataFlowGraph } from '@/types/dataflow';
import { astify } from './parser-factory';
import { createParseResult } from './result-builder';
import type { DatabaseSchemaSnapshot } from '@/types/database';

export interface ParseResult {
  erGraph: ERGraph;
  dfGraph: DataFlowGraph;
  error: ParseError | null;
  warnings: ParseWarning[];
  stats: ParseStats;
}

export function emptyParseResult(error: ParseError | null = null): ParseResult {
  return {
    erGraph: { nodes: [], edges: [] },
    dfGraph: { nodes: [], edges: [] },
    error,
    warnings: [],
    stats: { tableCount: 0, joinCount: 0, cteCount: 0, subqueryCount: 0 },
  };
}

export async function parseSQL(sql: string, dialect: Dialect, schemaSnapshot?: DatabaseSchemaSnapshot | null): Promise<ParseResult> {
  if (!sql.trim()) return emptyParseResult();
  try {
    return createParseResult(await astify(sql, dialect), schemaSnapshot);
  } catch (error) {
    const detail = error as { message?: string; location?: { start?: { line?: number; offset?: number } } };
    return emptyParseResult({
      message: detail.message ?? String(error),
      line: detail.location?.start?.line,
      offset: detail.location?.start?.offset,
    });
  }
}

export { createParseResult } from './result-builder';
