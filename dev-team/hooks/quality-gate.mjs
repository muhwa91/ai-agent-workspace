#!/usr/bin/env node
// quality-gate 훅 (PostToolUse: Edit/Write/MultiEdit)
// 코드 파일을 수정하면 해당 스택 포매터로 자동 정리한다 — "설치돼 있을 때만".
// 핵심 원칙:
//   · 비차단(non-blocking): 포매터가 없거나 실패해도 작업을 막지 않는다. 항상 정상 종료.
//   · 자동설치 금지: 없으면 조용히 건너뛴다(--no-install). 새로 깔지 않는다.
//   · 결과는 logs/quality-gate.log 에 한 줄씩 남긴다(ok/skip/fail).
// 매칭: .js/.ts/.vue/.css/.json/.md→Prettier · .py→ruff · .php→pint
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const IS_WIN = process.platform === 'win32';
const q = (s) => `"${s}"`; // shell:true 에서 공백 경로 안전 처리

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (raw += d));
    process.stdin.on('end', () => resolve(raw));
    setTimeout(() => resolve(raw), 2000).unref(); // stdin 없을 때 안전장치
  });
}

function log(msg) {
  try {
    mkdirSync('logs', { recursive: true });
    appendFileSync('logs/quality-gate.log', `${new Date().toISOString()} ${msg}\n`);
  } catch { /* 로그 실패는 무시 */ }
}

// startDir 에서 위로 올라가며 marker(파일/하위경로)가 있는 디렉터리를 찾는다.
function findUp(startDir, marker) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function run(cmd, args, cwd) {
  // shell:true 로 PATH/.cmd 해석(Windows 포함). 실패해도 throw 하지 않는다.
  return spawnSync(cmd, args, { cwd, shell: true, encoding: 'utf8', timeout: 30000 });
}

async function main() {
  const raw = await readStdin();
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  if (!['Edit', 'Write', 'MultiEdit'].includes(data.tool_name || '')) return;
  const fp = data.tool_input && data.tool_input.file_path;
  if (!fp || !existsSync(fp)) return;

  const ext = path.extname(fp).toLowerCase();
  const dir = path.dirname(fp);
  const base = path.basename(fp);

  // 1) JS/TS/Vue/CSS/JSON/MD/YAML → Prettier (로컬 설치된 경우만)
  if (['.js', '.jsx', '.ts', '.tsx', '.vue', '.css', '.scss', '.json', '.md', '.html', '.yaml', '.yml'].includes(ext)) {
    const pkgDir = findUp(dir, 'package.json');
    if (!pkgDir) return; // JS 프로젝트가 아님 → 관여 안 함
    const bin = path.join(pkgDir, 'node_modules', '.bin', IS_WIN ? 'prettier.cmd' : 'prettier');
    if (!existsSync(bin)) { log(`skip  prettier 미설치 — ${base}`); return; }
    const r = run('npx', ['--no-install', 'prettier', '--write', q(fp)], pkgDir);
    log(r.status === 0
      ? `ok    prettier — ${base}`
      : `fail  prettier(${r.status}) — ${base}: ${String(r.stderr || '').trim().split('\n')[0]}`);
    return;
  }

  // 2) Python → ruff format (PATH 의 ruff, 없으면 python -m ruff)
  if (ext === '.py') {
    let r = run('ruff', ['format', q(fp)], dir);
    if (!r.error && r.status === 0) { log(`ok    ruff — ${base}`); return; }
    r = run('python', ['-m', 'ruff', 'format', q(fp)], dir);
    log((!r.error && r.status === 0) ? `ok    ruff — ${base}` : `skip  ruff 미설치/실패 — ${base}`);
    return;
  }

  // 3) PHP → pint (vendor/bin/pint 존재 + php 호환 시. 실패하면 스킵)
  if (ext === '.php') {
    const composerDir = findUp(dir, path.join('vendor', 'bin', 'pint'));
    if (!composerDir) { log(`skip  pint 미설치 — ${base}`); return; }
    const r = run('php', [q(path.join(composerDir, 'vendor', 'bin', 'pint')), q(fp)], composerDir);
    log(r.status === 0 ? `ok    pint — ${base}` : `skip  pint 실패(php 호환?) — ${base}`);
    return;
  }
}

main();
