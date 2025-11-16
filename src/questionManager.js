// questionManager.js
import { ref, set, get, update, onValue } from 'firebase/database';
import { db } from './firebase';
import { getRandomCultureQuestions } from './cultureQuestions';
import {
  generatePredictionQuestion,
  getPredictionQuestionsForMinute
} from './predictionQuestions';

export const generateMatchQuestions = (matchId, matchDuration = 90) => {
  const questions = [];
  let questionCounter = 0;

  const cultureQuestions = getRandomCultureQuestions(15);
  let cultureIndex = 0;

  for (let minute = 5; minute < matchDuration; minute += getRandomInterval(3, 5)) {
    questionCounter++;
    const isCultureQuestion = Math.random() < 0.4 && cultureIndex < cultureQuestions.length;

    if (isCultureQuestion) {
      const cultureQ = cultureQuestions[cultureIndex];
      questions.push({
        ...cultureQ,
        scheduledMinute: minute,
        order: questionCounter
      });
      cultureIndex++;
    } else {
      const availableTemplates = getPredictionQuestionsForMinute(minute);
      const template = availableTemplates[Math.floor(Math.random() * availableTemplates.length)];
      const predictionQ = generatePredictionQuestion(template, minute);

      questions.push({
        ...predictionQ,
        scheduledMinute: minute,
        order: questionCounter
      });
    }
  }

  console.log(`📋 Généré ${questions.length} questions pour le match ${matchId}`);
  return questions;
};

export const initializeMatchQuestions = async (matchId, questions) => {
  const questionsRef = ref(db, `matches/${matchId}/questions`);

  const questionsData = {};
  questions.forEach(question => {
    questionsData[question.id] = {
      ...question,
      status: 'pending',
      createdAt: Date.now()
    };
  });

  await set(questionsRef, questionsData);
  console.log(`✅ Questions initialisées dans Firebase pour le match ${matchId}`);

  return questions;
};

export const activateQuestion = async (matchId, questionId) => {
  const questionRef = ref(db, `matches/${matchId}/questions/${questionId}`);

  await update(questionRef, {
    status: 'active',
    activatedAt: Date.now()
  });

  console.log(`🔔 Question activée: ${questionId}`);
};

export const closeQuestion = async (matchId, questionId) => {
  const questionRef = ref(db, `matches/${matchId}/questions/${questionId}`);

  await update(questionRef, {
    status: 'closed',
    closedAt: Date.now()
  });

  console.log(`🔒 Question fermée: ${questionId}`);
};

export const startQuestionScheduler = (matchId, onQuestionActivated) => {
  const timerRef = ref(db, `matches/${matchId}/timer/elapsed`);
  const questionsRef = ref(db, `matches/${matchId}/questions`);

  let questions = [];

  const unsubscribeQuestions = onValue(questionsRef, (snapshot) => {
    const questionsData = snapshot.val() || {};
    questions = Object.values(questionsData);
  });

  const unsubscribeTimer = onValue(timerRef, async (snapshot) => {
    const currentMinute = snapshot.val() || 0;

    const questionsToActivate = questions.filter(q =>
      q.status === 'pending' &&
      q.scheduledMinute <= currentMinute
    );

    for (const question of questionsToActivate) {
      await activateQuestion(matchId, question.id);
      if (onQuestionActivated) {
        onQuestionActivated(question);
      }
    }

    const questionsToClose = questions.filter(q =>
      q.status === 'active' &&
      q.type === 'prediction' &&
      q.deadline &&
      currentMinute >= q.deadline
    );

    for (const question of questionsToClose) {
      await closeQuestion(matchId, question.id);
    }
  });

  return () => {
    unsubscribeQuestions();
    unsubscribeTimer();
  };
};

export const getMatchQuestions = async (matchId) => {
  const questionsRef = ref(db, `matches/${matchId}/questions`);
  const snapshot = await get(questionsRef);

  if (!snapshot.exists()) {
    return [];
  }

  const questionsData = snapshot.val();
  return Object.values(questionsData).sort((a, b) => a.order - b.order);
};

export const getQuestion = async (matchId, questionId) => {
  const questionRef = ref(db, `matches/${matchId}/questions/${questionId}`);
  const snapshot = await get(questionRef);

  if (!snapshot.exists()) {
    throw new Error(`Question ${questionId} non trouvée`);
  }

  return snapshot.val();
};

export const getActiveQuestions = async (matchId) => {
  const questions = await getMatchQuestions(matchId);
  return questions.filter(q => q.status === 'active');
};

