// Moteur de questions relié à l'API Football
// Gestion de la difficulté, attribution des points, et système anti-répétition

// Stockage des questions récentes pour éviter la répétition
let recentQuestions = [];

// Templates de questions avec différents types et difficultés
export const QUESTION_TEMPLATES = [
  {
    id: "corner_next",
    difficulty: "easy",
    points: 15,
    text: "Quelle équipe aura le prochain corner ?",
    options: ["Domicile", "Extérieur", "Aucune"],
    api: "statistics",
    type: "corners",
    duration: 120000 // 2 minutes
  },
  {
    id: "goal_next",
    difficulty: "medium",
    points: 25,
    text: "Y aura-t-il un but dans les 2 prochaines minutes ?",
    options: ["Oui", "Non"],
    api: "events",
    type: "Goal",
    duration: 120000 // 2 minutes
  },
  {
    id: "card_next",
    difficulty: "medium",
    points: 25,
    text: "Quelle équipe aura la prochaine carte ?",
    options: ["Domicile", "Extérieur", "Aucune"],
    api: "events",
    type: "Card",
    duration: 180000 // 3 minutes
  },
  {
    id: "shot_next",
    difficulty: "medium",
    points: 25,
    text: "Quelle équipe fera le prochain tir cadré ?",
    options: ["Domicile", "Extérieur", "Aucune"],
    api: "statistics",
    type: "shots_on_target",
    duration: 150000 // 2.5 minutes
  },
  {
    id: "scorer_next",
    difficulty: "hard",
    points: 50,
    text: "Quel joueur marquera le prochain but ?",
    options: [], // à remplir dynamiquement avec 4 joueurs offensifs
    api: "events",
    type: "Goal",
    duration: 300000 // 5 minutes
  },
  {
    id: "substitution_next",
    difficulty: "easy",
    points: 15,
    text: "Y aura-t-il une substitution dans les 3 prochaines minutes ?",
    options: ["Oui", "Non"],
    api: "events",
    type: "subst",
    duration: 180000 // 3 minutes
  },
  {
    id: "foul_next",
    difficulty: "easy",
    points: 15,
    text: "Quelle équipe commettra la prochaine faute ?",
    options: ["Domicile", "Extérieur", "Aucune"],
    api: "events",
    type: "Card",
    duration: 120000 // 2 minutes
  },
  {
    id: "offside_next",
    difficulty: "medium",
    points: 20,
    text: "Y aura-t-il un hors-jeu dans les 2 prochaines minutes ?",
    options: ["Oui", "Non"],
    api: "events",
    type: "Var",
    duration: 120000 // 2 minutes
  }
];

/**
 * Sélectionne une question aléatoire en évitant les répétitions récentes
 * @param {Array} matchPlayers - Liste des joueurs du match pour les questions de joueurs
 * @returns {Object} Question complète avec createdAt, expiresAt, etc.
 */
