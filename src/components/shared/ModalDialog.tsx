import { useEffect, useRef, type ReactNode } from 'react';

export function ModalDialog({ title, description, onClose, children, className = '', closeLabel = '关闭对话框' }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  // onClose 经 ref 引用：调用方传内联箭头函数时，父组件重渲染不再触发焦点管理 effect 重跑（避免输入焦点被夺）
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    window.setTimeout(() => (dialog?.querySelector<HTMLElement>('[autofocus]') ?? focusable()[0])?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key === 'Tab') {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className={`modal-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-dialog-title">
        <header>
          <div><h2 id="modal-dialog-title">{title}</h2>{description && <p>{description}</p>}</div>
          <button type="button" className="dialog-close" aria-label={closeLabel} onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
}
