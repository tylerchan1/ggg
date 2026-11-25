import { escapeHtml, meters, signed } from './ui.js';

export function showNews(root, story, decisionYear, stats, previousCard, onConfirm, onRestart) {
  const change = story.socialChaos;
  const direction = change > 0 ? '증가' : change < 0 ? '감소' : '변화 없음';
  root.innerHTML = `<div class="news-underlay"><h2 class="date">${decisionYear}년</h2>${meters(stats)}
      ${previousCard ? `<div class="card" inert>${previousCard}</div>` : ''}</div>
    <dialog class="news-dialog" aria-labelledby="news-title">
      <div class="news-masthead"><strong>NEWS</strong><span>${story.year}년 · 우리 사회의 변화</span>
        <button type="button" class="news-restart" data-news-restart aria-label="처음부터" title="처음부터">↻</button></div>
      <div class="news-article" tabindex="0" role="region" aria-label="뉴스 기사">
        <h2 id="news-title">${escapeHtml(story.title)}</h2>
        <p class="news-body">${escapeHtml(story.detail)}</p>
      </div>
      <div class="news-footer">
        <p class="chaos-change ${change > 0 ? 'chaos-up' : 'chaos-down'}">
          사회혼란 ${direction}${change ? ` · ${signed(change)}` : ''}</p>
        <button type="button" class="primary" data-news-confirm autofocus>확인</button>
      </div>
    </dialog>`;
  const dialog = root.querySelector('dialog');
  dialog.oncancel = event => event.preventDefault();
  dialog.querySelector('[data-news-restart]').onclick = onRestart;
  dialog.querySelector('[data-news-confirm]').onclick = () => {
    dialog.close();
    onConfirm();
  };
  dialog.showModal();
}