export const getPlayerAnswers = async (matchId, userId) => {
  const answersRef = ref(db, `matches/${matchId}/players/${userId}/answers`);
  const snapshot = await get(answersRef);

  if (!snapshot.exists()) {
    return {};
  }

  return snapshot.val();
};

export const hasPlayerAnswered = async (matchId, userId, questionId) => {
  const answers = await getPlayerAnswers(matchId, userId);
  return !!answers[questionId];
};

export const getQuestionStats = async (matchId, questionId) => {
  const matchRef = ref(db, `matches/${matchId}/players`);
  const snapshot = await get(matchRef);

  if (!snapshot.exists()) {
    return {
      totalAnswers: 0,
      correctAnswers: 0,
      answerDistribution: {}
    };
  }

  const players = snapshot.val();
  let totalAnswers = 0;
  let correctAnswers = 0;
  const answerDistribution = {};

  Object.values(players).forEach(player => {
    const answer = player.answers?.[questionId];
    if (answer) {
      totalAnswers++;
      if (answer.isCorrect) {
        correctAnswers++;
      }
      answerDistribution[answer.answer] = (answerDistribution[answer.answer] || 0) + 1;
    }
  });

  return {
    totalAnswers,
    correctAnswers,
    correctPercentage: totalAnswers > 0 ? (correctAnswers / totalAnswers * 100).toFixed(1) : 0,
    answerDistribution
  };
};

const getRandomInterval = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const createSimulationMatch = async () => {
  const matchId = `simulation_${Date.now()}`;

  const matchData = {
    id: matchId,
    homeTeam: {
      id: 85,
      name: 'Paris Saint Germain',
      logo: 'https://media.api-sports.io/football/teams/85.png'
    },
    awayTeam: {
      id: 81,
      name: 'Marseille',
      logo: 'https://media.api-sports.io/football/teams/81.png'
    },
    status: 'live',
    timer: {
      elapsed: 0,
      running: false
    },
    createdAt: Date.now()
  };

  await set(ref(db, `matches/${matchId}`), matchData);

  const questions = generateMatchQuestions(matchId);
  await initializeMatchQuestions(matchId, questions);

  await generateSimulationEvents(matchId);

  console.log(`🎮 Match de simulation créé: ${matchId}`);
  return matchId;
};

const generateSimulationEvents = async (matchId) => {
  const events = [
    {
      id: 'evt_1',
      type: 'Card',
      detail: 'Yellow Card',
      team: { id: 85, name: 'Paris Saint Germain' },
      player: { id: 1, name: 'Marquinhos' },
      time: { elapsed: 12 },
      timestamp: Date.now() + 12 * 60 * 1000
    },
    {
      id: 'evt_2',
      type: 'subst',
      team: { id: 81, name: 'Marseille' },
      assist: { id: 2, name: 'Player Out' },
      player: { id: 3, name: 'Player In' },
      time: { elapsed: 23 },
      timestamp: Date.now() + 23 * 60 * 1000
    },
    {
      id: 'evt_3',
      type: 'Card',
      detail: 'Yellow Card',
      team: { id: 81, name: 'Marseille' },
      player: { id: 4, name: 'Payet' },
      time: { elapsed: 34 },
      timestamp: Date.now() + 34 * 60 * 1000
    },
    {
      id: 'evt_4',
      type: 'subst',
      team: { id: 85, name: 'Paris Saint Germain' },
      assist: { id: 5, name: 'Player Out' },
      player: { id: 6, name: 'Player In' },
      time: { elapsed: 56 },
      timestamp: Date.now() + 56 * 60 * 1000
    },
    {
      id: 'evt_5',
      type: 'Card',
      detail: 'Red Card',
      team: { id: 85, name: 'Paris Saint Germain' },
      player: { id: 7, name: 'Verratti' },
      time: { elapsed: 67 },
      timestamp: Date.now() + 67 * 60 * 1000
    },
    {
      id: 'evt_6',
      type: 'Var',
      team: { id: 81, name: 'Marseille' },
      detail: 'Penalty - Awarded',
      time: { elapsed: 78 },
      timestamp: Date.now() + 78 * 60 * 1000
    }
  ];

  const eventsRef = ref(db, `matches/${matchId}/events`);
  const eventsData = {};
  events.forEach(event => {
    eventsData[event.id] = event;
  });

  await set(eventsRef, eventsData);
  console.log(`🎲 ${events.length} événements de simulation générés`);
};

