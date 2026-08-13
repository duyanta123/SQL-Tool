import { DIALECTS } from '@/config/dialects';
import { ModalDialog } from './ModalDialog';

export function SupportDialog({ onClose }: { onClose: () => void }) {
  return (
    <ModalDialog title="支持范围" description="解析在浏览器本地完成，不会上传 SQL。" onClose={onClose} closeLabel="关闭支持说明" className="support-dialog">
      <div className="support-content">
        <h3>可视化语句</h3>
        <p>SELECT / JOIN、UNION、CTE（含递归）、子查询、CREATE TABLE / CTAS / VIEW、INSERT（含 UPSERT）、UPDATE、DELETE。其他语句会显示提示而不是静默忽略。</p>
        <h3>SQL 方言</h3>
        <div className="dialect-grid">{DIALECTS.map(item => <div key={item.id}><strong>{item.label}</strong>{item.experimental && <span>实验</span>}</div>)}</div>
        <p className="support-note">方言支持表示可调用对应语法解析器，不代表该数据库的全部扩展语法都能生成图形。</p>
      </div>
    </ModalDialog>
  );
}
