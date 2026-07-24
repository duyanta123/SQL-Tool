import { useState } from 'react';
import { ModalDialog } from '../shared/ModalDialog';

export function WorkspaceNameDialog({ mode, initialName, onClose, onSubmit }: {
  mode: 'create' | 'rename';
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(initialName ?? '新建查询');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const normalized = name.trim();
    if (!normalized) { setError('请输入工作区名称'); return; }
    if (normalized.length > 80) { setError('名称不能超过 80 个字符'); return; }
    setSaving(true);
    try { await onSubmit(normalized); } finally { setSaving(false); }
  };
  return (
    <ModalDialog title={mode === 'create' ? '新建工作区' : '重命名工作区'} onClose={onClose}>
      <form className="dialog-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label>名称<input autoFocus value={name} maxLength={80} onChange={event => { setName(event.target.value); setError(''); }} aria-invalid={!!error} /></label>
        {error && <p className="field-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={saving}>{saving ? '保存中…' : mode === 'create' ? '创建' : '保存'}</button></footer>
      </form>
    </ModalDialog>
  );
}

export function DeleteWorkspaceDialog({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <ModalDialog title="删除工作区" description="此操作不可撤销。" onClose={onClose}>
      <div className="dialog-form"><p>确定删除“{name}”吗？SQL、布局和本地 Schema 快照都会被移除。</p>
        <footer><button type="button" onClick={onClose}>取消</button><button className="danger-button" type="button" disabled={deleting} onClick={async () => { setDeleting(true); try { await onConfirm(); } finally { setDeleting(false); } }}>{deleting ? '删除中…' : '删除'}</button></footer>
      </div>
    </ModalDialog>
  );
}
