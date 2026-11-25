import { joinClass, onlineConfigured, savePlayer } from './backend.js';
import { characters, choiceLabels, metrics } from './events.js';
import { choose, eventFor, finalReport, policyTitle, startGame } from './game.js';
import { portrait } from './portraits.js';
import { deltas, escapeHtml, meters, renderReport, signed } from './ui.js';

const prefix = 're-education-v1:';
const cleanCode = value => value.trim().toUpperCase();
const key = code => prefix + (code || 'practice');
const activeKey = prefix + 'active';

function load(storageKey) {
  try {
    return JSON.parse(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function store(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

function snapshot(state) {
  return {
    status: state.phase === 'complete' ? 'submitted' : 'playing',
    year: state.year,
    decisions: state.decisions,
    crisisHistory: state.crisisHistory,
    finalReport: finalReport(state),
    handover: state.phase === 'complete' ? state.handover : null,
  };
}

export function mountStudent(app) {
  const params = new URLSearchParams(location.search);
  const codeFromLink = cleanCode(params.get('code') ?? '');
  const savedCode = codeFromLink || load(activeKey) || '';
  let entry = params.has('join') ? null : load(key(savedCode));
  if (entry && !entry.state) entry = null;
  let locked = false;
  let syncTask;
  let syncAgain = false;
  let syncFailed = false;
  let storageFailed = false;

  function persist(next) {
    entry = next;
    try {
      store(key(entry.code), entry);
      store(activeKey, entry.code);
      storageFailed = false;
    } catch {
      storageFailed = true;
    }
  }

  function statusText() {
    if (syncFailed) return storageFailed
      ? '수업 서버와 연결하지 못했습니다. 이 화면에서 다시 전송해 주세요.'
      : '수업 서버와 연결하지 못했습니다. 이 기기에 저장했으며 다시 전송할 수 있습니다.';
    if (storageFailed) return '브라우저 저장 공간을 사용할 수 없습니다. 새로고침하면 진행 내용이 사라질 수 있습니다.';
    if (!entry?.sessionId) return '연습 모드 · 이 기기에만 저장됩니다.';
    if (entry.syncedRevision < entry.revision) return '수업 서버에 동기화 중입니다.';
    return '수업 서버에 동기화했습니다.';
  }

  function updateStatus() {
    const element = app.querySelector('#sync-status');
    if (element) element.textContent = statusText();
    const retry = app.querySelector('#retry-sync');
    if (retry) retry.hidden = !syncFailed;
    const confirmation = app.querySelector('#confirmation');
    if (confirmation && entry.state.phase === 'complete') {
      confirmation.textContent = !entry.sessionId
        ? (storageFailed ? '이 기기에 저장하지 못했습니다.' : '인수인계서가 이 기기에 저장되었습니다.')
        : entry.syncedRevision >= entry.revision
          ? '인수인계서가 전달되었습니다. 지난 10년간의 교육정책을 되돌아보며 친구들과 서로 다른 미래 사회를 비교해 보세요.'
          : '인수인계서는 수업 서버로 전송을 기다리고 있습니다.';
    }
  }

  function storageStatus() {
    return '<p id="sync-status" class="hint" role="status"></p><button id="retry-sync" class="full" hidden>다시 전송하기</button>';
  }

  function sync() {
    if (!entry?.sessionId || entry.syncedRevision >= entry.revision) return;
    if (syncTask) {
      syncAgain = true;
      return;
    }
    const sent = entry;
    syncFailed = false;
    updateStatus();
    syncTask = (async () => {
      try {
        const accepted = await savePlayer(sent, snapshot(sent.state));
        if (entry?.playerId !== sent.playerId) return;
        if (!accepted) throw new Error('서버가 현재 버전을 확인하지 못했습니다.');
        const saved = load(key(entry.code));
        if (saved?.playerId === entry.playerId && saved.revision > entry.revision) {
          entry = saved;
          syncAgain = true;
          render();
        }
        persist({ ...entry, syncedRevision: Math.max(entry.syncedRevision, sent.revision) });
      } catch {
        if (entry?.playerId === sent.playerId) syncFailed = true;
      } finally {
        syncTask = null;
        updateStatus();
        const again = syncAgain;
        syncAgain = false;
        if (again) sync();
      }
    })();
  }

  function commit(state, focus) {
    const saved = load(key(entry.code));
    if (saved?.playerId === entry.playerId && saved.revision > entry.revision) {
      entry = saved;
    } else {
      persist({ ...entry, state, revision: entry.revision + 1 });
    }
    render(focus);
    sync();
  }

  function newEntry(code = '', name = '') {
    return { code, name, playerId: code ? crypto.randomUUID() : null, token: code ? crypto.randomUUID() : null,
      sessionId: null, revision: 0, syncedRevision: 0, state: startGame() };
  }

  function resumeAt(next) {
    persist(next);
    const url = new URL(location.href);
    url.searchParams.delete('join');
    if (entry.code) url.searchParams.set('code', entry.code);
    else url.searchParams.delete('code');
    history.replaceState(null, '', url);
    render(true);
    sync();
  }

  function startPractice() {
    resumeAt(load(key('')) ?? newEntry());
  }

  function renderIntro() {
    app.innerHTML = `<div class="intro"><div class="intro-portrait">${portrait('info')}</div>
      <h2>당신은 교육정책 결정자입니다.</h2>
      <p>한정된 수업 시간과 예산으로 어떤 미래를 가르치겠습니까?</p>
      ${onlineConfigured ? `
        <form id="join-form" class="form-panel">
          <label for="student-name">이름 또는 별칭</label>
          <input id="student-name" name="name" maxlength="40" required>
          <label for="class-code">수업 참여 코드</label>
          <input id="class-code" name="code" value="${escapeHtml(codeFromLink)}" autocapitalize="characters"
            maxlength="8" pattern="[A-Fa-f0-9]{8}" required>
          <button class="primary" type="submit">수업 참여 · 2026년</button>
          <p id="join-status" class="form-status" role="status"></p>
        </form>` : '<p>수업 데이터베이스가 연결되지 않았습니다.</p>'}
      <button class="full" id="practice">${onlineConfigured ? '수업 코드 없이 연습하기' : '이 기기에서 연습 시작 · 2026년'}</button>
      <p class="hint">정규 결정 5회 · 약 3~4분 · 가상 미래 시뮬레이션</p>
    </div>`;
    app.querySelector('#practice').onclick = startPractice;
    const form = app.querySelector('#join-form');
    if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('button');
      const practice = app.querySelector('#practice');
      const info = form.querySelector('#join-status');
      const data = new FormData(form);
      const name = data.get('name').trim();
      const code = cleanCode(data.get('code'));
      if (!name) {
        info.textContent = '이름 또는 별칭을 입력해 주세요.';
        return;
      }
      submit.disabled = practice.disabled = true;
      info.textContent = '수업에 연결하는 중입니다.';
      let candidate = load(key(code));
      if (candidate?.sessionId && candidate.name === name) {
        resumeAt(candidate);
        return;
      }
      const pendingKey = prefix + 'join:' + code;
      const pending = load(pendingKey);
      try {
        candidate = pending?.name === name ? pending : newEntry(code, name);
        try { store(pendingKey, candidate); } catch { /* Play remains available without storage. */ }
        const sessionId = await joinClass(code, name, candidate.playerId, candidate.token);
        resumeAt({ ...candidate, sessionId });
      } catch (error) {
        info.textContent = error.message === '유효한 수업 참여 코드를 입력해 주세요.'
          ? error.message : '수업에 연결하지 못했습니다. 다시 시도하거나 이 기기에서 연습할 수 있습니다.';
        submit.disabled = practice.disabled = false;
      }
    };
  }

  function renderNews(stories) {
    if (!stories.length) return '';
    return stories.map(story => `
      <details class="news">
        <summary><b>가상 미래 뉴스 · 사회혼란 ${signed(story.socialChaos)}</b>${escapeHtml(story.title)}</summary>
        <p>${escapeHtml(story.detail)}</p>
      </details>`).join('');
  }

  function renderGame(state) {
    const event = eventFor(state);
    const emergency = Boolean(event.title);
    const stories = state.appliedNews.filter(item => item.year === state.year);
    const title = emergency ? `긴급 위기 · ${event.title}` : `정책 결정 ${state.decisions.length + 1}/5`;
    app.innerHTML = `<h2 class="date" id="turn-title" tabindex="-1">${state.year}년 <span>${title}</span></h2>
      ${meters(state.stats)}
      ${renderNews(stories)}
      <div class="card" id="swipe">
        <div class="portrait">${portrait(event.character)}</div>
        <div class="person">${characters[event.character]}</div>
        <div class="quote">${event.dialogue}</div>
        <div class="preview" id="preview" aria-hidden="true"></div>
      </div>
      <div class="choices">${Object.entries(event.choices).map(([choice, option], i) => `
        <button type="button" class="choice" id="${choice}"><span class="choice-direction" aria-hidden="true">${i ? '→' : '←'}</span>
          <span class="choice-label">${emergency ? (i ? '오른쪽 대응' : '왼쪽 대응') : choiceLabels[choice]}</span>
          <strong class="policy-title">${policyTitle(state, event.id, choice)}</strong>${deltas(option.effects)}</button>`).join('')}</div>
      <p class="hint controls-hint">카드를 좌우로 밀거나 버튼을 누르세요. 사회혼란은 낮을수록 좋습니다.</p>${storageStatus()}`;

    const card = app.querySelector('#swipe');
    const preview = app.querySelector('#preview');
    const left = app.querySelector('#reject');
    const right = app.querySelector('#accept');
    let drag;

    function clearDrag() {
      drag = null;
      card.style.transform = '';
      preview.style.opacity = '';
      left.classList.remove('choice-active');
      right.classList.remove('choice-active');
    }

    function select(choice) {
      if (locked || entry.state !== state) return;
      locked = true;
      left.disabled = right.disabled = true;
      clearDrag();
      const complete = () => {
        locked = false;
        if (entry?.state !== state) return;
        commit(choose(state, event.id, choice), true);
      };
      const transitionMs = 240;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || !card.animate) {
        setTimeout(complete, transitionMs);
      } else {
        const direction = choice === 'reject' ? -1 : 1;
        card.animate([
          { transform: getComputedStyle(card).transform, opacity: 1 },
          { transform: `translateX(${direction * 115}px) rotate(${direction * 10}deg)`, opacity: 0 },
        ], { duration: transitionMs, easing: 'ease-in', fill: 'forwards' }).finished.then(complete, complete);
      }
    }

    left.onclick = () => select('reject');
    right.onclick = () => select('accept');
    card.onpointerdown = event => {
      if (locked || drag || !event.isPrimary || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      card.setPointerCapture(event.pointerId);
    };
    card.onpointermove = event => {
      if (drag?.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 15) {
        clearDrag();
        return;
      }
      const choice = dx < 0 ? 'reject' : 'accept';
      const opacity = Math.min(1, Math.abs(dx) / 55);
      card.style.transform = `translateX(${Math.max(-80, Math.min(80, dx * 0.45))}px) rotate(${Math.max(-9, Math.min(9, dx * 0.05))}deg)`;
      preview.style.opacity = opacity;
      const title = policyTitle(state, state.currentEvent, choice);
      if (preview.dataset.choice !== choice) {
        preview.dataset.choice = choice;
        preview.innerHTML = `<strong>${escapeHtml(title)}</strong>${deltas(eventFor(state).choices[choice].effects)}`;
      }
      left.classList.toggle('choice-active', dx < -12);
      right.classList.toggle('choice-active', dx > 12);
    };
    card.onpointerup = event => {
      if (drag?.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      clearDrag();
      if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy)) select(dx < 0 ? 'reject' : 'accept');
    };
    card.onpointercancel = card.onlostpointercapture = event => {
      if (drag?.id === event.pointerId) clearDrag();
    };
  }

  function renderHandover(state) {
    app.innerHTML = `<article class="report handover">
      <h2 id="handover-title" tabindex="-1">2036년, 후임 교육감에게</h2>
      <p>지난 10년간 여러분의 교육정책은 사회를 변화시켰습니다. 후임 교육감에게 어떤 교육을 강화하도록 제안하고 싶습니까? 그 이유를 여러분이 만들어낸 사회의 모습을 근거로 작성해 주세요.</p>
      <details><summary>최종 사회 보고서 다시 보기</summary>${renderReport(finalReport(state))}</details>
      <form id="handover-form" class="form-panel">
        <label for="education">앞으로 강화해야 할 교육</label>
        <textarea id="education" name="education" rows="2" maxlength="300" required>${escapeHtml(state.handover?.education)}</textarea>
        <label for="reason">그렇게 생각하는 이유</label>
        <textarea id="reason" name="reason" rows="3" maxlength="800" required>${escapeHtml(state.handover?.reason)}</textarea>
        <button class="primary" type="submit">${entry.sessionId ? '인수인계서 제출' : '이 기기에 인수인계서 저장'}</button>
        <p class="form-status" role="status"></p>
      </form>
    </article>${storageStatus()}`;
    const form = app.querySelector('#handover-form');
    form.oninput = () => {
      const data = new FormData(form);
      persist({ ...entry, state: { ...state, handover: {
        education: data.get('education'), reason: data.get('reason'),
      } } });
      updateStatus();
    };
    form.onsubmit = event => {
      event.preventDefault();
      const data = new FormData(form);
      const education = data.get('education').trim();
      const reason = data.get('reason').trim();
      if (!education || !reason) {
        form.querySelector('.form-status').textContent = '강화할 교육과 그 이유를 모두 작성해 주세요.';
        return;
      }
      commit({ ...state, phase: 'complete', handover: { education, reason } }, true);
    };
  }

  function render(focus = false) {
    const state = entry?.state;
    if (!state) {
      renderIntro();
      return;
    }
    if (state.phase === 'playing') renderGame(state);
    if (state.phase === 'report') {
      app.innerHTML = `${renderReport(finalReport(state))}
        <button id="next" class="full primary">인수인계서 작성하기</button>${storageStatus()}`;
      app.querySelector('#next').onclick = () => commit({ ...state, phase: 'handover' }, true);
    }
    if (state.phase === 'handover') renderHandover(state);
    if (state.phase === 'complete') {
      app.innerHTML = `<article class="report">
        <h2 tabindex="-1">인수인계서</h2><p id="confirmation" role="status"></p>
        <details><summary>최종 사회 보고서 다시 보기</summary>${renderReport(finalReport(state))}</details>
      </article>${storageStatus()}
      ${entry.sessionId ? '' : '<button id="restart" class="full">2026년부터 다시 연습하기</button>'}
      ${onlineConfigured ? '<a class="back-to-start" href="?join=1">수업 참여 화면으로 돌아가기</a>' : ''}`;
      const restart = app.querySelector('#restart');
      if (restart) restart.onclick = () => {
        persist(newEntry());
        render(true);
      };

    }
    const retry = app.querySelector('#retry-sync');
    if (retry) retry.onclick = sync;
    updateStatus();
    if (focus) {
      app.querySelector('[tabindex="-1"]')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  addEventListener('online', sync);
  render();
  sync();
}
