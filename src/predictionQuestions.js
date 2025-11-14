// predictionQuestions.js
// Questions de prédiction pour les événements de match

export const PREDICTION_QUESTIONS_TEMPLATES = [
  {
    id: 'pred_card_yellow',
    type: 'prediction',
    question: 'Y aura-t-il un carton jaune dans les {timeWindow} prochaines minutes ?',
    eventType: 'Card',
    cardType: 'Yellow Card',
    timeWindow: 5,
    points: 1,
    difficulty: 'easy'
  },
  {
    id: 'pred_card_red',
    type: 'prediction',
    question: 'Y aura-t-il un carton rouge dans les {timeWindow} prochaines minutes ?',
    eventType: 'Card',
    cardType: 'Red Card',
    timeWindow: 10,
    points: 2,
    difficulty: 'hard'
  },
  {
    id: 'pred_substitution',
    type: 'prediction',
    question: 'Y aura-t-il un remplacement dans les {timeWindow} prochaines minutes ?',
    eventType: 'subst',
    timeWindow: 8,
    points: 1,
    difficulty: 'medium'
  },
  {
    id: 'pred_var',
    type: 'prediction',
    question: 'Y aura-t-il une intervention de la VAR dans les {timeWindow} prochaines minutes ?',
    eventType: 'Var',
    timeWindow: 10,
    points: 2,
    difficulty: 'hard'
  },
  {
    id: 'pred_card_any',
    type: 'prediction',
    question: 'Y aura-t-il un carton (jaune ou rouge) dans les {timeWindow} prochaines minutes ?',
    eventType: 'Card',
    timeWindow: 5,
    points: 1,
    difficulty: 'easy'
  },
  {
    id: 'pred_multiple_cards',
    type: 'prediction',
    question: 'Y aura-t-il plusieurs cartons dans les {timeWindow} prochaines minutes ?',
    eventType: 'Card',
    minCount: 2,
    timeWindow: 10,
    points: 2,
    difficulty: 'hard'
  },
  {
    id: 'pred_substitution_double',
    type: 'prediction',
    question: 'Y aura-t-il un double remplacement dans les {timeWindow} prochaines minutes ?',
    eventType: 'subst',
    minCount: 2,
    timeWindow: 5,
    points: 2,
    difficulty: 'medium'
  }
];

// Configuration des types d'événements à surveiller
export const EVENT_TYPES_CONFIG = {
  Card: {
    label: 'Carton',
    icon: '🟨',
    priority: 'high'
  },
  subst: {
    label: 'Remplacement',
    icon: '🔄',
    priority: 'medium'
  },
  Var: {
    label: 'VAR',
    icon: '📺',
    priority: 'high'
  }
};

// Fonction pour générer une question de prédiction
export const generatePredictionQuestion = (template, currentMinute) => {
  return {
    ...template,
    id: `${template.id}_${currentMinute}_${Date.now()}`,
    question: template.question.replace('{timeWindow}', template.timeWindow),
    askedAt: currentMinute,
    deadline: currentMinute + template.timeWindow
  };
};

// Fonction pour obtenir des questions adaptées au moment du match
export const getPredictionQuestionsForMinute = (minute) => {
  if (minute < 30) {
    return PREDICTION_QUESTIONS_TEMPLATES.filter(q => q.difficulty === 'easy');
  }
  if (minute < 60) {
    return PREDICTION_QUESTIONS_TEMPLATES.filter(q =>
      q.difficulty === 'easy' || q.difficulty === 'medium'
    );
  }
  return PREDICTION_QUESTIONS_TEMPLATES;
};

