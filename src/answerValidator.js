// answerValidator.js
// Gestionnaire de validation des réponses

import { ref, update, onValue, get } from 'firebase/database';
import { database } from './firebase';

const activeListeners = new Map();

export const submitAnswer = async (userId, matchId, questionId, answer, question) => {
  console.log(`📝 Soumission réponse - User: ${userId}, Question: ${questionId}, Réponse: ${answer}`);
  
  try {
    switch (question.type) {
      case 'culture':
        return await validateCultureAnswer(userId, matchId, questionId, answer, question);
      
      case 'prediction':
        return await handlePredictionAnswer(userId, matchId, questionId, answer, question);
      
      default:
        throw new Error(`Type de question inconnu: ${question.type}`);
    }
  } catch (error) {
    console.error('❌ Erreur lors de la soumission:', error);
    throw error;
  }
};

const validateCultureAnswer = async (userId, matchId, questionId, answer, question) => {
  const timestamp = Date.now();
  const isCorrect = answer === question.correctAnswer;
  
  console.log(`✅ Validation culture instantanée - Correct: ${isCorrect}`);
  
  const answerData = {
    answer,
    isCorrect,
    validated: true,
    validatedAt: timestamp,
    submittedAt: timestamp,
    points: isCorrect ? question.points : 0,
    type: 'culture',
    questionId,
    explanation: question.explanation
  };
  
  await update(
    ref(database, `matches/${matchId}/players/${userId}/answers/${questionId}`),
    answerData
  );
  
  if (isCorrect) {
    await updatePlayerScore(userId, matchId, question.points);
  }
  
  return {
    validated: true,
    isCorrect,
    immediate: true,
    points: isCorrect ? question.points : 0
  };
};

const handlePredictionAnswer = async (userId, matchId, questionId, answer, question) => {
  const timestamp = Date.now();
  const deadline = timestamp + (question.timeWindow * 60 * 1000);
  
  console.log(`⏰ Gestion prédiction - Réponse: ${answer}, Deadline: ${new Date(deadline).toLocaleTimeString()}`);
  
  const answerData = {
    answer,
    validated: false,
    submittedAt: timestamp,
    deadline,
    eventType: question.eventType,
    waitingForValidation: true,
    type: 'prediction',
    questionId,
    timeWindow: question.timeWindow,
    askedAtMinute: question.askedAt
  };
  
  if (question.cardType) {
    answerData.cardType = question.cardType;
  }
  if (question.minCount) {
    answerData.minCount = question.minCount;
  }
  
  await update(
    ref(database, `matches/${matchId}/players/${userId}/answers/${questionId}`),
    answerData
  );
  
  if (answer === 'Oui') {
    startEventListener(userId, matchId, questionId, question, timestamp, deadline);
  } else {
    startTimeoutValidator(userId, matchId, questionId, question, timestamp, deadline);
  }
  
  return {
    validated: false,
    waitingForEvent: answer === 'Oui',
    deadline,
    timeWindow: question.timeWindow
  };
};

const startEventListener = (userId, matchId, questionId, question, submittedAt, deadline) => {
  console.log(`👂 Démarrage écoute événement - Type: ${question.eventType}`);
  
  const eventsRef = ref(database, `matches/${matchId}/events`);
  const listenerKey = `${userId}_${questionId}`;
  
  const unsubscribe = onValue(eventsRef, (snapshot) => {
    const events = snapshot.val() || {};
    const eventsList = Object.values(events);
    const now = Date.now();
    
    if (now >= deadline) {
      console.log(`⏰ Temps écoulé sans événement - Réponse incorrecte`);
      validatePrediction(userId, matchId, questionId, false, null, question.points);
      unsubscribe();
      activeListeners.delete(listenerKey);
      return;
    }
    
    const eventFound = findMatchingEvent(eventsList, question, submittedAt);
    
    if (eventFound) {
      console.log(`💥 BOOM ! Événement trouvé - Validation immédiate`);
      validatePrediction(userId, matchId, questionId, true, eventFound.time.elapsed, question.points);
      unsubscribe();
      activeListeners.delete(listenerKey);
    }
  });
  
  activeListeners.set(listenerKey, unsubscribe);
};

const startTimeoutValidator = (userId, matchId, questionId, question, submittedAt, deadline) => {
  console.log(`⏳ Démarrage validation différée - Attente jusqu'à ${new Date(deadline).toLocaleTimeString()}`);
  
  const eventsRef = ref(database, `matches/${matchId}/events`);
  const listenerKey = `${userId}_${questionId}`;
  
  const unsubscribe = onValue(eventsRef, (snapshot) => {
    const events = snapshot.val() || {};
    const eventsList = Object.values(events);
    const now = Date.now();
    
    const eventFound = findMatchingEvent(eventsList, question, submittedAt);
    
    if (eventFound) {
      console.log(`💥 Événement trouvé ! Le joueur avait tort de dire "Non"`);
      validatePrediction(userId, matchId, questionId, false, eventFound.time.elapsed, question.points);
      unsubscribe();
      activeListeners.delete(listenerKey);
      return;
    }
    
    if (now >= deadline) {
      console.log(`✅ Délai écoulé sans événement - Le joueur avait raison`);
      validatePrediction(userId, matchId, questionId, true, null, question.points);
      unsubscribe();
      activeListeners.delete(listenerKey);
    }
  });
  
  activeListeners.set(listenerKey, unsubscribe);
};

const findMatchingEvent = (eventsList, question, submittedAt) => {
  return eventsList.find(event => {
    if (event.type !== question.eventType) return false;
    const eventTimestamp = event.timestamp || 0;
    if (eventTimestamp <= submittedAt) return false;
    if (question.cardType && event.detail !== question.cardType) {
      return false;
    }
    return true;
  });
};

const validatePrediction = async (userId, matchId, questionId, isCorrect, eventTime, questionPoints) => {
  const timestamp = Date.now();
  
  const updateData = {
    validated: true,
    isCorrect,
    validatedAt: timestamp,
    eventTime: eventTime || null,
    points: isCorrect ? questionPoints : 0
  };
  
  console.log(`📊 Validation finale - Correct: ${isCorrect}, Points: ${updateData.points}`);
  
  await update(
    ref(database, `matches/${matchId}/players/${userId}/answers/${questionId}`),
    updateData
  );
  
  if (isCorrect) {
    await updatePlayerScore(userId, matchId, questionPoints);
  }
};

const updatePlayerScore = async (userId, matchId, points) => {
  const playerRef = ref(database, `matches/${matchId}/players/${userId}`);
  const snapshot = await get(playerRef);
  const currentData = snapshot.val() || {};
  const currentScore = currentData.score || 0;
  
  await update(playerRef, {
    score: currentScore + points,
    lastUpdate: Date.now()
  });
  
  console.log(`🎯 Score mis à jour - Nouveau score: ${currentScore + points}`);
};

export const cleanupAllListeners = () => {
  console.log(`🧹 Nettoyage de ${activeListeners.size} listeners actifs`);
  activeListeners.forEach((unsubscribe, key) => {
    unsubscribe();
  });
  activeListeners.clear();
};

export const cleanupPlayerListeners = (userId) => {
  const keysToDelete = [];
  activeListeners.forEach((unsubscribe, key) => {
    if (key.startsWith(userId)) {
      unsubscribe();
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => activeListeners.delete(key));
  console.log(`🧹 Nettoyage de ${keysToDelete.length} listeners pour le joueur ${userId}`);
};

