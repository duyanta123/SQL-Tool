import CodeMirror from '@uiw/react-codemirror';
import { sql, MySQL, MariaSQL, PostgreSQL, MSSQL, SQLite, StandardSQL, type SQLDialect } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, lintGutter, forceLinting, type Diagnostic } from '@codemirror/lint';
import { keymap, type EditorView } from '@codemirror/view';
import type { Text } from '@codemirror/state';
import { useAppStore } from '@/store/useAppStore';
import { tryFormatSQL } from '@/utils/sql-format';
import type { ParseError } from '@/types/sql';
import { useEffect, useMemo, useRef } from 'react';

interface CodeMirrorEditorProps {
  dialect?: string;
}

function diagnosticsFor(error: ParseError | null, doc: Text): Diagnostic[] {
  if (!error || doc.length === 0) return [];
  let from = 0;
  let to = Math.max(1, doc.length);
  if (typeof error.offset === 'number' && error.offset >= 0 && error.offset <= doc.length) {
    from = error.offset;
    const line = doc.lineAt(from);
    to = Math.min(line.to, Math.max(line.from + 1, from + 1));
  }
  // 空区间（错误位于文末）不渲染，至少覆盖一个字符
  if (from >= to) {
    from = Math.max(0, to - 1);
    if (from >= to) { from = 0; to = Math.max(1, doc.length); }
  }
  return [{ from, to, severity: 'error', message: error.message, source: 'SQL 解析' }];
}

export function CodeMirrorEditor({ dialect }: CodeMirrorEditorProps) {
  const sqlValue = useAppStore(s => s.sql);
  const setSQL = useAppStore(s => s.setSQL);
  const dark = useAppStore(s => s.resolvedTheme === 'dark');
  const parseError = useAppStore(s => s.error);
  const errorRef = useRef<ParseError | null>(parseError);
  errorRef.current = parseError;
  const viewRef = useRef<EditorView | null>(null);

  // 解析错误在文档变更之后异步到达，需要手动触发一次 lint
  useEffect(() => {
    const view = viewRef.current;
    if (view) forceLinting(view);
  }, [parseError]);

  const sqlExtension = useMemo(() => {
    const map: Record<string, SQLDialect> = { mysql: MySQL, mariadb: MariaSQL, postgresql: PostgreSQL, transactsql: MSSQL, sqlite: SQLite };
    return sql({ dialect: map[dialect ?? ''] ?? StandardSQL, upperCaseKeywords: false });
  }, [dialect]);

  const lintExtension = useMemo(() => linter(view => diagnosticsFor(errorRef.current, view.state.doc)), []);

  const formatKeymap = useMemo(() => keymap.of([{
    key: 'Ctrl-Shift-f',
    run: () => {
      const state = useAppStore.getState();
      const result = tryFormatSQL(state.sql, state.dialect);
      if (!result.error && result.sql !== state.sql) state.setSQL(result.sql);
      return true;
    },
  }]), []);

  return (
    <div style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}>
      <CodeMirror
        value={sqlValue}
        height="100%"
        theme={dark ? oneDark : 'light'}
        extensions={[sqlExtension, lintExtension, lintGutter(), formatKeymap]}
        onCreateEditor={(view) => { viewRef.current = view; }}
        onChange={val => setSQL(val)}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: false,
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
        }}
        style={{ height: '100%', fontSize: 13 }}
      />
    </div>
  );
}
