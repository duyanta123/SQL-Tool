import { test, expect } from '@playwright/test';

interface E2EGlobals {
  __introspectionCount?: number;
  sqlVisualizerDesktop?: {
    testConnection: (input: { chooseFile?: boolean; profile?: unknown }) => Promise<{ ok: boolean; message: string; filePath?: string }>;
    introspectSchema: () => Promise<{ connectionId: string; fetchedAt: number; tables: unknown[] }>;
    disconnect: () => Promise<void>;
    listProfiles: () => Promise<unknown[]>;
    saveProfile: (input: { password?: string; [key: string]: unknown }) => Promise<Record<string, unknown>>;
    checkForUpdates?: () => Promise<{ available: boolean; version?: string; dev?: boolean; portable?: boolean }>;
    downloadUpdate?: () => Promise<{ ok: boolean; message?: string }>;
    installUpdate?: () => Promise<void>;
    onUpdateEvent?: (callback: (event: unknown) => void) => () => void;
  };
}

test('loads the visualizer and exposes workspace controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('当前工作区')).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 768) {
    await expect(page.getByRole('tab', { name: '编辑器' })).toBeVisible();
  } else {
    await expect(page.getByText('SQL Visualizer')).toBeVisible();
    await expect(page.getByText('ER 图')).toBeVisible();
  }
});

test('uses editor and diagram tabs on mobile', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) >= 768, '仅验证移动端面板切换');
  await page.goto('/');
  await expect(page.getByRole('tab', { name: '编辑器' })).toBeVisible();
  await expect(page.getByText(/已解析/)).toBeVisible();
  await page.getByRole('tab', { name: '图形' }).click();
  await expect(page.getByRole('tab', { name: '图形' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('SQL 图形')).toBeVisible();
  const nodeLocator = page.locator('.react-flow__node').first();
  await expect(nodeLocator).toBeVisible();
  // 面板切换后 fitView 有约 180ms 动画，等待节点位置稳定到视口内再断言，避免时序抖动
  await expect.poll(async () => {
    const box = await nodeLocator.boundingBox();
    return box ? box.x + box.width : -Infinity;
  }, { timeout: 5000 }).toBeGreaterThan(0);
  const nodeBox = await nodeLocator.boundingBox();
  const viewport = page.viewportSize();
  if (!nodeBox) throw new Error('未找到图形节点');
  expect(nodeBox.x).toBeLessThan(viewport?.width ?? 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('cycles theme preference and persists it', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 768, '桌面主题切换');
  await page.goto('/');
  const toggle = page.getByRole('button', { name: '切换主题' });
  const html = page.locator('html');
  await expect(toggle).toBeVisible();
  // 通过按钮 title 读取当前偏好（亮色/暗色/跟随系统），驱动到确定的“暗色”
  const isDarkPreference = async () => (await toggle.getAttribute('title')) === '主题：暗色';
  for (let i = 0; i < 3 && !(await isDarkPreference()); i++) await toggle.click();
  await expect(toggle).toHaveAttribute('title', '主题：暗色');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  // 持久化：刷新后偏好与解析主题都应保持暗色
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByRole('button', { name: '切换主题' })).toHaveAttribute('title', '主题：暗色');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('creates, renames and deletes workspaces with custom dialogs', async ({ page }) => {
  page.on('dialog', dialog => { throw new Error(`不应出现原生对话框：${dialog.type()}`); });
  await page.goto('/');
  await page.getByRole('button', { name: '新建工作区' }).click();
  await expect(page.getByRole('dialog', { name: '新建工作区' })).toBeVisible();
  const name = page.getByRole('dialog', { name: '新建工作区' }).getByLabel('名称');
  await name.fill('E2E 工作区');
  await name.press('Enter');
  await expect(page.getByLabel('当前工作区')).toHaveValue(/.+/);
  await page.getByRole('button', { name: '打开工作区操作菜单' }).click();
  await page.getByRole('menuitem', { name: '重命名' }).click();
  await expect(page.getByRole('dialog', { name: '重命名工作区' })).toBeVisible();
  await page.getByRole('dialog', { name: '重命名工作区' }).getByLabel('名称').fill('已重命名');
  await page.getByRole('dialog', { name: '重命名工作区' }).getByRole('button', { name: '保存' }).click();
  await expect(page.getByLabel('当前工作区').locator('option:checked')).toHaveText('已重命名');
  await page.getByRole('button', { name: '打开工作区操作菜单' }).click();
  await page.getByRole('menuitem', { name: '删除工作区' }).click();
  await expect(page.getByRole('dialog', { name: '删除工作区' })).toBeVisible();
  await page.getByRole('dialog', { name: '删除工作区' }).getByRole('button', { name: '删除' }).click();
  await expect(page.getByRole('dialog', { name: '删除工作区' })).toBeHidden();
});

test('connects mocked desktop database and switches ER scope', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 768, '桌面范围切换');
  await page.addInitScript(() => {
    const globals = window as unknown as E2EGlobals;
    globals.__introspectionCount = 0;
    const snapshot = { connectionId: 'mock-db', fetchedAt: Date.now(), tables: [{ id: 'public.users', schema: 'public', name: 'users', columns: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isUnique: true }], foreignKeys: [] }] };
    globals.sqlVisualizerDesktop = {
      testConnection: async (input: { chooseFile?: boolean; profile?: unknown }) => input?.chooseFile ? { ok: true, message: 'selected', filePath: 'C:\\data\\mock.db' } : { ok: true, message: 'ok' },
      introspectSchema: async () => { globals.__introspectionCount = (globals.__introspectionCount ?? 0) + 1; return { ...snapshot, fetchedAt: Date.now() }; },
      disconnect: async () => undefined,
      listProfiles: async () => [],
      saveProfile: async (input: { password?: string; [key: string]: unknown }) => { const { password: _password, ...profile } = input; return profile; },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /数据库/ }).click();
  await expect(page.getByRole('dialog', { name: '连接本机数据库' })).toBeVisible();
  await page.getByRole('button', { name: '选择文件' }).click();
  await page.getByRole('button', { name: '连接并读取 Schema' }).click();
  await expect(page.getByLabel('数据库 Schema 表选择')).toBeVisible();
  await page.getByRole('button', { name: 'Schema', exact: true }).click();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'public.users' })).toBeVisible();
  const table = page.getByLabel('数据库 Schema 表选择').locator('.schema-table-list input[type="checkbox"]').first();
  await table.uncheck();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await table.check();
  await expect(page.locator('.react-flow__node').filter({ hasText: 'public.users' })).toBeVisible();
  await page.getByRole('button', { name: '立即刷新' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as E2EGlobals).__introspectionCount)).toBeGreaterThanOrEqual(2);
  await page.getByLabel('每 30 秒自动同步').check();
  await expect.poll(() => page.evaluate(() => (window as unknown as E2EGlobals).__introspectionCount)).toBeGreaterThanOrEqual(3);
});

