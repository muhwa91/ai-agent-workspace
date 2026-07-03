// PostToolUseFailure hook — 도구가 "실패할 때만" 골라 오류를 기록한다.
//   logs/errors.log   (사람용: 시간·도구·대상·에러 한 토막을 한눈에)
//   logs/errors.jsonl (기계용: 구조화 — 나중에 집계/진단에 사용)
// 목적: 전체 트랜스크립트를 뒤지지 않고 "무엇이·어디서·왜 깨졌나"를 빨리 확인.
// hook 은 작업을 방해하면 안 되므로 어떤 오류가 나도 조용히 종료한다.
import fs from 'node:fs';
import path from 'node:path';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const d = JSON.parse(input || '{}');
    const cwd = d.cwd || process.cwd();
    const logDir = path.join(cwd, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const tool = d.tool_name ?? '?';
    const ti = d.tool_input ?? {};
    // 핵심 입력 한 토막 (명령 / 파일 / 패턴)
    const target = ti.command ?? ti.file_path ?? ti.path ?? ti.pattern ?? '';

    // 에러 메시지 추출 (PostToolUseFailure 의 필드를 방어적으로 탐색)
    const resp = d.tool_response ?? d.tool_error ?? d.error ?? d.tool_result ?? {};
    let err;
    if (typeof resp === 'string') err = resp;
    else err = resp.error ?? resp.stderr ?? resp.message ?? resp.content ?? JSON.stringify(resp);
    err = String(err).replace(/\s+/g, ' ').trim().slice(0, 500);

    const time = new Date().toISOString();

    // 기계용 jsonl
    const record = {
      time,
      session: d.session_id ?? null,
      tool,
      target: String(target).slice(0, 300),
      error: err,
    };
    fs.appendFileSync(path.join(logDir, 'errors.jsonl'), JSON.stringify(record) + '\n', 'utf8');

    // 사람용 log
    const line = `${time} ❌ ${tool} | ${String(target).slice(0, 200)}\n    ${err}\n`;
    fs.appendFileSync(path.join(logDir, 'errors.log'), line, 'utf8');
  } catch {
    // 무시 — 로깅 실패가 사용자 작업을 막지 않도록 한다.
  }
  process.exit(0);
});
