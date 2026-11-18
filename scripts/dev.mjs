#!/usr/bin/env node
/**
 * 一条命令启动整个项目（不含 OpenCode）。
 *
 *   node scripts/dev.mjs            # 三个进程：引擎验收台 + 产品外壳 + 桥接
 *   node scripts/dev.mjs --no-lab   # 只起产品和桥接
 *
 * 为什么是三个进程而不是一个：
 *   - `:5173` 引擎验收台（根 vite）—— 无 HUD 干扰地看场景，截图/parity 脚本的靶子
 *   - `:5180` 产品外壳（shell vite）—— 通过 `@loom` 别名直接引用 `../src`，已包含引擎
 *   - `:8788` 桥接（shell/server）—— 给外壳提供同源 `/api`，把 OpenCode 挡在服务端
 *
 * 前两个是 Vite dev server，各有独立配置与端口（5173 / 5180），
 * 这在本仓库是既有事实；本脚本只负责把它们和桥接一起拉起来、统一收尾。
 *
 * OpenCode 不在这里启动。它缺失时桥接会照常监听，外壳会如实显示"未连接"，
 * 这是预期状态，不是错误。
 *
 * 端口沿用各自配置文件里的值（vite.config.ts），不在这里重复声明，
 * 避免出现第二份事实。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = path.join(ROOT, 'shell');
const IS_WIN = process.platform === 'win32';
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR;

const argv = new Set(process.argv.slice(2));
const WITH_LAB = !argv.has('--no-lab');

/** 与 vite.config.ts 保持一致的端口（仅用于就绪探测和提示，不作为启动参数）。 */
const PORTS = { lab: 5173, shell: 5180, bridge: 8788 };

const c = (code) => (s) => (USE_COLOR ? `\u001b[${code}m${s}\u001b[0m` : String(s));
const dim = c('2');
const bold = c('1');
const tags = {
  lab: c('35')('lab   '),
  shell: c('36')('shell '),
  bridge: c('33')('bridge'),
};

const children = [];
let shuttingDown = false;
/**
 * 是否用管道接管子进程输出（加 `[shell]` / `[bridge]` 前缀）。
 *
 * 受限环境（例如某些沙箱/CI）不允许为子进程创建管道，spawn 会直接抛 EPERM。
 * 那种情况下退回 inherit：日志不再带前缀，但一条命令依然能起全部服务。
 * 只在第一次失败时降级一次，之后所有子进程都走 inherit。
 */
let pipesEnabled = true;
let warnedNoPipes = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnChild(command, args, options, piped) {
  return spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: piped ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
    // POSIX 上单独成组，收尾时才能连同 esbuild 子进程一起干净杀掉。
    detached: !IS_WIN,
  });
}

function run(name, command, args, options) {
  const prefix = tags[name] ?? name;

  let child;
  try {
    child = spawnChild(command, args, options, pipesEnabled);
  } catch (err) {
    if (err?.code === 'EPERM' && pipesEnabled) {
      pipesEnabled = false;
      if (!warnedNoPipes) {
        warnedNoPipes = true;
        process.stderr.write(
          `  ${dim('当前环境不允许管道接管子进程输出，已退回直接输出（日志没有进程前缀）。')}\n`,
        );
      }
      child = spawnChild(command, args, options, false);
    } else {
      throw err;
    }
  }
  children.push({ name, child });

  if (child.stdout && child.stderr) {
    const relay = (stream, target) => {
      let buffer = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) target.write(`${prefix} ${line}\n`);
      });
      stream.on('end', () => {
        if (buffer.trim()) target.write(`${prefix} ${buffer}\n`);
      });
    };
    relay(child.stdout, process.stdout);
    relay(child.stderr, process.stderr);
  }

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const how = signal ? `signal ${signal}` : `code ${code}`;
    process.stderr.write(`${prefix} ${dim(`已退出（${how}）`)}\n`);
    // 一个进程被外部关掉（典型是端口占用）时，整体收尾，避免留下半套服务。
    shutdown(1);
  });

  child.on('error', (err) => {
    process.stderr.write(`${prefix} 启动失败：${err.message}\n`);
    shutdown(1);
  });

  return child;
}

