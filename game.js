import {
  additionalBudget, competencyMax, crises, crisisById, events, finalYear, initialStats, news, regularYears,
} from './events.js';

const maxCrises = 2;
const phases = ['report', 'handover', 'complete'];

export function startGame(newsTiming = 'immediate') {
  return {
    year: regularYears[0],
    newsTiming,
    stats: [...initialStats],
    competencies: { problemSolving: 0, responsibility: 0 },
    phase: 'playing',
    currentEvent: 'EVENT_01',
    additionalBudgetGranted: false,
    decisions: [],
    crisisHistory: [],
    appliedNews: [],
    handover: null,
  };
}

export function eventFor(state) {
  return events[state.currentEvent] ?? crisisById[state.currentEvent];
}

export function breaches(stats) {
  return crises.filter(({ metric }) => metric === 3 ? stats[metric] > 100 : stats[metric] < 0);
}

function applyEffects(state, effects) {
  state.stats = state.stats.map((value, index) => {
    const next = value + effects[index];
    return index === 3 ? Math.max(0, next) : Math.min(100, next);
  });
}

function branch(state) {
  const { decisions, competencies } = state;
  switch (decisions.length) {
    case 0: return 'EVENT_01';
    case 1: return 'EVENT_02';
    case 2:
    case 3: {
      const earlier = decisions[decisions.length - 2];
      return events[earlier.eventId].choices[earlier.choice].followUp;
    }
    case 4:
      return competencies.problemSolving / competencyMax.problemSolving
        < competencies.responsibility / competencyMax.responsibility
        ? 'EVENT_05_A' : 'EVENT_05_B';
    default: return null;
  }
}

function showCrisis(state) {
  const breach = breaches(state.stats)[0];
  if (!breach || state.crisisHistory.length >= maxCrises) return false;
  state.currentEvent = breach.id;
  return true;
}

function advance(state) {
  if (showCrisis(state)) return;
  state.year = regularYears[state.decisions.length] ?? finalYear;

  if (state.year === additionalBudget.year && !state.additionalBudgetGranted) {
    state.additionalBudgetGranted = true;
    applyEffects(state, [additionalBudget.amount, 0, 0, 0]);
  }

  // Existing saves and submissions retain their original event order and crisis decisions.
  if (state.newsTiming !== 'immediate') {
    for (const decision of state.decisions) {
      const newsId = events[decision.eventId].choices[decision.choice].newsId;
      if (news[newsId].year !== state.year || state.appliedNews.some(item => item.id === newsId)) continue;
      publishNews(state, newsId, decision);
      if (showCrisis(state)) return;
    }
  }

  state.currentEvent = branch(state);
  if (!state.currentEvent) state.phase = 'report';
}

function publishNews(state, newsId, decision) {
  const story = { id: newsId, ...resolveStory(state, newsId, decision), socialChaosBefore: state.stats[3] };
  applyEffects(state, [0, 0, 0, story.socialChaos]);
  if (state.newsTiming === 'immediate') {
    story.decisionYear = decision.year;
    story.statsAtPublication = [...state.stats];
  }
  state.appliedNews.push(story);
}

function resolveStory(state, newsId, decision) {
  const story = news[newsId];
  const applicable = state.crisisHistory
    .filter(item => item.order > decision.order && item.year <= story.year)
    .map(item => crisisById[item.eventId].choices[item.choice].modifier);
  const adaptation = ['afterSchool', 'hours', 'newPrograms']
    .find(key => applicable.includes(key) && story.adaptations[key]);
  const [title, detail, achievement, issue] = adaptation
    ? story.adaptations[adaptation]
    : [story.title, story.detail, story.achievement, story.issue];
  return { year: story.year, socialChaos: story.socialChaos, title, detail, achievement, issue };
}

export function policyTitle(state, eventId, choice, beforeOrder = Infinity) {
  if (eventId === 'CRISIS_01' && choice === 'reject' &&
      !state.decisions.some(item => item.eventId === 'EVENT_03_B' && item.choice === 'accept' && item.order < beforeOrder)) {
    return '기존 일반 방과후 프로그램 축소';
  }
  return (events[eventId] ?? crisisById[eventId]).choices[choice].title;
}

export function choose(previous, eventId, choice) {
  if (previous.phase !== 'playing' || previous.currentEvent !== eventId ||
      (choice !== 'reject' && choice !== 'accept')) return previous;
  const state = structuredClone(previous);
  const event = eventFor(state);
  const option = event.choices[choice];
  const order = state.decisions.length + state.crisisHistory.length;
  const record = { eventId, choice, year: state.year, order, title: policyTitle(state, eventId, choice) };

  applyEffects(state, option.effects);
  if (eventId in events) {
    state.decisions.push(record);
    for (const [key, value] of Object.entries(option.competencies)) state.competencies[key] += value;
    if (state.newsTiming === 'immediate') publishNews(state, option.newsId, record);
  } else {
    state.crisisHistory.push(record);
  }

  advance(state);
  return state;
}

export function finalReport(state) {
  if (!phases.includes(state.phase)) return null;
  const stories = state.appliedNews.map(item => {
    if (state.newsTiming === 'immediate' || item.year !== finalYear) return item;
    const decision = state.decisions.find(({ eventId, choice }) => events[eventId].choices[choice].newsId === item.id);
    return { id: item.id, ...resolveStory(state, item.id, decision) };
  });
  const outcomes = state.newsTiming === 'immediate'
    ? state.decisions.map(decision => resolveStory(state, events[decision.eventId].choices[decision.choice].newsId, decision))
    : stories;
  const responses = state.crisisHistory.map(({ eventId, choice }) => crisisById[eventId].choices[choice]);
  return {
    stats: [...state.stats],
    unresolved: breaches(state.stats).map(item => ({ title: item.title, value: state.stats[item.metric] })),
    news: stories,
    achievements: [...outcomes, ...responses].map(item => item.achievement).filter(Boolean),
    issues: [...outcomes, ...responses].map(item => item.issue).filter(Boolean),
    timeline: [...state.decisions, ...state.crisisHistory].sort((a, b) => a.order - b.order),
  };
}
