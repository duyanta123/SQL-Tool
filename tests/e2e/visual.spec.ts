import { test, expect, type Page } from '@playwright/test';

/** 等待 fitView 动画稳定：节点位置连续两次采样不变 */
async function waitForDiagramSettled(page: Page) {
  const node = page.locator('.react-flow__node').first();
  await expect(node).toBeVisible();
  let previous = -Infinity;
  await expect.poll(async () => {
    const box = await node.boundingBox();
    if (!box) return false;
    const stable = Math.abs(box.x - previous) < 0.5;
    previous = box.x;
    return stable;
  }, { timeout: 6000 }).toBe(true);
}

test.describe('视觉回归基线 visual baselines', () => {
  test('ER 图（亮色）', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 768, '桌面视觉基线');
    await page.goto('/');
    await waitForDiagramSettled(page);
    await expect(page.locator('.react-flow')).toHaveScreenshot('er-light.png');
  });

  test('ER 图（暗色）', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 768, '桌面视觉基线');
    await page.goto('/');
    const toggle = page.getByRole('button', { name: '切换主题' });
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await waitForDiagramSettled(page);
    await expect(page.locator('.react-flow')).toHaveScreenshot('er-dark.png');
  });

  test('数据流图', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 768, '桌面视觉基线');
    await page.goto('/');
    await page.getByRole('tab', { name: '数据流图' }).click();
    await waitForDiagramSettled(page);
    await expect(page.locator('.react-flow')).toHaveScreenshot('dataflow.png');
  });
});
