/**
 * Génération de questions culture ET prédiction avec Claude AI
 */

/**
 * Génère une question de CULTURE GÉNÉRALE via Claude AI
 * Utilise la route API proxy /api/claude pour garder la clé API sécurisée
 */
export async function generateCultureQuestion(matchContext, apiKey, recentQuestions = []) {
  const playersList = matchContext.players
    ? matchContext.players.slice(0, 20).join(', ')
    : 'Non disponible';

  // 🔥 AMÉLIORATION : Ajouter timestamp et nombre aléatoire pour forcer la variété
  const timestamp = Date.now();
  const randomSeed = Math.floor(Math.random() * 10000);
  const questionNumber = Math.floor(Math.random() * 1000);

  // 🔥 FIX: Construire la liste des questions récentes à éviter
  let recentQuestionsText = '';
  if (recentQuestions && recentQuestions.length > 0) {
    recentQuestionsText = `\n\n🚫 QUESTIONS RÉCENTES À ÉVITER (ne pas répéter) :\n${recentQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n`;
  }

  const prompt = `Tu es un expert en football. Génère UNE SEULE question de culture générale sur le football, en rapport avec le match entre ${matchContext.homeTeam} et ${matchContext.awayTeam}.

🔥 IMPORTANT : La question doit être DIFFÉRENTE et UNIQUE à chaque fois. Varie les sujets et évite de répéter les mêmes questions.${recentQuestionsText}

CONTEXTE DU MATCH ACTUEL :
- Équipe domicile : ${matchContext.homeTeam}
- Équipe extérieure : ${matchContext.awayTeam}
- Compétition : ${matchContext.league}
- Score actuel : ${matchContext.score}
- Minute de jeu : ${matchContext.elapsed}'
- Joueurs sur le terrain : ${playersList}

SUJETS VARIÉS À EXPLORER (choisis un sujet DIFFÉRENT à chaque fois) :
1. Histoire des clubs (fondation, dates importantes, moments marquants)
2. Joueurs légendaires (anciens joueurs, records, carrières exceptionnelles)
3. Palmarès et trophées (titres remportés, années de victoire)
4. Stades et infrastructures (capacité, histoire, événements marquants)
5. Entraîneurs emblématiques (carrières, tactiques, succès)
6. Records et statistiques (buts, victoires, séries, performances)
7. Anecdotes et faits insolites (moments historiques, événements mémorables)
8. Rivalités et derbys (historique des confrontations, moments forts)
9. Transferts marquants (joueurs clés, montants records)
10. Moments de gloire (finales, matchs historiques, exploits)

Question #${questionNumber} - Timestamp: ${timestamp} - Seed: ${randomSeed}

RÈGLES IMPORTANTES :
- La question DOIT être en lien avec le match en cours (équipes, joueurs, ou compétition)
- Difficulté : Accessible à un fan moyen de football (pas trop expert)
- Propose exactement 4 options de réponse
- Une seule option est correcte
- Ajoute une explication courte et intéressante (1-2 phrases max)
- Utilise un ton dynamique et engageant
- CRÉE UNE QUESTION NOUVELLE ET ORIGINALE - évite les questions trop génériques

FORMAT DE RÉPONSE (JSON UNIQUEMENT, RIEN D'AUTRE) :
{
  "question": "Texte de la question ici ?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": "Option B",
  "explanation": "Courte explication de 1-2 phrases"
}

IMPORTANT : Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;

  try {
    // Utiliser la route API proxy Vercel pour garder la clé API sécurisée
    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Erreur API Claude: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    let responseText = data.content[0].text;
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const questionData = JSON.parse(responseText);
    
    if (!questionData.question || !questionData.options || 
        !questionData.correctAnswer || !questionData.explanation) {
      throw new Error('Format invalide');
    }
    
    if (!Array.isArray(questionData.options) || questionData.options.length !== 4) {
      throw new Error('Il faut exactement 4 options');
    }
    
    if (!questionData.options.includes(questionData.correctAnswer)) {
      throw new Error('Réponse correcte invalide');
    }
    
    console.log('✅ Question culture générée:', questionData.question);
    return questionData;
    
  } catch (error) {
    console.error('❌ Erreur génération culture:', error);
    return {
      question: "Combien de fois la France a-t-elle remporté la Coupe du monde ?",
      options: ["1 fois", "2 fois", "3 fois", "4 fois"],
      correctAnswer: "2 fois",
      explanation: "La France a gagné en 1998 et 2018",
      isFallback: true
    };
  }
}

/**
 * 🆕 Génère une question de PRÉDICTION via Claude AI
 * Utilise la route API proxy /api/claude pour garder la clé API sécurisée
 */
export async function generatePredictionQuestion(matchContext, apiKey, recentQuestions = []) {
  const playersList = matchContext.players
    ? matchContext.players.slice(0, 20).join(', ')
    : 'Non disponible';

  // 🔥 FIX: Construire la liste des questions récentes à éviter
  let recentQuestionsText = '';
  if (recentQuestions && recentQuestions.length > 0) {
    recentQuestionsText = `\n\n🚫 QUESTIONS RÉCENTES À ÉVITER (ne pas répéter) :\n${recentQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n`;
  }

  const prompt = `Tu es un expert football qui crée des questions de PRÉDICTION pour un match en direct.${recentQuestionsText}

CONTEXTE DU MATCH EN COURS :
- Équipe domicile : ${matchContext.homeTeam}
- Équipe extérieure : ${matchContext.awayTeam}
- Compétition : ${matchContext.league}
- Score actuel : ${matchContext.score}
- Minute de jeu : ${matchContext.elapsed}'
- Joueurs sur le terrain : ${playersList}

TYPES DE PRÉDICTIONS À GÉNÉRER (choisis-en UN au hasard) :
1. "Y aura-t-il un but dans les 5 prochaines minutes ?" → Options: ["Oui", "Non"]
2. "Y aura-t-il un carton jaune dans les 10 prochaines minutes ?" → Options: ["Oui", "Non"]
3. "Y aura-t-il un corner dans les 5 prochaines minutes ?" → Options: ["Oui", "Non"]
4. "Qui va marquer le prochain but ?" → Options: ["${matchContext.homeTeam}", "${matchContext.awayTeam}", "Personne"]
5. "Y aura-t-il un penalty sifflé dans les 15 prochaines minutes ?" → Options: ["Oui", "Non"]

RÈGLES IMPORTANTES :
- Crée UNE question de prédiction basée sur les types ci-dessus
- Adapte la question au contexte du match (minute, score, équipes)
- Pour "Qui va marquer ?", utilise les VRAIS noms d'équipes du match
- Garde la question simple et claire
- PAS d'explication (ce sera validé plus tard automatiquement)

FORMAT DE RÉPONSE (JSON UNIQUEMENT, RIEN D'AUTRE) :
{
  "question": "Y aura-t-il un but dans les 5 prochaines minutes ?",
  "options": ["Oui", "Non"]
}

OU pour "prochain but":
{
  "question": "Qui va marquer le prochain but ?",
  "options": ["${matchContext.homeTeam}", "${matchContext.awayTeam}", "Personne"]
}

IMPORTANT : 
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après
- PAS de champ "correctAnswer" (validation automatique plus tard)
- PAS de champ "explanation"`;

  try {
    // Utiliser la route API proxy Vercel pour garder la clé API sécurisée
    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Erreur API Claude: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    let responseText = data.content[0].text;
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const questionData = JSON.parse(responseText);
    
    if (!questionData.question || !questionData.options) {
      throw new Error('Format invalide');
    }
    
    if (!Array.isArray(questionData.options) || questionData.options.length < 2) {
      throw new Error('Il faut au moins 2 options');
    }
    
    console.log('✅ Question prédiction générée:', questionData.question);
    return questionData;
    
  } catch (error) {
    console.error('❌ Erreur génération prédiction:', error);
    // Fallback : question prédéfinie
    return {
      question: "Y aura-t-il un but dans les 5 prochaines minutes ?",
      options: ["Oui", "Non"],
      isFallback: true
    };
  }
}

export async function checkClaudeQuota(db, ref, get, set, maxPerDay = 200) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const quotaRef = ref(db, `usage/${today}/claudeQuestions`);
    const snap = await get(quotaRef);
    const currentCount = snap.val() || 0;
    
    if (currentCount >= maxPerDay) {
      console.warn(`⚠️ Quota atteint: ${currentCount}/${maxPerDay}`);
      return false;
    }
    
    await set(quotaRef, currentCount + 1);
    console.log(`📊 Questions Claude: ${currentCount + 1}/${maxPerDay}`);
    return true;
  } catch (error) {
    console.error('❌ Erreur quota:', error);
    return true;
  }
}