test('keeps the last valid diagram when SQL becomes invalid', async ({ page }) => {
  await page.goto('/');
  if ((page.viewportSize()?.width ?? 1440) < 768) test.skip();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SELECT FROM');
  await expect(page.getByText('SQL 存在错误，当前显示上一次有效结果')).toBeVisible();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  // 编辑器内联错误标记
  await expect(page.locator('.cm-lintRange-error').first()).toBeVisible();
});

test('formats SQL from the toolbar', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 768, '桌面格式化');
  await page.goto('/');
  await page.getByRole('button', { name: '格式化', exact: true }).click();
  await expect(page.getByText('已格式化 SQL').or(page.getByText('SQL 已符合当前格式'))).toBeVisible();
});

test('manages multiple SQL tabs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建标签页' }).click();
  await expect(page.getByRole('tab', { name: /查询 2/ })).toBeVisible();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SELECT 2');
  await page.getByRole('tab', { name: /查询 1/ }).click();
  await page.getByRole('tab', { name: /查询 2/ }).click();
  await expect(editor).toContainText('SELECT 2');
  await page.getByRole('button', { name: '关闭标签页 查询 2' }).click();
  await expect(page.getByRole('tab', { name: /查询 2/ })).toHaveCount(0);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByRole('tab', { name: /查询 1/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /查询 2/ })).toHaveCount(0);
});

test('searches canvas nodes and undoes view changes', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 768, '桌面画布搜索与撤销');
  await page.goto('/');
  const search = page.getByLabel('搜索图形节点');
  await search.fill('users');
  await expect(page.getByText('1 个匹配')).toBeVisible();
  await expect(page.locator('.react-flow__node.search-match')).toHaveCount(1);
  await search.press('Enter');
  await search.press('Escape');

  const undo = page.getByRole('button', { name: /撤销画布操作/ });
  const redo = page.getByRole('button', { name: /重做画布操作/ });
  await expect(undo).toBeDisabled();
  await page.keyboard.press('2');
  await expect(page.getByRole('tab', { name: '数据流图' })).toHaveAttribute('aria-selected', 'true');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByRole('tab', { name: 'ER 图' })).toHaveAttribute('aria-selected', 'true');
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.getByRole('tab', { name: '数据流图' })).toHaveAttribute('aria-selected', 'true');
});

test('checks for updates through the desktop API', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 768, '桌面更新检查');
  await page.addInitScript(() => {
    const globals = window as unknown as E2EGlobals;
    globals.sqlVisualizerDesktop = {
      testConnection: async () => ({ ok: true, message: 'ok' }),
      introspectSchema: async () => ({ connectionId: 'mock', fetchedAt: Date.now(), tables: [] }),
      disconnect: async () => undefined,
      listProfiles: async () => [],
      saveProfile: async (input: { password?: string; [key: string]: unknown }) => input,
      checkForUpdates: async () => ({ available: true, version: '2.0.0' }),
      downloadUpdate: async () => ({ ok: true }),
      installUpdate: async () => undefined,
      onUpdateEvent: () => () => undefined,
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '检查更新' }).click();
  await expect(page.getByText(/新版本已就绪/)).toBeVisible();
});

test('exports the diagram as PNG and SVG', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 768, '桌面导出');
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出为 PNG' }).click();
  expect((await pngDownload).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const svgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出为 SVG' }).click();
  expect((await svgDownload).suggestedFilename()).toMatch(/\.svg$/);
});