export function pickRandomQuestion(matchPlayers = []) {
  // Filtrer les questions récentes (éviter les 5 dernières)
  const availableTemplates = QUESTION_TEMPLATES.filter(template => 
    !recentQuestions.includes(template.id)
  );

  // Si toutes les questions ont été utilisées, réinitialiser
  if (availableTemplates.length === 0) {
    recentQuestions = [];
    availableTemplates.push(...QUESTION_TEMPLATES);
  }

  // Sélectionner un template aléatoire
  const template = availableTemplates[Math.floor(Math.random() * availableTemplates.length)];
  
  // Ajouter à la liste des questions récentes
  recentQuestions.push(template.id);
  
  // Garder seulement les 5 dernières
  if (recentQuestions.length > 5) {
    recentQuestions = recentQuestions.slice(-5);
  }

  const now = Date.now();
  const question = {
    id: `q_${now}`,
    templateId: template.id,
    text: template.text,
    options: [...template.options], // Copie des options
    points: template.points,
    difficulty: template.difficulty,
    createdAt: now,
    expiresAt: now + template.duration,
    api: template.api,
    type: template.type,
    duration: template.duration
  };

  // Pour les questions de joueurs, remplir dynamiquement les options
  if (template.id === "scorer_next" && matchPlayers.length >= 4) {
    // Filtrer les joueurs offensifs (attaquants, milieux offensifs)
    const offensivePlayers = matchPlayers.filter(player => 
      ['F', 'M', 'AM', 'LW', 'RW', 'CF', 'ST'].includes(player.position)
    );
    
    if (offensivePlayers.length >= 4) {
      // Mélanger et prendre 4 joueurs offensifs
      const shuffled = [...offensivePlayers].sort(() => 0.5 - Math.random());
      question.options = shuffled.slice(0, 4).map(p => p.name.split(' ').pop());
    } else {
      // Si pas assez de joueurs offensifs, prendre tous les joueurs
      const shuffled = [...matchPlayers].sort(() => 0.5 - Math.random());
      question.options = shuffled.slice(0, 4).map(p => p.name.split(' ').pop());
    }
  }

  return question;
}

/**
 * Évalue une question en appelant l'API Football et en déterminant la bonne réponse
 * @param {Object} question - Question à évaluer
 * @param {string} fixtureId - ID du match
 * @param {string} apiKey - Clé API Football
 * @returns {Promise<string>} La bonne réponse parmi les options proposées
 */
export async function evaluateQuestion(question, fixtureId, apiKey) {
  try {
    if (!apiKey || apiKey === 'demo_key') {
      console.warn('⚠️ Clé API non configurée, réponse aléatoire');
      return question.options[Math.floor(Math.random() * question.options.length)];
    }

    const now = Date.now();
    const timeWindow = {
      start: question.createdAt,
      end: question.expiresAt
    };

    console.log(`🔍 Évaluation question ${question.templateId} entre ${new Date(timeWindow.start).toLocaleTimeString()} et ${new Date(timeWindow.end).toLocaleTimeString()}`);

    let result = null;

    if (question.api === "statistics") {
      result = await evaluateStatisticsQuestion(question, fixtureId, apiKey, timeWindow);
    } else if (question.api === "events") {
      result = await evaluateEventsQuestion(question, fixtureId, apiKey, timeWindow);
    }

    // Si aucun résultat clair, retourner "Aucune" ou "Non"
    if (!result) {
      if (question.options.includes("Aucune")) {
        return "Aucune";
      } else if (question.options.includes("Non")) {
        return "Non";
      } else {
        // Pour les questions de joueurs, prendre le premier joueur comme réponse par défaut
        return question.options[0];
      }
    }

    return result;

  } catch (error) {
    console.error('❌ Erreur évaluation question:', error);
    
    // En cas d'erreur, retourner une réponse par défaut
    if (question.options.includes("Aucune")) {
      return "Aucune";
    } else if (question.options.includes("Non")) {
      return "Non";
    } else {
      return question.options[0];
    }
  }
}

/**
 * Évalue une question basée sur les statistiques
 */
async function evaluateStatisticsQuestion(question, fixtureId, apiKey, timeWindow) {
  try {
    const response = await fetch(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });

    const data = await response.json();
    
    if (!data.response || data.response.length === 0) {
      return null;
    }

    const stats = data.response[0];
    const homeStats = stats.statistics.find(s => s.team.id === stats.team.id);
    const awayStats = stats.statistics.find(s => s.team.id !== stats.team.id);

    if (!homeStats || !awayStats) {
      return null;
    }

    // Analyser les statistiques selon le type de question
    switch (question.type) {
      case "corners":
        const homeCorners = parseInt(homeStats.statistics.find(s => s.type === 'Corner Kicks')?.value || '0');
        const awayCorners = parseInt(awayStats.statistics.find(s => s.type === 'Corner Kicks')?.value || '0');
        
        if (homeCorners > awayCorners) {
          return "Domicile";
        } else if (awayCorners > homeCorners) {
          return "Extérieur";
        } else {
          return "Aucune";
        }

      case "shots_on_target":
        const homeShots = parseInt(homeStats.statistics.find(s => s.type === 'Shots on Goal')?.value || '0');
        const awayShots = parseInt(awayStats.statistics.find(s => s.type === 'Shots on Goal')?.value || '0');
        
        if (homeShots > awayShots) {
          return "Domicile";
        } else if (awayShots > homeShots) {
          return "Extérieur";
        } else {
          return "Aucune";
        }

      default:
        return null;
    }

  } catch (error) {
    console.error('Erreur statistiques:', error);
    return null;
  }
}

