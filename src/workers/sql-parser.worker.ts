/// <reference lib="webworker" />
import type { ParseRequest, ParseResponse } from '@/types/sql';
import { createParseResult } from '@/parser/result-builder';
import { getDialectParser } from '@/parser/loader';

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const request = event.data;
  const startedAt = performance.now();
  const response: ParseResponse = { id: request.id, durationMs: 0 };
  try {
    const parser = await getDialectParser(request.dialect);
    const ast = parser.astify(request.sql.trim());
    response.result = createParseResult(Array.isArray(ast) ? ast : [ast], request.schemaSnapshot);
  } catch (error) {
    const detail = error as { message?: string; location?: { start?: { line?: number; offset?: number } } };
    response.error = {
      message: detail.message ?? String(error),
      line: detail.location?.start?.line,
      offset: detail.location?.start?.offset,
    };
  }
  response.durationMs = Math.round(performance.now() - startedAt);
  self.postMessage(response);
};
