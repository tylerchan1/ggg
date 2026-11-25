import { metrics } from './events.js';

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
export const signed = value => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';

export function meters(stats) {
  return `<div class="meters">${metrics.map(({ label, color, icon }, i) => `
    <div class="meter ${(i === 3 ? stats[i] > 100 : stats[i] < 0) ? 'breach' : ''}" style="--meter-color:${color}">
      <svg viewBox="0 0 28 28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">${icon}</svg>
      <div class="track" aria-hidden="true"><div class="fill" style="width:${Math.min(100, Math.max(0, stats[i]))}%"></div></div>
      <span>${label}</span><strong>${stats[i]}</strong>
    </div>`).join('')}</div>`;
}

export function deltas(effects) {
  return `<span class="deltas">${metrics.map(({ label }, i) => {
    const impact = effects[i] * (i === 3 ? -1 : 1);
    return `<span class="${impact > 0 ? 'positive' : impact < 0 ? 'negative' : 'neutral'}">
      <span>${label}</span><strong>${signed(effects[i])}</strong>
    </span>`;
  }).join('')}</span>`;
}

export function newsList(stories) {
  return stories.map(story => `<li><strong>${story.year}년 · ${escapeHtml(story.title)}</strong>
    <p>${escapeHtml(story.detail)}</p></li>`).join('');
}

export function renderTimeline(timeline) {
  return `<ol class="timeline">${timeline.map(item => `<li><strong>${item.year}년</strong>
    ${item.eventId.startsWith('CRISIS_') ? '<span class="emergency-label">긴급 대응</span>' : ''}
    ${escapeHtml(item.title)}</li>`).join('')}</ol>`;
}

export function renderReport(report) {
  const list = items => `<ul class="report-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  return `<article class="report">
    <div class="mini">2036년 · 가상 미래신문 특별호</div>
    <h2 id="report-title" tabindex="-1">최종 사회 보고서</h2>
    <section><h3>교육청 운영 현황</h3>${meters(report.stats)}
      <p><strong>미해결 위기</strong> · ${report.unresolved.length ?
        report.unresolved.map(item => `${escapeHtml(item.title)} (${item.value})`).join(', ') : '없음'}</p></section>
    <section><h3>우리 사회의 변화</h3><ul class="report-list">${newsList(report.news)}</ul></section>
    <section><h3>주요 교육 성과</h3>${list(report.achievements)}</section>
    <section><h3>남겨진 사회문제</h3>${list(report.issues)}</section>
    <details><summary>정책 결정 기록</summary>${renderTimeline(report.timeline)}</details>
  </article>`;
}
