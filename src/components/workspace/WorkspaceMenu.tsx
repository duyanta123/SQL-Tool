import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { getWorkspace, removeWorkspace, saveWorkspace } from '@/services/workspace-db';
import { openWorkspace } from '@/hooks/useWorkspaces';
import { buildShareHash, createWorkspaceRecord, exportSQLFile, exportWorkspaceFile, importWorkspaceFile, snapshotWorkspace } from '@/services/workspace-files';
import { flushCurrentWorkspace } from '@/services/workspace-controller';
import { DeleteWorkspaceDialog, WorkspaceNameDialog } from './WorkspaceDialog';

export function WorkspaceMenu() {
  const currentId = useAppStore(state => state.currentWorkspaceId);
  const name = useAppStore(state => state.workspaceName);
  const dialect = useAppStore(state => state.dialect);
  const workspaces = useAppStore(state => state.workspaces);
  const setName = useAppStore(state => state.setWorkspaceName);
  const pushToast = useAppStore(state => state.pushToast);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, []);

  const currentSnapshot = async () => {
    const state = useAppStore.getState();
    const previous = state.currentWorkspaceId ? await getWorkspace(state.currentWorkspaceId) : undefined;
    return snapshotWorkspace(state, previous?.createdAt);
  };

  const createNew = async (requested: string) => {
    await flushCurrentWorkspace();
    const workspace = createWorkspaceRecord(requested);
    await saveWorkspace(workspace);
    await openWorkspace(workspace);
    setDialog(null);
  };

  const duplicate = async () => {
    const snapshot = await currentSnapshot();
    if (!snapshot) return;
    const copy = { ...snapshot, id: crypto.randomUUID(), name: `${snapshot.name} 副本`, createdAt: Date.now(), updatedAt: Date.now() };
    await saveWorkspace(copy);
    await openWorkspace(copy);
    pushToast('success', '已复制工作区');
  };

  const rename = (value: string) => { setName(value); setDialog(null); };

  const deleteCurrent = async () => {
    if (!currentId) return;
    await flushCurrentWorkspace();
    await removeWorkspace(currentId);
    const remaining = workspaces.filter(item => item.id !== currentId);
    if (remaining[0]) {
      const next = await getWorkspace(remaining[0].id);
      if (next) await openWorkspace(next);
    } else {
      const workspace = createWorkspaceRecord('新建查询');
      await saveWorkspace(workspace);
      await openWorkspace(workspace);
    }
    pushToast('success', '工作区已删除');
    setDialog(null);
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const workspace = await importWorkspaceFile(file, dialect);
      await saveWorkspace(workspace);
      await openWorkspace(workspace);
      pushToast('success', `已导入 ${file.name}`);
    } catch (error) { pushToast('error', error instanceof Error ? error.message : String(error)); }
  };

  const exportCurrent = async (kind: 'sql' | 'sqlviz') => {
    const snapshot = await currentSnapshot();
    if (!snapshot) return;
    if (kind === 'sql') exportSQLFile(snapshot); else exportWorkspaceFile(snapshot);
    pushToast('success', '文件已导出');
  };

  const share = async () => {
    const snapshot = await currentSnapshot();
    if (!snapshot) return;
    try {
      const url = `${location.origin}${location.pathname}${location.search}${buildShareHash(snapshot)}`;
      await navigator.clipboard.writeText(url);
      pushToast('success', '本地分享链接已复制；SQL 不会上传服务器');
    } catch (error) { pushToast('error', error instanceof Error ? error.message : String(error)); }
  };

  return (
    <div className="workspace-menu" ref={menuRef}>
      <select
        aria-label="当前工作区"
        value={currentId ?? ''}
        onChange={async event => { await flushCurrentWorkspace(); const workspace = await getWorkspace(event.target.value); if (workspace) await openWorkspace(workspace); }}
      >
        {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
      <button className="icon-button" type="button" title="新建工作区" aria-label="新建工作区" onClick={() => setDialog('create')}>＋</button>
      <button className="icon-button" type="button" title="工作区操作" aria-label="打开工作区操作菜单" aria-expanded={open} onClick={() => setOpen(value => !value)}>⋯</button>
      {open && (
        <div className="workspace-actions" role="menu">
          <Action onClick={() => { setOpen(false); setDialog('rename'); }}>重命名</Action>
          <Action onClick={() => void duplicate()}>创建副本</Action>
          <Action onClick={() => inputRef.current?.click()}>导入 .sql / .sqlviz</Action>
          <Action onClick={() => void exportCurrent('sql')}>导出 SQL</Action>
          <Action onClick={() => void exportCurrent('sqlviz')}>导出工作区</Action>
          <Action onClick={() => void share()}>复制本地分享链接</Action>
          <Action danger onClick={() => { setOpen(false); setDialog('delete'); }}>删除工作区</Action>
        </div>
      )}
      <input ref={inputRef} hidden type="file" accept=".sql,.sqlviz" onChange={event => void importFile(event)} />
      {dialog === 'create' && <WorkspaceNameDialog mode="create" onClose={() => setDialog(null)} onSubmit={createNew} />}
      {dialog === 'rename' && <WorkspaceNameDialog mode="rename" initialName={name} onClose={() => setDialog(null)} onSubmit={rename} />}
      {dialog === 'delete' && <DeleteWorkspaceDialog name={name} onClose={() => setDialog(null)} onConfirm={deleteCurrent} />}
    </div>
  );
}

function Action({ children, onClick, danger = false }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" role="menuitem" className={danger ? 'danger' : ''} onClick={() => { onClick(); }}>{children}</button>;
}
