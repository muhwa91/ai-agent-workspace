// Stop hook — Claude 가 응답을 마칠 때마다 이번 세션의 전체 대화(답변·진행과정)를
// logs/sessions/<session_id>.jsonl 로 보존한다. 트랜스크립트에는 사용자 질문과
// Claude 의 답변, 도구 실행 내역이 모두 들어있으므로 "어디까지 했는지" 원본 기록이 된다.
// hook 은 작업을 방해하면 안 되므로 어떤 오류가 나도 조용히 종료한다.
import fs from 'node:fs';
import path from 'node:path';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');
    const cwd = data.cwd || process.cwd();
    const sessionsDir = path.join(cwd, 'logs', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const tpath = data.transcript_path;
    if (tpath && fs.existsSync(tpath) && data.session_id) {
      fs.copyFileSync(tpath, path.join(sessionsDir, `${data.session_id}.jsonl`));
    }

    fs.appendFileSync(
      path.join(cwd, 'logs', 'sessions.log'),
      `${new Date().toISOString()}  session ${data.session_id ?? '?'} 응답 종료\n`,
      'utf8',
    );
  } catch {
    // 무시 — 보존 실패가 사용자 작업을 막지 않도록 한다.
  }
  process.exit(0);
});
