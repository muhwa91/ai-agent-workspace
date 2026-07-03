// UserPromptSubmit hook — 사용자의 질문(프롬프트)을 logs/prompts.jsonl 에 자동 기록.
// Claude Code 가 stdin 으로 { session_id, transcript_path, cwd, prompt } JSON 을 넘겨준다.
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
    const logDir = path.join(cwd, 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const record = {
      time: new Date().toISOString(),
      session: data.session_id ?? null,
      prompt: data.prompt ?? '',
    };
    fs.appendFileSync(path.join(logDir, 'prompts.jsonl'), JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // 무시 — 로깅 실패가 사용자 작업을 막지 않도록 한다.
  }
  process.exit(0);
});
