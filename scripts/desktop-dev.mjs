// 零依赖的 Electron HMR 开发脚本：启动 vite dev server，就绪后以 ELECTRON_RENDERER_URL 启动 Electron
import { spawn } from 'node:child_process';

const VITE_URL = 'http://127.0.0.1:5173';

// Windows 下 shell:true 的子进程需 taskkill 连带进程树，避免残留
function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return false;
}

const vite = spawn('npx', ['vite', '--port', '5173', '--strictPort'], { shell: true, stdio: 'inherit' });

if (!(await waitForServer(VITE_URL))) {
  console.error(`[desktop-dev] ${VITE_URL} 30 秒内未就绪，退出`);
  killTree(vite);
  process.exit(1);
}

const electron = spawn('npx', ['electron', '.'], {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RENDERER_URL: VITE_URL },
});

const shutdown = () => {
  killTree(electron);
  killTree(vite);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
electron.on('exit', () => {
  killTree(vite);
  process.exit(0);
});
