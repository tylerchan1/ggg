import assert from 'node:assert/strict';
import test from 'node:test';
import { classResults, validatePlayers } from '../class-results.js';
import { crises, events, initialStats, metrics, news } from '../events.js';
import { breaches, choose, finalReport, policyTitle, startGame } from '../game.js';

const choices = ['reject', 'accept'];
const summary = {
  paths: 0, crisisPaths: 0, chained: 0, unresolved: 0, finalYearCrises: 0,
  finalBranches: { EVENT_05_A: 0, EVENT_05_B: 0 },
  crises: {}, lowest: [...initialStats], highest: [...initialStats],
  lowestFinal: [Infinity, Infinity, Infinity, Infinity], highestFinal: [-Infinity, -Infinity, -Infinity, -Infinity],
};
const basicPaths = new Set();
const baseBranch = { EVENT_05_A: new Set(), EVENT_05_B: new Set() };
const withCrises = new Set();
const finished = [];

function updateRanges(state, lowest, highest) {
  state.stats.forEach((value, i) => {
    lowest[i] = Math.min(lowest[i], value);
    highest[i] = Math.max(highest[i], value);
  });
}

function enumerate(state = startGame()) {
  updateRanges(state, summary.lowest, summary.highest);
  assert.ok(state.crisisHistory.length <= 2);
  assert.equal(new Set(state.appliedNews.map(item => item.id)).size, state.appliedNews.length);
  if (state.phase === 'report') {
    summary.paths++;
    updateRanges(state, summary.lowestFinal, summary.highestFinal);
    const { decisions, crisisHistory } = state;
    assert.equal(decisions.length, 5);
    assert.equal(state.year, 2036);
    assert.equal(state.additionalBudgetGranted, true);
    const basic = decisions.map(item => item.choice === 'reject' ? 'R' : 'A').join('');
    basicPaths.add(basic);
    baseBranch[decisions[4].eventId].add(basic);
    summary.finalBranches[decisions[4].eventId]++;
    if (crisisHistory.length) {
      summary.crisisPaths++;
      withCrises.add(basic);
    }
    if (crisisHistory.length === 2 && crisisHistory[1].order === crisisHistory[0].order + 1) summary.chained++;
    if (crisisHistory.some(item => item.year === 2036)) summary.finalYearCrises++;
    const report = finalReport(state);
    if (report.unresolved.length) summary.unresolved++;
    assert.equal(report.unresolved.length, breaches(state.stats).length);
    assert.equal(report.news.length, 5);
    const expectedNews = decisions.map(item => news[events[item.eventId].choices[item.choice].newsId].year);
    assert.deepEqual(report.news.map(item => item.year), [2030, 2031, 2036, 2036, 2036]);
    assert.deepEqual(report.news.map(item => item.year), expectedNews);
    assert.deepEqual(finalReport({ ...state, phase: 'handover' }), report);
    assert.deepEqual(finalReport({ ...state, phase: 'complete' }), report);
    assert.deepEqual(report.timeline.map(item => item.order), [...report.timeline.keys()]);
    for (const item of crisisHistory) {
      const response = crises.find(crisis => crisis.id === item.eventId).choices[item.choice];
      assert.ok((response.issue && report.issues.includes(response.issue)) ||
        (response.achievement && report.achievements.includes(response.achievement)));
    }
    finished.push({ basic, report });
    return;
  }

  const id = state.currentEvent;
  if (id === 'EVENT_02') assert.deepEqual(state.appliedNews, []);
  if (id.startsWith('EVENT_03')) {
    assert.equal(id, state.decisions[0].choice === 'accept' ? 'EVENT_03_A' : 'EVENT_03_B');
    assert.equal(state.appliedNews.at(-1).year, 2030);
  }
  if (id.startsWith('EVENT_04')) {
    assert.equal(id, state.decisions[1].choice === 'accept' ? 'EVENT_04_A' : 'EVENT_04_B');
    assert.equal(state.appliedNews.at(-1).year, 2031);
  }
  if (id.startsWith('EVENT_05')) {
    const { problemSolving, responsibility } = state.competencies;
    assert.equal(id, problemSolving * 2 < responsibility ? 'EVENT_05_A' : 'EVENT_05_B');
  }
  if (id.startsWith('CRISIS_')) {
    assert.equal(id, breaches(state.stats)[0].id);
    summary.crises[id] = (summary.crises[id] ?? 0) + 1;
  }
  for (const choice of choices) {
    const previous = JSON.stringify(state);
    const next = choose(state, id, choice);
    assert.equal(JSON.stringify(state), previous);
    assert.notEqual(next, state);
    const choiceEffects = (events[id] ?? crises.find(item => item.id === id)).choices[choice].effects;
    const nextStats = state.stats.map((value, index) => index === 3
      ? Math.max(0, value + choiceEffects[index]) : Math.min(100, value + choiceEffects[index]));
    if (!state.additionalBudgetGranted && next.additionalBudgetGranted) nextStats[0] = Math.min(100, nextStats[0] + 10);
    for (const story of next.appliedNews.slice(state.appliedNews.length)) {
      assert.equal(story.year, next.year);
      nextStats[3] = Math.max(0, nextStats[3] + story.socialChaos);
    }
    assert.deepEqual(next.stats, nextStats);
    enumerate(next);
  }
}

