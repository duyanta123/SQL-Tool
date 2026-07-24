import CodeMirror from '@uiw/react-codemirror';
import { sql, MySQL, MariaSQL, PostgreSQL, MSSQL, SQLite, StandardSQL, type SQLDialect } from '@codemirror/lang-sql';
import { useAppStore } from '@/store/useAppStore';
import { useMemo } from 'react';

interface CodeMirrorEditorProps {
  dialect?: string;
}

export function CodeMirrorEditor({ dialect }: CodeMirrorEditorProps) {
  const sqlValue = useAppStore(s => s.sql);
  const setSQL = useAppStore(s => s.setSQL);

  const sqlExtension = useMemo(() => {
    const map: Record<string, SQLDialect> = { mysql: MySQL, mariadb: MariaSQL, postgresql: PostgreSQL, transactsql: MSSQL, sqlite: SQLite };
    return sql({ dialect: map[dialect ?? ''] ?? StandardSQL, upperCaseKeywords: false });
  }, [dialect]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}>
      <CodeMirror
        value={sqlValue}
        height="100%"
        extensions={[sqlExtension]}
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
