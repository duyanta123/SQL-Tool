import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportDialog } from '@/components/shared/SupportDialog';
import { ToastViewport } from '@/components/shared/ToastViewport';
import { useAppStore } from '@/store/useAppStore';

afterEach(() => {
  cleanup();
  useAppStore.setState({ toasts: [] });
});

describe('product UI feedback', () => {
  it('shows the capability matrix and closes accessibly', async () => {
    const close = vi.fn();
    render(<SupportDialog onClose={close} />);
    expect(screen.getByRole('dialog', { name: '支持范围' })).toBeTruthy();
    expect(screen.getByText('Snowflake')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '关闭支持说明' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('announces and dismisses visible operation feedback', async () => {
    useAppStore.getState().pushToast('success', '工作区已保存');
    render(<ToastViewport />);
    expect(screen.getByText('工作区已保存')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '关闭通知' }));
    expect(screen.queryByText('工作区已保存')).toBeNull();
  });

  it('preserves deselected tables while adding and removing Schema tables', () => {
    const store = useAppStore.getState();
    store.setSchemaSnapshot({ connectionId: 'db', fetchedAt: 1, tables: [table('a'), table('b')] }, false);
    store.setSelectedTableIds(['a']);
    store.setSchemaSnapshot({ connectionId: 'db', fetchedAt: 2, tables: [table('a'), table('b'), table('c')] });
    expect(useAppStore.getState().selectedTableIds).toEqual(['a', 'c']);
    store.setSchemaSnapshot({ connectionId: 'db', fetchedAt: 3, tables: [table('b'), table('c')] });
    expect(useAppStore.getState().selectedTableIds).toEqual(['c']);
  });
});

function table(id: string) {
  return { id, name: id, columns: [], foreignKeys: [] };
}