test('32개 기본 경로와 모든 위기 대응 경로를 완주한다', () => {
  enumerate();
  assert.equal(basicPaths.size, 32);
  assert.ok(summary.chained > 0);
  assert.ok(summary.finalYearCrises > 0);
  assert.ok(summary.unresolved > 0);
  assert.equal(baseBranch.EVENT_05_A.size + baseBranch.EVENT_05_B.size, 32);
});

test('정책·뉴스 수치와 위기 응답 순서가 명세와 일치한다', () => {
  assert.deepEqual(initialStats, [55, 30, 30, 75]);
  const expected = [
    [[-5, 5, -5, 0], [-15, -10, 10, 0], 5, 10],
    [[-5, -5, 5, 0], [-20, 10, -10, 0], 10, -10],
    [[0, -5, 5, 0], [-15, 10, 5, 0], 10, -15],
    [[-5, 5, 5, 0], [-10, 10, -10, 0], 5, -10],
    [[-5, -10, 5, 0], [-20, 15, -15, 0], 5, -15],
    [[0, -5, 5, 0], [-10, 10, -10, 0], 10, -15],
    [[-5, -5, 5, 0], [-20, 15, -10, 0], -10, -15],
    [[-15, 10, -5, 0], [-5, -10, -10, 0], -10, -15],
  ];
  assert.deepEqual(Object.values(events).map(({ choices: { reject, accept } }) => [
    reject.effects, accept.effects, news[reject.newsId].socialChaos, news[accept.newsId].socialChaos,
  ]), expected);
  assert.deepEqual(crises.map(({ choices: { reject, accept } }) => [reject.effects, accept.effects]), [
    [[20, -20, 0, 0], [20, 0, -20, 0]],
    [[0, 20, 0, 10], [-15, 20, 0, 0]],
    [[0, -15, 20, 0], [-20, 0, 20, 0]],
    [[-20, 0, 0, -20], [0, 0, -20, -20]],
  ]);
  assert.deepEqual(breaches([0, 0, 0, 100]), []);
  assert.deepEqual(breaches([-1, -1, -1, 101]).map(item => item.id), crises.map(item => item.id));
  assert.equal(policyTitle(startGame(), 'CRISIS_01', 'reject'), '기존 일반 방과후 프로그램 축소');
  assert.equal(choose(startGame(), 'EVENT_02', 'accept').decisions.length, 0);
});

test('축소된 사업은 원래 규모로 운영됐다고 보고하지 않는다', () => {
  const example = finished.find(({ report }) => report.news.some(item => item.id === 'NEWS_03_B_ACCEPT'
    && item.title.includes('초기 참여')));
  assert.ok(example);
  assert.ok(example.report.issues.some(item => item.includes('방과후 프로그램 축소')));
});

test('교사 통계에서 미경험 분기와 잘못된 학생 기록을 제외한다', () => {
  let first = choose(startGame(), 'EVENT_01', 'reject');
  first = choose(first, 'EVENT_02', 'accept');
  first = choose(first, 'EVENT_03_B', 'accept');
  const second = choose(startGame(), 'EVENT_01', 'accept');
  const payload = state => ({ decisions: state.decisions, crisisHistory: state.crisisHistory });
  const data = validatePlayers([
    { id: 'a', name: '가', payload: payload(first) },
    { id: 'b', name: '나', payload: payload(second) },
    { id: 'c', name: '다', payload: { decisions: [{ order: 0, eventId: 'EVENT_05_A', choice: 'accept' }] } },
  ]);
  const result = classResults(data);
  assert.equal(data[2].payload.status, 'invalid');
  assert.equal(result.playing, 2);
  assert.deepEqual(result.choices.filter(item => item.id.startsWith('EVENT_03')).map(item => [item.reject, item.accept]), [[0, 0], [0, 1]]);
});

test('경로 시뮬레이션과 밸런싱 지표 출력', () => {
  console.log(JSON.stringify({
    기본경로: basicPaths.size, 위기를경험한기본경로: withCrises.size,
    완결경로: summary.paths, 위기포함완결경로: summary.crisisPaths, 연쇄위기경로: summary.chained,
    마지막해위기경로: summary.finalYearCrises, 미해결위기경로: summary.unresolved,
    위기유형별분기지점: summary.crises,
    마지막사건기본경로: Object.fromEntries(Object.entries(baseBranch).map(([key, paths]) => [key, paths.size])),
    마지막사건완결경로: summary.finalBranches,
    지표: Object.fromEntries(metrics.map(({ label }, i) => [label, {
      진행중: [summary.lowest[i], summary.highest[i]],
      최종: [summary.lowestFinal[i], summary.highestFinal[i]],
    }])),
    반복선택: finished.filter(item => item.basic === 'RRRRR' || item.basic === 'AAAAA')
      .map(item => ({ path: item.basic, stats: item.report.stats, crises: item.report.timeline.length - 5 })),
  }, null, 2));
});
