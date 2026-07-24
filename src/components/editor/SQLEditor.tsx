import { CodeMirrorEditor } from './CodeMirrorEditor';
import { useAppStore } from '@/store/useAppStore';

export function SQLEditor() {
  const dialect = useAppStore(state => state.dialect);
  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <CodeMirrorEditor dialect={dialect} />
    </div>
  );
}
