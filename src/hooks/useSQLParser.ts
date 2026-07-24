import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { ParseResult } from '@/parser';
import type { ParseRequest, ParseResponse } from '@/types/sql';
import { PARSE_DEBOUNCE_MS } from '@/utils/constants';

export function useSQLParser() {
  const sql = useAppStore(state => state.sql);
  const dialect = useAppStore(state => state.dialect);
  const schemaSnapshot = useAppStore(state => state.schemaSnapshot);
  const setParseResult = useAppStore(state => state.setParseResult);
  const setParseFailure = useAppStore(state => state.setParseFailure);
  const setParsing = useAppStore(state => state.setParsing);
  const workerRef = useRef<Worker | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/sql-parser.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      const response = event.data;
      if (response.id !== latestRequest.current) return;
      if (response.error) setParseFailure(response.error, response.durationMs);
      else if (response.result) setParseResult(response.result as ParseResult, response.durationMs);
    };
    worker.onerror = () => setParseFailure({ message: 'SQL 解析线程异常，请刷新后重试' });
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [setParseFailure, setParseResult]);

  useEffect(() => {
    if (!sql.trim()) {
      latestRequest.current += 1;
      setParseResult({
        erGraph: { nodes: [], edges: [] }, dfGraph: { nodes: [], edges: [] },
        error: null, warnings: [], stats: { tableCount: 0, joinCount: 0, cteCount: 0, subqueryCount: 0 },
      }, 0);
      return;
    }
    setParsing(true);
    const timer = window.setTimeout(() => {
      latestRequest.current += 1;
      const request: ParseRequest = { id: latestRequest.current, sql, dialect, schemaSnapshot };
      workerRef.current?.postMessage(request);
    }, PARSE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [sql, dialect, schemaSnapshot, setParseResult, setParsing]);
}
