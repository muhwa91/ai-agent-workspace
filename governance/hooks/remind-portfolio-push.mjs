#!/usr/bin/env node
// PostToolUse(Bash) 훅: workspace(비공개 작업 레포)에 `git push`가 실행되면
// 직전 커밋(HEAD)의 변경 파일을 보고 분기한다 (2026-06-24 개정: 포폴용은 묻지 말고 자동 미러):
//  (A) 포폴용 프로젝트(.claude/portfolio-targets.json 등재) 코드 변경 포함
//      → "묻지 말고 자동으로 포폴(공개 레포)에 미러 푸시" 지시 (관리자 durable 승인)
//  (B) 비포폴 프로젝트(예: example_project)만 변경 → 포폴 미러 생략 안내
//  (C) 프로젝트 코드 변경 없음(거버넌스·템플릿·내부문서) → 미러 생략 안내
//  (안전 폴백) 포폴 대상 설정 로드 실패 → 자동 미러 금지, 사용자 확인
// 포폴 레포 등 origin이 workspace가 아닌 푸시에는 아무것도 하지 않는다(오알림 방지).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    cmd = ((JSON.parse(raw) || {}).tool_input || {}).command || '';
  } catch {
    return;
  }

  // git push 명령인지 (다른 git 하위명령 제외)
  if (!/\bgit\b[^|&;]*\bpush\b/.test(cmd)) return;

  // 실효 디렉터리 추출: `git -C <path>` 우선, 없으면 `cd <path>`, 없으면 훅의 cwd
  const pick = (m) => (m ? m[2] || m[3] || m[4] : null);
  const gitC = pick(cmd.match(/git\s+-C\s+("([^"]+)"|'([^']+)'|(\S+))/));
  const cd = pick(cmd.match(/cd\s+("([^"]+)"|'([^']+)'|(\S+))/));

  // POSIX(Git Bash) 경로 /e/coding/... → Windows 경로 E:\coding\... 변환 (Node cwd용)
  const toWin = (p) => {
    const m = p && p.match(/^\/([a-zA-Z])\/(.*)$/);
    return m ? `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}` : p;
  };

  const explicit = gitC || cd; // 명령에 명시된 대상 디렉터리(있으면)
  const cwd = explicit ? toWin(explicit) : process.cwd();

  // 그 디렉터리의 origin 확인 — 해석 실패하면 묻지 않음(오알림 방지)
  let origin = '';
  try {
    origin = execSync('git remote get-url origin', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return;
  }

  // workspace 레포 푸시일 때만 동작
  if (!/workspace/.test(origin)) return;

  // 이번 푸시에 올라간 변경 파일 목록 (직전 1커밋 근사 — 대부분 1커밋 푸시)
  let changed = '';
  try {
    changed = execSync('git show --name-only --pretty=format: HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    changed = '';
  }

  // 변경된 프로젝트 폴더명 추출 (Hachiware/_Project/<name>/...)
  const changedProjects = new Set();
  for (const line of changed.split('\n')) {
    const m = line.match(/^Hachiware\/_Project\/([^/]+)\//);
    if (m) changedProjects.add(m[1]);
  }

  const emit = (ctx) => {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: ctx },
      })
    );
  };

  // (C) 프로젝트 코드 변경이 전혀 없음 → 미러 대상 아님
  if (changedProjects.size === 0) {
    emit(
      'workspace(비공개 작업 레포)에 git push가 실행되었습니다. ' +
        '이번 변경에는 포폴 대상 프로젝트 코드(Hachiware/_Project/ 하위)가 없습니다(거버넌스·템플릿·내부 운영 문서 등). ' +
        '포폴 미러는 생략하고 "포폴 대상 변경 없음 — 미러 생략" 정도만 간단히 안내하세요.'
    );
    return;
  }

  // 포폴 대상 정본(.claude/portfolio-targets.json) 로드
  let targets = null;
  try {
    const cfgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'portfolio-targets.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    targets = Array.isArray(cfg.targets) ? cfg.targets : [];
  } catch {
    targets = null; // 로드 실패 → 안전 폴백
  }

  // 안전 폴백: 설정 로드 실패 시 자동 미러하지 말고 확인
  if (targets === null) {
    emit(
      'workspace에 git push가 실행되었고 프로젝트 코드(' +
        [...changedProjects].join(', ') +
        ')가 변경됐습니다. 다만 포폴 대상 설정(.claude/portfolio-targets.json) 로드에 실패해 자동 판정을 못 했습니다. ' +
        '안전을 위해 자동 미러하지 말고, 이 프로젝트가 포폴용인지 사용자에게 확인한 뒤 진행하세요(정책: 루트 _Core/PORTFOLIO.md).'
    );
    return;
  }

  const targetNames = new Set(targets.map((t) => t.project));
  const portfolioChanged = [...changedProjects].filter((p) => targetNames.has(p));
  const otherChanged = [...changedProjects].filter((p) => !targetNames.has(p));

  // (A) 포폴용 프로젝트 변경 포함 → 묻지 말고 자동 미러
  if (portfolioChanged.length > 0) {
    const detail = portfolioChanged
      .map((p) => {
        const t = targets.find((x) => x.project === p);
        return `- ${p}: 공개레포 ${t.publicRepo} / 클론 ${t.clonePath}`;
      })
      .join('\n');
    emit(
      'workspace(비공개)에 git push 완료. 포폴용 프로젝트(' +
        portfolioChanged.join(', ') +
        ') 코드가 변경됐습니다.\n' +
        '규칙[portfolio-push-ask-rule, 2026-06-24 자동 미러로 개정]: 사용자에게 묻지 말고 곧바로 포폴(공개 레포)에 미러 푸시하세요(관리자 durable 승인).\n' +
        '대상:\n' +
        detail +
        '\n미러 절차: 큐레이션(README 등 공개전용 파일 보존, .env·logs·내부문서·디버그 스크립트 제외) → 푸시 전 유출 스캔(비밀키·토큰·계좌·내부경로) → 비밀 감지 시에만 중단·보고, 아니면 공개 레포 push. 상세: [[portfolio-mirror-repos]] / 루트 _Core/PORTFOLIO.md.' +
        (otherChanged.length ? '\n비포폴 프로젝트(' + otherChanged.join(', ') + ')는 미러하지 않습니다.' : '')
    );
    return;
  }

  // (B) 변경된 프로젝트가 모두 비포폴
  emit(
    'workspace(비공개)에 git push 완료. 변경된 프로젝트(' +
      otherChanged.join(', ') +
      ')는 포폴용이 아닙니다(루트 _Core/PORTFOLIO.md 분류). ' +
      '포폴 미러는 생략하고 "포폴 대상 아님 — 미러 생략"만 간단히 안내하세요. 절대 자동으로 포폴에 푸시하지 마세요.'
  );
});
