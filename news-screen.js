import { escapeHtml, meters, signed } from './ui.js';
import { illustration, storyTopic } from './visuals.js';

export function showNews(root, story, previousYear, stats, previousCard, onConfirm, onRestart) {
  const change = story.socialChaos;
  const direction = change > 0 ? '증가' : change < 0 ? '감소' : '변화 없음';
  root.innerHTML = `<div class="news-underlay"><h2 class="date">${story.year}년</h2>${meters(stats)}
      ${previousCard ? `<div class="card" inert>${previousCard}</div>` : ''}</div>
    <dialog class="news-dialog" aria-labelledby="news-title">
      <div class="news-masthead"><strong>NEWS</strong><span>${story.year}년 · 가상 특별 보도</span></div>
      <h2 id="news-title">${escapeHtml(story.title)}</h2>
      ${illustration(storyTopic(story))}
      <p class="news-body">${escapeHtml(story.detail)}</p>
      <p class="chaos-change ${change > 0 ? 'chaos-up' : 'chaos-down'}">
        사회혼란 ${direction}${change ? ` · ${signed(change)}` : ''}</p>
      <button type="button" class="primary full" data-news-confirm>확인</button>
      <button type="button" class="news-restart" data-news-restart>↻ 처음부터</button>
    </dialog>`;
  const dialog = root.querySelector('dialog');
  dialog.oncancel = event => event.preventDefault();
  dialog.querySelector('[data-news-restart]').onclick = onRestart;
  const open = () => { if (dialog.isConnected) dialog.showModal(); };
  dialog.querySelector('[data-news-confirm]').onclick = () => {
    dialog.close();
    onConfirm();
  };

  if (previousYear !== story.year && !matchMedia('(prefers-reduced-motion: reduce)').matches && typeof dialog.animate === 'function') {
    const year = root.querySelector('.date');
    year.animate([{ transform: 'translateY(8px)', opacity: .15 }, { transform: 'none', opacity: 1 }], { duration: 350 })
      .finished.then(open, open);
  } else {
    open();
  }
}
