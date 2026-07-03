// SessionStart hook — 문서 기본 도구를 '묻지 않고' 자동 준비한다.
//  - pandoc(필수): HTML·Word·PDF 변환의 핵심. winget '사용자 범위' 설치 → 관리자 권한(UAC) 불필요.
//  - Chrome(필수): PDF 는 Chrome 헤드리스 인쇄로 생성한다. 없으면 자동 설치(처음 한 번 권한 승인이 필요할 수 있음).
//  - 설치는 세션을 막지 않도록 백그라운드(detached)로 돌리고, 어떤 경우에도 정상 종료한다.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';

function hasCmd(cmd) {
  try { execSync(`where ${cmd}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function chromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

function bgInstall(id, extraArgs) {
  const args = [
    'install', '--id', id, '-e', '--silent', '--disable-interactivity',
    '--accept-source-agreements', '--accept-package-agreements', ...extraArgs,
  ];
  const child = spawn('winget', args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

const installing = [];
try {
  if (!hasCmd('pandoc')) { bgInstall('JohnMacFarlane.Pandoc', ['--scope', 'user']); installing.push('pandoc'); }
  if (!chromePath()) { bgInstall('Google.Chrome', []); installing.push('Chrome'); }
} catch {
  // 무시 — 점검·설치 실패가 세션 시작을 막지 않도록 한다.
}

if (installing.length) {
  const msg =
    `🔧 문서 기본 도구(${installing.join(', ')})가 없어 백그라운드 자동 설치를 시작했습니다. ` +
    `pandoc 은 권한 창 없이 설치되고, Chrome 은 처음 설치 시 한 번 권한 승인이 필요할 수 있습니다. ` +
    `설치 후 새 세션에서 HTML·Word·PDF(Chrome 인쇄) 변환이 가능합니다.`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg },
  }));
}
process.exit(0);