/** 轮询直到端口有响应。返回耗时毫秒；超时返回 null。 */
async function waitForPort(port, timeoutMs = 40_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, { method: 'GET' });
      return Date.now() - started;
    } catch {
      // 还没起来：/api 之外的路径也可能 404，但 fetch 不会 throw，
      // 所以这里抛异常等价于"连接被拒"。
    }
    await sleep(200);
  }
  return null;
}

function killTree(pid) {
  if (IS_WIN) {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (child.pid && child.exitCode === null) killTree(child.pid);
  }
  // 给子进程一点时间被回收，然后退出。
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function banner(results) {
  /** @param {string} key 进程名（results 的键） @param {string} label 展示名 */
  const line = (key, label, url, note = '') => {
    const ms = results[key];
    const ok = ms != null;
    const mark = ok ? c('32')('✓') : c('31')('✗');
    const time = ok ? dim(`${(ms / 1000).toFixed(1)}s`) : dim('未就绪');
    return `  ${mark} ${label.padEnd(14)} ${url.padEnd(30)} ${time} ${note}`;
  };

  process.stdout.write('\n');
  process.stdout.write(`${bold('  KunlunMeta · 开发环境已就绪')}\n\n`);
  process.stdout.write(`${line('shell', '产品外壳', `http://127.0.0.1:${PORTS.shell}`, dim('← 从这里开始'))}\n`);
  if (WITH_LAB) {
    process.stdout.write(`${line('lab', '引擎验收台', `http://127.0.0.1:${PORTS.lab}`, dim('无 HUD，看场景'))}\n`);
  }
  process.stdout.write(`${line('bridge', '桥接 /api', `http://127.0.0.1:${PORTS.bridge}/api/health`, '')}\n`);
  process.stdout.write('\n');
  process.stdout.write(dim('  OpenCode 未启动时，外壳显示「未连接」是预期状态（本命令不包含它）。\n'));
  process.stdout.write(dim(`  Ctrl+C 一次，${WITH_LAB ? '三' : '两'}个进程一起退出。\n\n`));
}

async function main() {
  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(viteBin)) {
    process.stderr.write(
      `  找不到 ${viteBin}\n  先在仓库根跑一次 npm install。\n`,
    );
    process.exit(1);
  }

  process.stdout.write(dim(`  启动中：${WITH_LAB ? '引擎验收台 + 产品外壳 + 桥接' : '产品外壳 + 桥接'}\n`));

  // 1) 桥接先起：外壳的 /api 代理一旦有请求就需要它，先就位更稳。
  run('bridge', process.execPath, [path.join(SHELL, 'server', 'index.mjs')], {
    cwd: ROOT,
    // 与 shell/package.json 的 `npm run bridge`（cwd=shell）不同：这里显式把项目目录
    // 指到仓库根，界面里显示的"项目"才是这个仓库。需要别的目录时用环境变量覆盖。
    env: {
      BRIDGE_PORT: String(PORTS.bridge),
      BRIDGE_PROJECT_DIR: process.env.BRIDGE_PROJECT_DIR || ROOT,
    },
  });

  // 2) 两个 Vite：都用根目录的 vite 可执行文件，cwd 决定各自的配置与 dist 位置。
  run('shell', process.execPath, [viteBin], { cwd: SHELL, env: {} });
  if (WITH_LAB) run('lab', process.execPath, [viteBin], { cwd: ROOT, env: {} });

  const targets = [['bridge', PORTS.bridge], ['shell', PORTS.shell]];
  if (WITH_LAB) targets.push(['lab', PORTS.lab]);

  const results = {};
  const settled = await Promise.all(
    targets.map(async ([name, port]) => [name, await waitForPort(port)]),
  );
  for (const [name, ms] of settled) results[name] = ms;

  // 任何一个没起来就不再报"就绪"，并保留日志让用户看清楚。
  if (Object.values(results).some((v) => v == null)) {
    process.stderr.write('\n');
    process.stderr.write(c('31')('  有服务在 40 秒内没有就绪。常见原因是端口被占用：\n'));
    for (const [name, port] of targets) {
      if (results[name] == null) process.stderr.write(c('31')(`    ${name} → ${port}\n`));
    }
    process.stderr.write(dim('  先关掉占用端口的进程，或改各自的 vite.config.ts / BRIDGE_PORT。\n\n'));
    shutdown(1);
    return;
  }

  banner(results);
}

main().catch((err) => {
  process.stderr.write(`  启动器自身出错：${err?.stack || err}\n`);
  shutdown(1);
});
