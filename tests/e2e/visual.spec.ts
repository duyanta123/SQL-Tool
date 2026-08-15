import { test, expect, type Page } from '@playwright/test';

/** 等待画布出现并让 fitView 动画完全稳定：连续两次采样位置不变 */
async function waitForDiagramSettled(page: Page) {
  // CI 首次加载包含 IndexedDB 初始化 + Worker 解析 + 布局，给足时间
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
  const node = page.locator('.react-flow__node').first();
  await expect(node).toBeVisible({ timeout: 15000 });
  let previous = Number.NaN;
  let stableFor = 0;
  for (let i = 0; i < 40; i++) {
    const box = await node.boundingBox();
    if (box) {
      if (!Number.isNaN(previous) && Math.abs(box.x - previous) < 0.5) {
        stableFor += 1;
        if (stableFor >= 2) return;
      } else {
        stableFor = 0;
      }
      previous = box.x;
    }
    await page.waitForTimeout(150);
  }
  throw new Error('画布未在预期时间内稳定');
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
    await expect(toggle).toBeVisible();
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
