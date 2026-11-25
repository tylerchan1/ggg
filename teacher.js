import {
  classPlayers, createClass, myClasses, onlineConfigured, teacherSession, teacherSignIn,
  teacherSignOut, watchClass,
} from './backend.js';
import { classResults, validatePlayers } from './class-results.js';
import { escapeHtml, newsList, renderTimeline, meters } from './ui.js';

const statusLabel = payload => payload?.status === 'submitted' ? '제출 완료'
  : payload?.status === 'invalid' ? '기록 확인 필요'
  : payload?.finalReport ? '인수인계서 작성 중' : `${Number.isInteger(payload?.year) ? payload.year : 2026}년 · 진행 중`;
const percent = value => Math.round(value * 100);

function choiceChart(row) {
  const total = row.reject + row.accept;
  const rejectPercent = total ? percent(row.reject / total) : 0;
  return `<li><div class="chart-label"><span>${row.label}</span><span>${total}명</span></div>
    ${total ? `<div class="split-bar" aria-hidden="true"><i style="width:${rejectPercent}%"></i></div>
      <span class="chart-caption">거절 ${rejectPercent}% (${row.reject}명) · 수락 ${100 - rejectPercent}% (${row.accept}명)</span>`
      : '<span class="chart-caption">선택 기록 없음</span>'}</li>`;
}

function countChart(rows, denominator) {
  const maximum = denominator ?? Math.max(1, ...rows.map(row => row.count));
  return `<ul class="chart-list">${rows.map(row => `<li><div class="chart-label"><span>${row.label}</span><strong>${row.count}</strong></div>
    <div class="count-bar" aria-hidden="true"><i style="width:${maximum ? row.count * 100 / maximum : 0}%"></i></div></li>`).join('')}</ul>`;
}

function detail(player) {
  const data = player.payload ?? {};
  const report = data.finalReport;
  const timeline = items => items?.length ? renderTimeline(items) : '<p>기록 없음</p>';
  return `<article class="report student-detail">
    <h3>${escapeHtml(player.name)}</h3><p>${statusLabel(data)}</p>
    <h4>정규 정책 선택 기록</h4>${timeline(data.decisions)}
    <h4>긴급 위기 대응 기록</h4>${timeline(data.crisisHistory)}
    <h4>최종 관리 지표</h4>${report ? meters(report.stats) : '<p>게임 완료 후 표시됩니다.</p>'}
    <h4>최종 가상 미래 뉴스</h4>${report ? `<ul class="report-list">${newsList(report.news)}</ul>` : '<p>게임 완료 후 표시됩니다.</p>'}
    <h4>인수인계서</h4>${data.status === 'submitted' && data.handover ? `
      <dl><dt>앞으로 강화해야 할 교육</dt><dd>${escapeHtml(data.handover.education)}</dd>
      <dt>그렇게 생각하는 이유</dt><dd>${escapeHtml(data.handover.reason)}</dd></dl>` : '<p>제출을 기다리고 있습니다.</p>'}
  </article>`;
}

