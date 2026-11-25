import { watchAnswers } from './backend.js';
import { escapeHtml } from './ui.js';

export function mountAnswers(root, entry) {
  root.innerHTML = `<h2>우리 반 인수인계서</h2>
    <p data-board-status role="status">같은 수업에 제출된 답변을 불러오는 중입니다.</p>
    <ul class="submission-board" data-answers></ul>
    <button type="button" data-board-retry hidden>다시 연결</button>`;
  const status = root.querySelector('[data-board-status]');
  const list = root.querySelector('[data-answers]');
  const retry = root.querySelector('[data-board-retry]');
  let disposed = false;
  let unsubscribe;
  let generation = 0;

  async function connect() {
    const version = ++generation;
    unsubscribe?.();
    const active = () => !disposed && generation === version;
    retry.hidden = true;
    status.textContent = '같은 수업에 제출된 답변을 불러오는 중입니다.';
    const failed = () => {
      if (!active()) return;
      list.replaceChildren();
      status.textContent = '답변을 불러오지 못했습니다. 연결 상태를 확인해 주세요.';
      retry.hidden = false;
    };
    try {
      const stop = await watchAnswers(entry, answers => {
        if (!active()) return;
        status.textContent = answers.length ? '제출된 답변이 실시간으로 표시됩니다.' : '공유된 답변이 아직 없습니다.';
        list.innerHTML = answers.sort((a, b) =>
          Number(b.id === entry.playerId) - Number(a.id === entry.playerId)
          || (a.submittedAt?.toMillis?.() || 0) - (b.submittedAt?.toMillis?.() || 0)
        ).map(answer => `<li class="shared-answer ${answer.id === entry.playerId ? 'own-answer' : ''}">
          <h3>${escapeHtml(answer.name)} ${answer.id === entry.playerId ? '<span>내 답변</span>' : ''}</h3>
          <dl class="student-answers"><dt>강화할 교육</dt><dd>${escapeHtml(answer.education)}</dd>
          <dt>그 이유</dt><dd>${escapeHtml(answer.reason)}</dd></dl>
        </li>`).join('');
      }, failed);
      if (active()) unsubscribe = stop;
      else stop();
    } catch {
      failed();
    }
  }

  retry.onclick = connect;
  connect();
  return () => { disposed = true; unsubscribe?.(); };
}
