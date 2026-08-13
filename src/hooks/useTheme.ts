import { useEffect } from 'react';
import { useAppStore, type ThemePreference } from '@/store/useAppStore';
import { getTheme, setTheme } from '@/services/workspace-db';

const VALID: ThemePreference[] = ['light', 'dark', 'system'];

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return preference;
}

/**
 * 主题偏好：启动时从 IndexedDB 读取，应用到 html[data-theme]，
 * system 模式跟随操作系统切换，偏好变更防抖持久化。
 */
export function useTheme(): void {
  const theme = useAppStore(state => state.theme);
  const setThemePreference = useAppStore(state => state.setTheme);
  const setResolvedTheme = useAppStore(state => state.setResolvedTheme);

  useEffect(() => {
    let active = true;
    void getTheme()
      .then(value => {
        if (!active || !value || !VALID.includes(value as ThemePreference)) return;
        setThemePreference(value as ThemePreference);
      })
      .catch(() => { /* 读取失败时保持默认 system */ });
    return () => { active = false; };
  }, [setThemePreference]);

  useEffect(() => {
    const apply = () => {
      const resolved = resolveTheme(theme);
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, setResolvedTheme]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void setTheme(theme).catch(() => { /* 持久化失败不打断使用 */ });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [theme]);
}
