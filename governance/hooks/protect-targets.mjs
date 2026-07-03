#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit) 훅 — 보호 대상 수정 확인 게이트
// 헌법(루트 CLAUDE.md) 4대 규칙의 보호 대상을 수정하려 하면, 자동 승인(bypass) 중이라도
// 사용자(관리자)에게 '확인'을 강제한다(permissionDecision: ask). 보호 대상이 아니면 통과.
//
// 보호 대상 (루트 CLAUDE.md 보호 범위와 동일):
//   1) 루트 거버넌스 문서: e:\coding\workspace\CLAUDE.md (하위 폴더 CLAUDE.md는 제외)
//   2) _Template/Dev/** 전체
//   3) 모델 설정: .claude/settings(.local).json 또는 .claude/agents/*.md 에서 model 항목 변경

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw) || {};
  } catch {
    return; // 파싱 실패 → 간섭하지 않음
  }

  const ti = input.tool_input || {};
  const fp = ti.file_path || '';
  if (!fp) return;

  // 경로 정규화: 백슬래시→슬래시, 소문자
  const norm = fp.replace(/\\/g, '/').toLowerCase();
  const ROOT = 'e:/coding/workspace';

  // 수정될 텍스트 수집 (모델 변경 감지용) — Write/Edit/MultiEdit 필드 모두 대응
  let text = '';
  if (typeof ti.content === 'string') text += ti.content;
  if (typeof ti.file_contents === 'string') text += '\n' + ti.file_contents;
  if (typeof ti.new_string === 'string') text += '\n' + ti.new_string;
  if (Array.isArray(ti.edits)) {
    for (const e of ti.edits) {
      if (e && typeof e.new_string === 'string') text += '\n' + e.new_string;
    }
  }

  let reason = '';

  // 1) 루트 CLAUDE.md (하위 폴더 CLAUDE.md는 보호 대상 아님)
  if (norm === ROOT + '/claude.md') {
    reason = '루트 거버넌스 문서(CLAUDE.md) — 잠금(LOCKED)';
  }
  // 2) _Template/Dev/** 전체
  else if (norm.includes('/_template/dev/')) {
    reason = '_Template/Dev 보호 폴더 — 구성 변경 금지';
  }
  // 3) 모델 설정 변경 (settings.json 의 "model": / 에이전트 정의의 model:)
  else if (
    (/\/\.claude\/settings(\.local)?\.json$/.test(norm) && /["']model["']\s*:/.test(text)) ||
    (/\/\.claude\/agents\/[^/]+\.md$/.test(norm) && /(^|\n)\s*model\s*:/.test(text))
  ) {
    reason = '모델(model) 설정 변경 — 표준=opus';
  }

  if (!reason) return; // 보호 대상 아님 → 통과(일반 작업은 그대로 자유)

  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason:
        '🔒 보호 대상 수정 시도 — ' +
        reason +
        '\n대상: ' +
        fp +
        '\n헌법 규칙 3·4: 관리자 승인(무엇·왜 확인) 후에만 진행하고, 승인 시 CHANGELOG에 기록하세요.',
    },
  };
  process.stdout.write(JSON.stringify(out));
});
