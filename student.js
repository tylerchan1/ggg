import { joinClass, onlineConfigured, savePlayer, studentIdentity, switchStudent } from './backend.js';
import { characters, choiceLabels, crisisById, events } from './events.js';
import { choose, eventFor, finalReport, policyTitle, startGame } from './game.js';
import { portrait } from './portraits.js';
import { animateMeters, escapeHtml, meters, previewMeters, renderReport } from './ui.js';

import { showNews } from './news-screen.js';
import { mountAnswers } from './student-board.js';


const cleanCode = value => value.trim().toUpperCase();
const key = code => 're-education-firebase-v1:class:' + code;
const activeKey = 're-education-firebase-v1:active';

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
    year: state.year,
    decisions: state.decisions,
    crisisHistory: state.crisisHistory,
    finalReport: finalReport(state),
    handover: state.handover,
  };
}

export function mountStudent(app) {
  const params = new URLSearchParams(location.search);
  const codeFromLink = cleanCode(params.get('code') ?? '');
  let prefillCode = codeFromLink || load(activeKey) || '';
  let entry = params.has('join') ? null : load(key(prefillCode));
  if (!entry?.sessionId || !entry.state) entry = null;
  let locked = false;
  let syncTask;
  let syncFailed = false;
  let storageFailed = false;
  let switching = false;
  let unmountAnswers;
  const restartButton = document.querySelector('#restart');
  const switchButton = document.querySelector('#switch-student');
  switchButton.hidden = false;
  restartButton.onclick = restart;
  switchButton.onclick = changeIdentity;

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

    if (entry.pendingSubmission) return '인수인계서를 수업 서버에 전송 중입니다.';
    return `수업 참여 모드 · ${entry.name}`;
  }

  function updateStatus() {
    const element = app.querySelector('#sync-status');
    if (element) element.textContent = statusText();
    const retry = app.querySelector('#retry-sync');
    if (retry) retry.hidden = !syncFailed;
    const confirmation = app.querySelector('#confirmation');
    if (confirmation && entry?.state.phase === 'complete') {
      confirmation.textContent = entry.submission === 'submitted'
          ? '인수인계서가 전달되었습니다. 지난 10년간의 교육정책을 되돌아보며 친구들과 서로 다른 미래 사회를 비교해 보세요.'
          : entry.submission === 'duplicate'
            ? '이 수업에 이미 제출한 인수인계서가 있어 기존 결과를 보관했습니다.'
            : '인수인계서는 수업 서버로 전송을 기다리고 있습니다.';
    }
  }

  function storageStatus() {
    return '<p id="sync-status" class="hint" role="status"></p><button id="retry-sync" class="full" hidden>다시 전송하기</button>';
  }

  function sync() {
    if (!entry?.pendingSubmission || syncTask) return;
    const { code, sessionId, playerId, pendingSubmission: sent } = entry;
    syncFailed = false;
    updateStatus();
    syncTask = (async () => {
      try {
        const submission = await savePlayer({ sessionId, playerId, runId: sent.runId }, sent.payload);
        const saved = load(key(code));
        if (entry && saved?.revision > entry.revision && saved.playerId === playerId) {
          entry = saved;
          render();
        }
        if (entry?.pendingSubmission?.runId === sent.runId) {
          persist({ ...entry, pendingSubmission: null, submission: entry.runId === sent.runId ? submission : 'duplicate' });
          if (entry.state.phase === 'complete') render();
        }
      } catch {
        syncFailed = entry?.pendingSubmission?.runId === sent.runId;
      } finally {
        syncTask = null;
        updateStatus();
      }
    })();
  }

  function commit(state, focus) {
    const previousStats = entry.state.stats;
    const saved = load(key(entry.code));
    if (saved?.revision > entry.revision && saved.playerId === entry.playerId) {
      entry = saved;
    } else {
      const pendingSubmission = entry.sessionId && state.phase === 'complete' && !entry.submission
        ? (entry.pendingSubmission ?? { runId: entry.runId, payload: snapshot(state) })
        : entry.pendingSubmission;
      const newsFromYear = state.appliedNews.length > entry.state.appliedNews.length ? entry.state.year : entry.newsFromYear;
      persist({ ...entry, state, pendingSubmission, newsFromYear, revision: entry.revision + 1 });
    }
    render(focus, previousStats);
    sync();
  }

  function newEntry(code = '', name = '') {
    return { code, name, revision: 0, state: startGame(), rolePending: true, newsSeen: 0 };
  }

  function restart() {
    if (!confirm('2026년 첫 정책부터 다시 시작할까요? 이미 제출한 결과는 수업에 보관됩니다.')) return;
    const reset = startGame();
    const saved = load(key(entry.code));
    if (saved?.revision > entry.revision && saved.playerId === entry.playerId) entry = saved;
    persist({ ...entry, state: reset, rolePending: false, newsSeen: 0, newsFromYear: null, submission: entry.submission ? 'duplicate' : null, runId: entry.sessionId ? crypto.randomUUID() : undefined,
      revision: entry.revision + 1 });
    locked = false;
    render(true);
    sync();
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

  async function changeIdentity() {
    if (switching || !confirm('다른 이름으로 참여할까요? 이 기기의 진행 상황을 초기화하며 이미 제출된 답변은 수업에 보관됩니다.')) return;
    switching = true;
    switchButton.disabled = true;
    try {
      // Let a requested write finish under the existing identity before ending that session.
      if (syncTask) await syncTask;
      await switchStudent();
      prefillCode = entry?.code || prefillCode;
      try {
        localStorage.removeItem(key(prefillCode));
        localStorage.removeItem(activeKey);
      } catch { /* The new auth UID still prevents the previous state from resuming. */ }
      entry = null;
      locked = false;
      syncFailed = false;
      const url = new URL(location.href);
      url.searchParams.set('join', '1');
      if (prefillCode) url.searchParams.set('code', prefillCode);
      history.replaceState(null, '', url);
      render(true);
    } catch {
      setJoinMessage('학생 인증을 종료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
    } finally {
      switching = false;
      switchButton.disabled = false;
    }
  }

  function setJoinMessage(text) {
    document.querySelector('#identity-status').textContent = text;
  }

  function renderJoin() {
    app.innerHTML = `<section class="panel join-panel">
      <h2 tabindex="-1">수업 참여</h2>
      <form id="join-form" class="form-panel">
        <label for="class-code">수업 참여 코드</label>
        <input id="class-code" name="code" value="${escapeHtml(prefillCode)}" autocapitalize="characters"
          maxlength="8" pattern="[A-Fa-f0-9]{8}" required>
        <label for="student-name">학생 이름 또는 별칭</label>
        <input id="student-name" name="name" maxlength="40" required>
        <button class="primary" type="submit">참여하기</button>
        <p id="join-status" class="form-status" role="status"></p>
      </form></section>`;
    const form = app.querySelector('#join-form');
    const info = form.querySelector('#join-status');
    if (!onlineConfigured) info.textContent = '수업 서버 연결이 설정되지 않았습니다. 교사에게 접속 주소를 확인해 주세요.';
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('button');
      const data = new FormData(form);
      const name = data.get('name').trim();
      const code = cleanCode(data.get('code'));
      if (!name) {
        info.textContent = '이름 또는 별칭을 입력해 주세요.';
        return;
      }
      prefillCode = code;
      submit.disabled = switchButton.disabled = true;
      info.textContent = '수업에 연결하는 중입니다.';
      try {
        const participant = await joinClass(code, name);
        if (participant.name !== name) {
          info.textContent = '이 기기는 이미 다른 이름으로 이 수업에 참여했습니다. 상단의 ‘다른 이름으로 참여’를 이용해 주세요.';
          return;
        }
        const saved = load(key(code));
        const candidate = saved?.playerId === participant.playerId ? saved : newEntry(code, name);
        resumeAt({ ...candidate, ...participant, runId: candidate.runId ?? crypto.randomUUID() });
      } catch (error) {
        info.textContent = error.message === '수업 참여 코드를 확인해 주세요.'
          ? error.message : '수업에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
        submit.textContent = '다시 시도';
      } finally {
        submit.disabled = switchButton.disabled = false;
      }
    };
  }

  function renderRole() {
    app.innerHTML = `<section class="intro role-intro">
      <div class="intro-portrait">${portrait('info')}</div>
      <p class="role-year">2026년</p>
      <h2 tabindex="-1">당신은 새롭게 취임한 교육감입니다.</h2>
      <p>한정된 수업 시간과 예산으로 어떤 교육에 투자할지 결정하세요. 정책을 선택하고, 몇 년 뒤 학생들의 배움이 사회를 어떻게 바꾸었는지 확인해 보세요.</p>
      <button id="start-game" class="primary full">게임 시작</button>
    </section>`;
    app.querySelector('#start-game').onclick = () => {
      persist({ ...entry, rolePending: false });
      render(true);
    };
  }

  function cardContents(event) {
    return `<div class="portrait">${portrait(event.character)}</div>
      <div class="person">${characters[event.character]}</div>
      <div class="quote">${event.dialogue}</div>`;
  }

  function renderGame(state) {
    const event = eventFor(state);
    const emergency = Boolean(event.title);
    const title = emergency ? `긴급 위기 · ${event.title}` : `정책 결정 ${state.decisions.length + 1}/5`;
    app.innerHTML = `<h2 class="date" id="turn-title" tabindex="-1">${state.year}년 <span>${title}</span></h2>
      ${meters(state.stats)}
      <div class="card" id="swipe">
        ${cardContents(event)}
        <div class="preview" id="preview" aria-hidden="true"></div>
      </div>
      <div class="choices">${Object.keys(event.choices).map((choice, i) => `
        <button type="button" class="choice" id="${choice}">
          <span class="choice-label">${i ? '' : '<span aria-hidden="true">←</span> '}${emergency ? (i ? '오른쪽 대응' : '왼쪽 대응') : choiceLabels[choice]}${i ? ' <span aria-hidden="true">→</span>' : ''}</span>
          <strong class="policy-title">${policyTitle(state, event.id, choice)}</strong></button>`).join('')}</div>
      <p class="hint controls-hint">카드를 좌우로 밀거나 버튼을 누르세요. 사회혼란은 낮을수록 좋습니다.</p>${storageStatus()}`;

    const card = app.querySelector('#swipe');
    const preview = app.querySelector('#preview');
    const left = app.querySelector('#reject');
    const right = app.querySelector('#accept');
    const meterGroup = app.querySelector('.meters');
    let drag;

    const showEstimate = (choice, opacity = 1) =>
      previewMeters(meterGroup, state.stats, event.choices[choice]?.effects, opacity);

    for (const [button, choice] of [[left, 'reject'], [right, 'accept']]) {
      const show = () => { if (!locked && !drag) showEstimate(choice); };
      const clear = () => { if (!drag) showEstimate(); };
      button.onpointerenter = event => { if (event.pointerType === 'mouse') show(); };
      button.onpointerleave = clear;
      button.onfocus = () => { if (button.matches(':focus-visible')) show(); };
      button.onblur = clear;
    }


    function clearDrag() {
      drag = null;
      card.style.transform = '';
      preview.style.opacity = '';
      left.classList.remove('choice-active');
      right.classList.remove('choice-active');
      showEstimate();
    }

    function select(choice) {
      if (locked || switching || entry?.state !== state) return;
      locked = true;
      left.disabled = right.disabled = true;
      clearDrag();
      const complete = () => {
        if (entry?.state !== state) return;
        locked = false;
        if (switching) return;
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
        preview.textContent = title;
      }
      showEstimate(Math.abs(dx) > 12 ? choice : undefined, opacity);
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
        <button class="primary" type="submit">인수인계서 제출</button>
        <p class="form-status" role="status"></p>
      </form>
    </article>${storageStatus()}`;
    const form = app.querySelector('#handover-form');
    form.oninput = () => {
      const saved = load(key(entry.code));
      if (saved?.revision > entry.revision && saved.playerId === entry.playerId) {
        entry = saved;
        render();
        return;
      }
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

  function render(focus = false, previousStats) {
    unmountAnswers?.();
    unmountAnswers = undefined;
    setJoinMessage('');
    const state = entry?.state;
    restartButton.hidden = !state || Boolean(entry.rolePending);
    if (!state) {
      renderJoin();
      if (focus) app.querySelector('#student-name').focus();
      return;
    }
    if (entry.rolePending) {
      renderRole();
      if (focus) app.querySelector('h2').focus();
      return;
    }
    const nextNews = state.appliedNews[entry.newsSeen ?? state.appliedNews.length];
    if (nextNews) {
      const stageStats = [...state.stats];
      stageStats[3] = nextNews.socialChaosBefore ?? stageStats[3];
      const lastDecision = [...state.decisions, ...state.crisisHistory].reduce((latest, item) =>
        !latest || latest.order < item.order ? item : latest, null);
      const previousEvent = events[lastDecision?.eventId] ?? crisisById[lastDecision?.eventId];
      showNews(app, nextNews, entry.newsFromYear, stageStats, previousEvent ? cardContents(previousEvent) : '', () => {
        const saved = load(key(entry.code));
        if (saved?.playerId === entry.playerId && saved.revision > entry.revision) entry = saved;
        else persist({ ...entry, newsSeen: entry.newsSeen + 1, newsFromYear: nextNews.year, revision: entry.revision + 1 });
        render(true, stageStats);
      }, restart);
      return;
    }
    if (state.phase === 'playing') renderGame(state);
    if (state.phase === 'report') {
      app.innerHTML = `${renderReport(finalReport(state))}
        <section class="report-cta"><h2>이제, 다음 교육감에게</h2>
          <p>앞으로 우리 사회에는 어떤 교육이 필요할까요?</p>
          <button id="next" class="full primary">인수인계서 작성하기</button></section>${storageStatus()}`;
      app.querySelector('#next').onclick = () => commit({ ...state, phase: 'handover' }, true);
    }
    if (state.phase === 'handover') renderHandover(state);
    if (state.phase === 'complete') {
      app.innerHTML = `<article class="report">
        <h2 tabindex="-1">인수인계서</h2><p id="confirmation" role="status"></p>
        <details><summary>최종 사회 보고서 다시 보기</summary>${renderReport(finalReport(state))}</details>
      </article>${storageStatus()}
      ${entry.submission ? '<section id="answer-board" class="answer-board"></section>' : ''}`;
      const board = app.querySelector('#answer-board');
      if (board) unmountAnswers = mountAnswers(board, entry);
    }
    if (previousStats) animateMeters(app.querySelector('.meters'), previousStats, state.stats);
    const retry = app.querySelector('#retry-sync');
    if (retry) retry.onclick = sync;
    updateStatus();
    if (focus) {
      app.querySelector('[tabindex="-1"]')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  addEventListener('online', sync);
  addEventListener('storage', event => {
    if (!entry || event.key !== key(entry.code) || event.newValue !== null) return;
    prefillCode = entry.code;
    entry = null;
    locked = false;
    render();
  });
  if (!entry) {
    render();
  } else {
    app.innerHTML = '<p role="status">수업 참여 정보를 확인하는 중입니다.</p>';
    const resume = async () => {
      try {
        if (await studentIdentity() !== entry?.playerId) entry = null;
        if (entry && entry.newsSeen === undefined) persist({ ...entry, newsSeen: entry.state.appliedNews.length });
        render();
        sync();
      } catch {
        app.innerHTML = '<p role="status">수업에 연결하지 못했습니다.</p><button id="retry-identity">다시 시도</button>';
        app.querySelector('button').onclick = resume;
      }
    };
    resume();
  }
}
