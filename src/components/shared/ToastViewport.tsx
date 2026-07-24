import { useEffect } from 'react';
import { useAppStore, type ToastMessage } from '@/store/useAppStore';

export function ToastViewport() {
  const toasts = useAppStore(state => state.toasts);
  return <div className="toast-viewport" aria-live="polite">{toasts.map(toast => <Toast key={toast.id} toast={toast} />)}</div>;
}

function Toast({ toast }: { toast: ToastMessage }) {
  const dismiss = useAppStore(state => state.dismissToast);
  useEffect(() => { const timer = window.setTimeout(() => dismiss(toast.id), 4200); return () => clearTimeout(timer); }, [dismiss, toast.id]);
  return <div className={`toast toast-${toast.type}`}><span>{toast.message}</span><button type="button" aria-label="关闭通知" onClick={() => dismiss(toast.id)}>×</button></div>;
}
