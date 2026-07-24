import { test, expect } from '@playwright/test';

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
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const nodeBox = await page.locator('.react-flow__node').first().boundingBox();
  const viewport = page.viewportSize();
  expect(nodeBox).not.toBeNull();
  expect(nodeBox!.x + nodeBox!.width).toBeGreaterThan(0);
  expect(nodeBox!.x).toBeLessThan(viewport!.width);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
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
    (window as any).__introspectionCount = 0;
    const snapshot = { connectionId: 'mock-db', fetchedAt: Date.now(), tables: [{ id: 'public.users', schema: 'public', name: 'users', columns: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isUnique: true }], foreignKeys: [] }] };
    (window as any).sqlVisualizerDesktop = {
      testConnection: async (input: any) => input?.chooseFile ? { ok: true, message: 'selected', filePath: 'C:\\data\\mock.db' } : { ok: true, message: 'ok' },
      introspectSchema: async () => { (window as any).__introspectionCount += 1; return { ...snapshot, fetchedAt: Date.now() }; },
      disconnect: async () => undefined,
      listProfiles: async () => [],
      saveProfile: async (input: any) => { const { password: _password, ...profile } = input; return profile; },
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
  await expect.poll(() => page.evaluate(() => (window as any).__introspectionCount)).toBeGreaterThanOrEqual(2);
  await page.getByLabel('每 30 秒自动同步').check();
  await expect.poll(() => page.evaluate(() => (window as any).__introspectionCount)).toBeGreaterThanOrEqual(3);
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