/**
 * Évalue une question basée sur les événements
 */
async function evaluateEventsQuestion(question, fixtureId, apiKey, timeWindow) {
  try {
    const response = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });

    const data = await response.json();
    
    if (!data.response || data.response.length === 0) {
      return null;
    }

    const events = data.response[0].events || [];
    
    // Filtrer les événements dans la fenêtre de temps
    const relevantEvents = events.filter(event => {
      const eventTime = new Date(event.time.elapsed * 60000).getTime();
      return eventTime >= timeWindow.start && eventTime <= timeWindow.end;
    });

    console.log(`📊 ${relevantEvents.length} événements trouvés dans la fenêtre de temps`);

    // Analyser les événements selon le type de question
    switch (question.type) {
      case "Goal":
        const goals = relevantEvents.filter(e => e.type === 'Goal');
        if (goals.length > 0) {
          if (question.templateId === "goal_next") {
            return "Oui";
          } else if (question.templateId === "scorer_next") {
            // Retourner le nom du joueur qui a marqué
            const scorer = goals[0].player?.name;
            if (scorer) {
              const lastName = scorer.split(' ').pop();
              return question.options.find(opt => opt === lastName) || question.options[0];
            }
          }
        }
        return question.templateId === "goal_next" ? "Non" : null;

      case "Card":
        const cards = relevantEvents.filter(e => e.type === 'Card');
        if (cards.length > 0) {
          const card = cards[0];
          if (card.team?.name) {
            // Déterminer si c'est l'équipe à domicile ou à l'extérieur
            // Cette logique dépend de la structure des données de l'API
            return "Domicile"; // Simplification, à adapter selon l'API
          }
        }
        return "Aucune";

      case "subst":
        const substitutions = relevantEvents.filter(e => e.type === 'subst');
        return substitutions.length > 0 ? "Oui" : "Non";

      case "Var":
        const varEvents = relevantEvents.filter(e => e.detail?.includes('VAR') || e.detail?.includes('offside'));
        return varEvents.length > 0 ? "Oui" : "Non";

      default:
        return null;
    }

  } catch (error) {
    console.error('Erreur événements:', error);
    return null;
  }
}

/**
 * Calcule les points bonus selon la vitesse de réponse
 * @param {number} timeLeft - Temps restant en secondes
 * @param {number} basePoints - Points de base de la question
 * @returns {number} Points bonus
 */
export function calculateSpeedBonus(timeLeft, basePoints) {
  // Bonus de vitesse : 1 point par seconde restante, maximum 5 points
  const speedBonus = Math.min(Math.floor(timeLeft / 3), 5);
  return speedBonus;
}

/**
 * Calcule le total des points (base + bonus vitesse)
 * @param {number} basePoints - Points de base de la question
 * @param {number} timeLeft - Temps restant en secondes
 * @returns {number} Total des points
 */
export function calculateTotalPoints(basePoints, timeLeft) {
  const speedBonus = calculateSpeedBonus(timeLeft, basePoints);
  return basePoints + speedBonus;
}

/**
 * Réinitialise la liste des questions récentes
 */
export function resetRecentQuestions() {
  recentQuestions = [];
}

/**
 * Obtient la liste des questions récentes (pour debug)
 */
export function getRecentQuestions() {
  return [...recentQuestions];
}
