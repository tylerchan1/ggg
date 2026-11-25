import {
  createClass, myClasses, onlineConfigured, teacherSession, teacherSignIn,
  teacherSignOut, watchClass,
} from './backend.js';
import { classResults, validatePlayers } from './class-results.js';
import { escapeHtml, renderReport, meters } from './ui.js';

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

function handover(player) {
  const { education, reason } = player.payload.handover;
  return `<dl class="student-answers">
    <dt>강화할 교육</dt><dd>${escapeHtml(education)}</dd>
    <dt>그 이유</dt><dd>${escapeHtml(reason)}</dd>
  </dl>`;
}

function card(player) {
  return `<li><article class="response-card">
    <h3><button type="button" class="card-open" data-player="${escapeHtml(player.id)}">
      ${escapeHtml(player.name)} <span class="sr-only">상세 기록 열기</span></button></h3>
    ${handover(player)}
    ${meters(player.payload.finalReport.stats)}
  </article></li>`;
}

export async function mountTeacher(app) {
  document.querySelector('main').classList.add('dashboard');
  if (!onlineConfigured) {
    app.innerHTML = `<section class="panel"><h2>교사 대시보드</h2>
      <p>수업 데이터베이스가 연결되지 않았습니다. 연결을 설정하면 교사 인증 후 수업을 만들고 학생 결과를 확인할 수 있습니다.</p></section>`;
    return;
  }

  let stopWatching;
  let generation = 0;

  function cleanWatch() {
    generation++;
    stopWatching?.();
    stopWatching = undefined;
  }

  function renderResults(incoming) {
    const players = validatePlayers(incoming);
    const current = classResults(players);
    const submitted = players.filter(player => player.payload.status === 'submitted');
    const byId = new Map(submitted.map(player => [player.id, player]));
    const root = app.querySelector('#class-results');
    const focused = document.activeElement?.dataset.player;
    const [total, playing, done] = app.querySelectorAll('.class-totals strong');
    total.textContent = players.length;
    playing.textContent = current.playing;
    done.textContent = submitted.length;
    const board = root.querySelector('#submissions');
    const initial = board.firstChild === null;
    const existing = new Set(Array.from(board.querySelectorAll('[data-player]'), button => button.dataset.player));
    if (initial || submitted.length !== existing.size || submitted.some(player => !existing.has(player.id))) {
      board.innerHTML = submitted.length ? submitted.map(card).join('') : '<li class="board-empty">제출된 인수인계서가 아직 없습니다.</li>';
      Array.from(board.querySelectorAll('[data-player]')).find(button => button.dataset.player === focused)
        ?.focus({ preventScroll: true });
    }
    const charts = root.querySelector('#class-charts');
    charts.innerHTML = `<div class="chart-grid">
      <section class="panel"><h3>사건별 선택 비율</h3><ul class="chart-list">${current.choices.map(choiceChart).join('')}</ul></section>
      <section class="panel"><h3>마지막 사건의 등장인물</h3>${countChart(current.finals)}
        <h3>최종 사회혼란 분포 <small>${current.finished}명</small></h3>${countChart(current.bands, current.finished)}
        <h3>긴급 위기 발생 횟수</h3>${countChart(current.crises)}</section>
    </div>`;

    board.onclick = event => {
      const button = event.target.closest('[data-player]');
      const player = byId.get(button?.dataset.player);
      if (!player) return;
      const dialog = root.querySelector('#student-detail');
      dialog.querySelector('h3').textContent = player.name;
      dialog.querySelector('.detail-content').innerHTML = `${handover(player)}${renderReport(player.payload.finalReport, true)}`;
      dialog.showModal();
    };
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
    const url = studentUrl(session.code);
    app.querySelector('#class-view').innerHTML = `<section class="panel class-share">
      <div><h3>학생 접속</h3><p>수업 참여 코드 <strong class="join-code">${escapeHtml(session.code)}</strong></p>
        <label for="join-url">학생 접속 주소</label><div class="copy-row"><input id="join-url" readonly value="${escapeHtml(url)}">
        <button type="button" id="copy-url">복사</button></div><p id="copy-status" class="form-status" role="status"></p></div>
      <div id="join-qr" class="join-qr"></div>
      <div class="class-totals" aria-label="수업 참여 현황">
        <span><strong>–</strong> 참여</span><span><strong>–</strong> 진행 중</span><span><strong>–</strong> 제출 완료</span>
      </div></section>
      <p id="class-status" class="hint" role="status">학생 데이터를 불러오는 중입니다.</p>
      <div id="class-results">
        <h3>학생 인수인계서</h3><ul id="submissions" class="submission-board"></ul>
        <details class="panel board-stats"><summary>수업 통계</summary><div id="class-charts"></div></details>
        <dialog id="student-detail" aria-labelledby="detail-title">
          <div class="detail-heading"><h3 id="detail-title"></h3>
          <form method="dialog"><button type="submit" aria-label="상세 기록 닫기">닫기</button></form></div>
          <div class="detail-content"></div>
        </dialog>
      </div>`;
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
    const status = app.querySelector('#class-status');
    const failed = () => {
      if (version !== generation) return;
      status.textContent = '학생 데이터를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
      const retry = document.createElement('button');
      retry.textContent = '다시 연결';
      retry.onclick = () => openSession(session);
      status.append(' ', retry);
    };
    watchClass(session.id, (players, cached) => {
      if (version !== generation) return;
      renderResults(players);
      status.textContent = cached ? '수업 서버에 연결 중입니다.' : '제출 내용이 실시간으로 표시됩니다.';
    }, failed).then(stop => {
      if (version === generation) stopWatching = stop;
      else stop();
    }).catch(failed);
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
