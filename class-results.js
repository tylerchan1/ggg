import { characters, crises, events } from './events.js';
import { choose, finalReport, startGame } from './game.js';

export function validatePlayers(players) {
  return players.map(({ id, name, payload }) => {
    const decisions = payload?.decisions ?? [];
    const crisisHistory = payload?.crisisHistory ?? [];
    if (!Array.isArray(decisions) || decisions.length > 5 || !Array.isArray(crisisHistory) || crisisHistory.length > 2) {
      return { id, name, payload: { status: 'invalid' } };
    }
    const articles = payload?.finalReport?.news;
    const immediate = Array.isArray(articles) && articles.some(item => Number.isInteger(item?.decisionYear));
    const historical = payload?.status === 'submitted' && !immediate;
    let state = startGame(historical ? 'scheduled' : 'immediate');
    const records = [...decisions, ...crisisHistory];
    for (let order = 0; order < records.length; order++) {
      const record = records.find(item => item?.order === order);
      if (!record || record.eventId !== state.currentEvent) return { id, name, payload: { status: 'invalid' } };
      const next = choose(state, state.currentEvent, record.choice);
      if (next === state) return { id, name, payload: { status: 'invalid' } };
      state = next;
    }
    const report = finalReport(state);
    const education = payload?.handover?.education;
    const reason = payload?.handover?.reason;
    const submitted = payload?.status === 'submitted' && report && typeof education === 'string'
      && typeof reason === 'string' && education.trim() && reason.trim()
      && education.length <= 300 && reason.length <= 800;
    return { id, name, payload: {
      status: submitted ? 'submitted' : 'playing',
      year: state.year,
      decisions: state.decisions,
      crisisHistory: state.crisisHistory,
      finalReport: report,
      handover: submitted ? { education, reason } : null,
    } };
  });
}

export function classResults(players) {
  const rows = players.map(player => player.payload ?? {});
  const choices = Object.values(events).map(event => {
    const experienced = rows.flatMap(row => (row.decisions ?? [])
      .filter(item => item.eventId === event.id));
    return {
      id: event.id, label: `${event.year}년 · ${characters[event.character]}`,
      reject: experienced.filter(item => item.choice === 'reject').length,
      accept: experienced.filter(item => item.choice === 'accept').length,
    };
  });
  const values = rows.map(row => row.finalReport?.stats?.[3]).filter(Number.isFinite);
  const bands = [
    ['0–19', 0, 19], ['20–39', 20, 39], ['40–59', 40, 59],
    ['60–79', 60, 79], ['80–100', 80, 100], ['101 이상', 101, Infinity],
  ].map(([label, min, max]) => ({ label, count: values.filter(value => value >= min && value <= max).length }));

  return {
    playing: rows.filter(row => row.status === 'playing').length,
    submitted: rows.filter(row => row.status === 'submitted').length,
    choices,
    finals: choices.filter(item => item.id.startsWith('EVENT_05')).map(item => ({
      label: item.label.replace('2033년 · ', ''), count: item.reject + item.accept,
    })),
    bands,
    finished: values.length,
    crises: crises.map(crisis => ({
      label: crisis.title,
      count: rows.flatMap(row => row.crisisHistory ?? []).filter(item => item.eventId === crisis.id).length,
    })),
  };
}