export async function mountTeacher(app) {
  document.querySelector('main').classList.add('dashboard');
  if (!onlineConfigured) {
    app.innerHTML = `<section class="panel"><h2>교사 대시보드</h2>
      <p>수업 데이터베이스가 연결되지 않았습니다. 연결을 설정하면 교사 인증 후 수업을 만들고 학생 결과를 확인할 수 있습니다.</p></section>`;
    return;
  }

  let stopWatching;
  let timer;
  let generation = 0;
  let requestRunning = false;
  let pending = false;
  let selectedSession;
  let selectedPlayer;
  let players = [];

  function cleanWatch() {
    generation++;
    stopWatching?.();
    stopWatching = undefined;
    clearInterval(timer);
  }

  function results() {
    const root = app.querySelector('#class-results');
    const current = classResults(players);
    root.innerHTML = `<div class="class-totals">
      <span><strong>${players.length}</strong> 참여</span>
      <span><strong>${current.playing}</strong> 진행 중</span>
      <span><strong>${current.submitted}</strong> 제출 완료</span>
    </div>
    <div class="chart-grid">
      <section class="panel"><h3>사건별 선택 비율</h3><ul class="chart-list">${current.choices.map(choiceChart).join('')}</ul></section>
      <section class="panel"><h3>마지막 사건의 등장인물</h3>${countChart(current.finals)}
        <h3>최종 사회혼란 분포 <small>${current.finished}명</small></h3>${countChart(current.bands, current.finished)}
        <h3>긴급 위기 발생 횟수</h3>${countChart(current.crises)}</section>
    </div>
    <section class="panel"><h3>학생별 결과</h3>
      ${players.length ? `<ul class="student-list">${players.map(player => `
        <li><button type="button" data-player="${escapeHtml(player.id)}" aria-pressed="${selectedPlayer === player.id}">
          <span>${escapeHtml(player.name)}</span><span>${statusLabel(player.payload)}</span></button></li>`).join('')}</ul>`
      : '<p>아직 참여한 학생이 없습니다.</p>'}
      <div id="student-detail"></div></section>`;
    const buttons = root.querySelectorAll('[data-player]');
    const displayDetails = () => {
      const player = players.find(item => item.id === selectedPlayer);
      root.querySelector('#student-detail').innerHTML = player ? detail(player) : '';
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.player === selectedPlayer));
    };
    for (const button of buttons) button.onclick = () => {
      selectedPlayer = button.dataset.player;
      displayDetails();
      root.querySelector('#student-detail').scrollIntoView({ block: 'nearest' });
    };
    displayDetails();
  }

  async function refresh(version, sessionId) {
    if (version !== generation) return;
    if (requestRunning) {
      pending = true;
      return;
    }
    requestRunning = true;
    const status = app.querySelector('#class-status');
    try {
      const incoming = validatePlayers(await classPlayers(sessionId));
      if (version !== generation) return;
      if (JSON.stringify(incoming) !== JSON.stringify(players) || !app.querySelector('.class-totals')) {
        players = incoming;
        results();
      }
      status.textContent = '학생 데이터 최신 상태';
    } catch {
      if (version === generation) status.textContent = '학생 데이터를 불러오지 못했습니다. 자동으로 다시 시도합니다.';
    } finally {
      requestRunning = false;
      if (pending) {
        pending = false;
        if (selectedSession) refresh(generation, selectedSession.id);
      }
    }
  }

  function studentUrl(code) {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('code', code);
    return url.href;
  }

  async function showQr(url, version) {
    try {
      const { default: qrcode } = await import('https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.mjs');
      if (version !== generation) return;
      const code = qrcode(0, 'M');
      code.addData(url);
      code.make();
      app.querySelector('#join-qr').innerHTML = code.createSvgTag({
        cellSize: 4, margin: 16, scalable: true, alt: '학생 접속 QR코드',
      });
    } catch {
      if (version === generation) app.querySelector('#join-qr').textContent = 'QR코드를 불러오지 못했습니다. 접속 주소를 사용해 주세요.';
    }
  }

  function openSession(session) {
    cleanWatch();
    const version = generation;
    selectedSession = session;
    selectedPlayer = null;
    players = [];
    const url = studentUrl(session.code);
    app.querySelector('#class-view').innerHTML = `<section class="panel class-share">
      <div><h3>학생 접속</h3><p>수업 참여 코드 <strong class="join-code">${escapeHtml(session.code)}</strong></p>
        <label for="join-url">학생 접속 주소</label><div class="copy-row"><input id="join-url" readonly value="${escapeHtml(url)}">
        <button type="button" id="copy-url">복사</button></div><p id="copy-status" class="form-status" role="status"></p></div>
      <div id="join-qr" class="join-qr"></div></section>
      <p id="class-status" class="hint" role="status">학생 데이터를 불러오는 중입니다.</p>
      <div id="class-results"></div>`;
    app.querySelector('#copy-url').onclick = async () => {
      const input = app.querySelector('#join-url');
      const status = app.querySelector('#copy-status');
      try {
        await navigator.clipboard.writeText(url);
        status.textContent = '접속 주소를 복사했습니다.';
      } catch {
        input.focus();
        input.select();
        status.textContent = '선택된 주소를 복사해 주세요.';
      }
    };
    showQr(url, version);
    const update = () => refresh(version, session.id);
    update();
    timer = setInterval(update, 5000);
    watchClass(session.id, update, status => {
      if (status === 'SUBSCRIBED') update();
    }).then(stop => {
      if (version === generation) stopWatching = stop;
      else stop();
    }).catch(() => { /* Periodic refresh still checks the database. */ });
  }

  async function showDashboard() {
    const sessions = await myClasses();
    app.innerHTML = `<div class="dashboard-heading"><h2>교사 대시보드</h2><button id="sign-out">로그아웃</button></div>
      <section class="panel">
        <div class="class-toolbar"><label for="class-select">수업 세션</label><select id="class-select"></select>
          <button id="new-class" class="primary">새 수업 만들기</button></div>
        <p id="teacher-status" class="form-status" role="status"></p>
      </section>
      <div id="class-view"></div>`;

    const select = app.querySelector('#class-select');
    const status = app.querySelector('#teacher-status');
    function renderSessions() {
      select.replaceChildren(...sessions.map(session => {
        const date = new Date(session.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
        return new Option(`${session.code} · ${date}`, session.id);
      }));
      select.disabled = !sessions.length;
      if (!sessions.length) select.append(new Option('생성된 수업 없음', ''));
    }
    select.onchange = () => openSession(sessions.find(session => session.id === select.value));
    const create = app.querySelector('#new-class');
    create.onclick = async () => {
      status.textContent = '수업을 만드는 중입니다.';
      create.disabled = true;
      try {
        const session = await createClass();
        if (!create.isConnected) return;
        sessions.unshift(session);
        renderSessions();
        openSession(session);
        status.textContent = '수업을 만들었습니다.';
      } catch {
        status.textContent = '수업을 만들지 못했습니다. 다시 시도해 주세요.';
      } finally {
        create.disabled = false;
      }
    };
    app.querySelector('#sign-out').onclick = async () => {
      try {
        await teacherSignOut();
        cleanWatch();
        selectedSession = null;
        renderLogin();
      } catch {
        status.textContent = '로그아웃하지 못했습니다. 다시 시도해 주세요.';
      }
    };
    renderSessions();
    if (sessions.length) openSession(sessions[0]);
  }

  function renderLogin(message = '') {
    app.innerHTML = `<section class="panel teacher-login"><h2>교사 대시보드</h2>
      <form id="teacher-login" class="form-panel">
        <label for="teacher-email">교사 이메일</label>
        <input id="teacher-email" type="email" name="email" autocomplete="username" required>
        <label for="teacher-password">비밀번호</label>
        <input id="teacher-password" type="password" name="password" autocomplete="current-password" required>
        <button class="primary" type="submit">로그인</button>
        <p class="form-status" role="status">${escapeHtml(message)}</p>
      </form></section>`;
    const form = app.querySelector('#teacher-login');
    form.onsubmit = async event => {
      event.preventDefault();
      const data = new FormData(form);
      const button = form.querySelector('button');
      const status = form.querySelector('.form-status');
      button.disabled = true;
      status.textContent = '교사 계정을 확인하는 중입니다.';
      try {
        await teacherSignIn(data.get('email').trim(), data.get('password'));
        await showDashboard();
      } catch (error) {
        if (error.message === '교사 계정으로 등록된 사용자가 아닙니다.') await teacherSignOut().catch(() => {});
        status.textContent = error.message === '교사 계정으로 등록된 사용자가 아닙니다.'
          ? error.message : '로그인하지 못했습니다. 계정과 데이터베이스 연결을 확인해 주세요.';
        button.disabled = false;
      }
    };
  }

  try {
    if (await teacherSession()) await showDashboard();
    else renderLogin();
  } catch {
    renderLogin('교사 계정이나 데이터베이스 연결을 확인해 주세요.');
  }
}
