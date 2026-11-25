import { metrics } from './events.js';
import { endingFor } from './endings.js';
import { illustration, storyTopic, topicLabel } from './visuals.js';

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
export const signed = value => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';

const barWidth = value => Math.min(100, Math.max(0, value));

export function meters(stats) {
  return `<div class="meters">${metrics.map(({ label, color, icon }, i) => `
    <div class="meter ${(i === 3 ? stats[i] > 100 : stats[i] < 0) ? 'breach' : ''}" style="--meter-color:${color}">
      <svg viewBox="0 0 28 28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">${icon}</svg>
      <div class="track" aria-hidden="true"><div class="fill" style="width:${barWidth(stats[i])}%"></div><div class="meter-preview" hidden></div></div>
      <span>${label}</span><strong>${stats[i]}</strong>
    </div>`).join('')}</div>`;
}

export function previewMeters(group, stats, effects, opacity = 1) {
  group.querySelectorAll('.meter-preview').forEach((area, i) => {
    const current = barWidth(stats[i]);
    const projected = effects ? barWidth(stats[i] + effects[i]) : current;
    area.hidden = current === projected;
    area.style.left = `${Math.min(current, projected)}%`;
    area.style.width = `${Math.abs(projected - current)}%`;
    area.style.opacity = opacity;
  });
}

export function animateMeters(group, previous, current) {
  if (!group || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  group.querySelectorAll('.meter').forEach((meter, i) => {
    if (previous[i] === current[i]) return;
    const fill = meter.querySelector('.fill');
    if (!fill.animate) return;
    const number = meter.querySelector('strong');
    const duration = 360;
    number.textContent = previous[i];
    const animation = fill.animate([{ width: `${barWidth(previous[i])}%` }, { width: `${barWidth(current[i])}%` }], {
      duration, easing: 'ease-out',
    });
    function update() {
      if (!number.isConnected) return;
      const progress = animation.effect.getComputedTiming().progress;
      if (progress === null || animation.playState === 'finished') {
        number.textContent = current[i];
        return;
      }
      number.textContent = Math.round(previous[i] + (current[i] - previous[i]) * progress);
      requestAnimationFrame(update);
    }
    animation.ready.then(() => requestAnimationFrame(update));
  });
}

export function newsList(stories) {
  return stories.map(story => `<li><strong>${story.year}년 · ${escapeHtml(story.title)}</strong>
    <p>${escapeHtml(story.detail)}</p><small>사회혼란 ${signed(story.socialChaos)}</small></li>`).join('');
}

export function renderTimeline(timeline) {
  return `<ol class="timeline">${timeline.map(item => `<li><strong>${item.year}년</strong>
    ${item.eventId.startsWith('CRISIS_') ? '<span class="emergency-label">긴급 대응</span>' : ''}
    ${escapeHtml(item.title)}</li>`).join('')}</ol>`;
}

export function renderReport(report, expandTimeline = false) {
  const list = items => `<ul class="report-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  if (!expandTimeline) return renderEpilogue(report, list);
  return `<article class="report">
    <div class="mini">2036년 · 가상 미래신문 특별호</div>
    <h2 id="report-title" tabindex="-1">최종 사회 보고서</h2>
    <section><h3>교육청 운영 현황</h3>${meters(report.stats)}
      <p><strong>미해결 위기</strong> · ${report.unresolved.length ?
        report.unresolved.map(item => `${escapeHtml(item.title)} (${item.value})`).join(', ') : '없음'}</p></section>
    <section><h3>우리 사회의 변화</h3><ul class="report-list">${newsList(report.news)}</ul></section>
    <section><h3>주요 교육 성과</h3>${list(report.achievements)}</section>
    <section><h3>남겨진 사회문제</h3>${list(report.issues)}</section>
    <details ${expandTimeline ? 'open' : ''}><summary>정책 결정 기록</summary>${renderTimeline(report.timeline)}</details>
  </article>`;
}


function renderEpilogue(report, list) {
  const finale = report.news.at(-1);
  const ending = endingFor(report.news);
  const lead = report.news.find(story => story.year === 2036 && story.socialChaos < 0) ?? finale;
  const challenge = [...report.news].sort((a, b) => b.socialChaos - a.socialChaos)[0];
  const remainingAchievements = report.achievements.filter(text => text !== lead.achievement && text !== finale.achievement);
  const remainingIssues = report.issues.filter(text => text !== challenge.issue);
  return `<article class="epilogue">
    <header class="epilogue-hero">
      ${illustration(ending?.image ?? storyTopic(finale))}
      <div><p class="mini">2036년 · 교육감 임기 종료</p>
      <h2 id="report-title" tabindex="-1">2036년, 당신이 만들어낸 미래</h2>
      ${ending ? `<h3>${escapeHtml(ending.title)}</h3><p>${escapeHtml(ending.summary)}</p>
      <p class="epilogue-final-policy"><strong>마지막 정책의 결과</strong> ${escapeHtml(finale.detail)}</p>`
      : `<p>${escapeHtml(finale.detail)}</p>`}</div>
    </header>
    <section class="epilogue-section">
      <h3>우리가 이루어낸 변화</h3>
      <div class="epilogue-feature">${illustration(storyTopic(lead))}
        <div><h4>${topicLabel(storyTopic(lead))}</h4><p>${escapeHtml(lead.achievement)}</p></div></div>
      ${remainingAchievements.length ? list(remainingAchievements) : ''}
    </section>
    <section class="epilogue-section">
      <h3>아직 남겨진 과제</h3>
      <div class="epilogue-feature">${illustration(storyTopic(challenge, true))}
        <div><h4>${topicLabel(storyTopic(challenge, true))}</h4><p>${escapeHtml(challenge.issue)}</p></div></div>
      ${remainingIssues.length ? list(remainingIssues) : ''}
      ${report.unresolved.length ? `<p class="epilogue-unresolved"><strong>미해결 위기</strong> · ${report.unresolved.map(item =>
        `${escapeHtml(item.title)} (${item.value})`).join(', ')}</p>` : ''}
    </section>
    <section class="epilogue-section compact-metrics"><h3>교육청 운영 현황</h3>${meters(report.stats)}</section>
    <details class="epilogue-details"><summary>정책 결정 기록</summary>${renderTimeline(report.timeline)}</details>
    <details class="epilogue-details"><summary>가상 미래 뉴스 모아 보기</summary><ul class="report-list">${newsList(report.news)}</ul></details>
  </article>`;
}
