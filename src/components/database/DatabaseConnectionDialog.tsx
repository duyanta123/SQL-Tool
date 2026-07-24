import { useMemo, useState } from 'react';
import { ModalDialog } from '../shared/ModalDialog';
import { chooseSQLiteFile, saveAndConnectDatabase, testDatabaseConnection } from '@/services/database';
import { useAppStore } from '@/store/useAppStore';
import type { DatabaseConnectionInput, DatabaseKind } from '@/types/database';

const DEFAULT_PORTS = { mysql: 3306, postgresql: 5432 } as const;

export function DatabaseConnectionDialog({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const profiles = useAppStore(state => state.databaseProfiles);
  const pushToast = useAppStore(state => state.pushToast);
  const [profile, setProfile] = useState<DatabaseConnectionInput>(() => emptyProfile('sqlite'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'test' | 'connect' | 'file' | null>(null);
  const matchingProfiles = useMemo(() => profiles.filter(item => item.kind === profile.kind), [profiles, profile.kind]);
  const update = (patch: Partial<DatabaseConnectionInput>) => { setProfile(current => ({ ...current, ...patch })); setError(''); };
  const run = async (mode: 'test' | 'connect') => {
    setBusy(mode);
    setError('');
    try {
      if (mode === 'test') {
        await testDatabaseConnection(profile);
        pushToast('success', '数据库连接成功');
      } else {
        await saveAndConnectDatabase(profile);
        pushToast('success', '数据库 Schema 已读取');
        onConnected();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };
  return (
    <ModalDialog title="连接本机数据库" description="桌面版只读取 Schema 元数据，不执行任意 SQL。" onClose={onClose} className="database-dialog">
      <form className="dialog-form" onSubmit={event => { event.preventDefault(); void run('connect'); }}>
        <div className="database-kind-tabs" role="tablist" aria-label="数据库类型">
          {(['sqlite', 'mysql', 'postgresql'] as DatabaseKind[]).map(kind => <button key={kind} type="button" role="tab" aria-selected={profile.kind === kind} onClick={() => setProfile(emptyProfile(kind))}>{kind === 'postgresql' ? 'PostgreSQL' : kind === 'mysql' ? 'MySQL' : 'SQLite'}</button>)}
        </div>
        {matchingProfiles.length > 0 && <label>已保存连接<select value="" onChange={event => { const saved = profiles.find(item => item.id === event.target.value); if (saved) setProfile({ ...saved, password: '' }); }}><option value="">新建连接</option>{matchingProfiles.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        <label>连接名称<input value={profile.name} onChange={event => update({ name: event.target.value })} required maxLength={80} /></label>
        {profile.kind === 'sqlite' ? (
          <label>数据库文件<div className="file-picker-row"><input value={profile.filePath ?? ''} readOnly placeholder="请选择 .sqlite / .db 文件" /><button type="button" disabled={!!busy} onClick={async () => { setBusy('file'); try { update({ filePath: await chooseSQLiteFile(profile) }); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(null); } }}>选择文件</button></div></label>
        ) : <>
          <div className="form-grid"><label>主机<input value={profile.host ?? ''} onChange={event => update({ host: event.target.value })} required /></label><label>端口<input type="number" min={1} max={65535} value={profile.port ?? ''} onChange={event => update({ port: Number(event.target.value) })} required /></label></div>
          <div className="form-grid"><label>数据库<input value={profile.database ?? ''} onChange={event => update({ database: event.target.value })} required /></label><label>Schema（可选）<input value={profile.schema ?? ''} onChange={event => update({ schema: event.target.value })} placeholder={profile.kind === 'postgresql' ? 'public' : ''} /></label></div>
          <label>用户名<input value={profile.username ?? ''} onChange={event => update({ username: event.target.value })} required /></label>
          <label>密码<input type="password" autoComplete="new-password" value={profile.password ?? ''} onChange={event => update({ password: event.target.value })} /></label>
          <label className="checkbox-label"><input type="checkbox" checked={profile.rememberPassword} onChange={event => update({ rememberPassword: event.target.checked })} />使用系统安全存储记住密码</label>
        </>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={onClose}>取消</button><button type="button" disabled={!!busy} onClick={() => void run('test')}>{busy === 'test' ? '测试中…' : '测试连接'}</button><button className="primary-button" type="submit" disabled={!!busy}>{busy === 'connect' ? '读取中…' : '连接并读取 Schema'}</button></footer>
      </form>
    </ModalDialog>
  );
}

function emptyProfile(kind: DatabaseKind): DatabaseConnectionInput {
  return {
    id: crypto.randomUUID(), name: kind === 'sqlite' ? '本机 SQLite' : `本机 ${kind === 'mysql' ? 'MySQL' : 'PostgreSQL'}`,
    kind, rememberPassword: false,
    ...(kind === 'sqlite' ? {} : { host: '127.0.0.1', port: DEFAULT_PORTS[kind], database: '', username: '', schema: kind === 'postgresql' ? 'public' : '' }),
  };
}
