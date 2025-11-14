/**

 * Génération de questions culture foot avec Claude AI

 */


export async function generateCultureQuestion(matchContext, apiKey) {

  const playersList = matchContext.players

    ? matchContext.players.slice(0, 20).join(', ')

    : 'Non disponible';



  const prompt = `Tu es un expert football qui crée des questions de quiz pendant un match en direct.



CONTEXTE DU MATCH EN COURS :

- Équipe domicile : ${matchContext.homeTeam}

- Équipe extérieure : ${matchContext.awayTeam}

- Compétition : ${matchContext.league}

- Score actuel : ${matchContext.score}

- Minute de jeu : ${matchContext.elapsed}'

- Joueurs sur le terrain : ${playersList}



TYPES DE QUESTIONS À GÉNÉRER (choisis-en UN au hasard) :

1. Questions sur les joueurs présents dans ce match (carrière, records, transferts)

2. Questions sur l'histoire des deux clubs qui s'affrontent

3. Questions sur des records ou statistiques de la compétition

4. Questions d'actualité football récente (derniers mois)

5. Questions sur des confrontations historiques entre ces deux équipes



RÈGLES IMPORTANTES :

- La question DOIT être en lien avec le match en cours (équipes, joueurs, ou compétition)

- Difficulté : Accessible à un fan moyen de football (pas trop expert)

- Propose exactement 4 options de réponse

- Une seule option est correcte

- Ajoute une explication courte et intéressante (1-2 phrases max)

- Utilise un ton dynamique et engageant



FORMAT DE RÉPONSE (JSON UNIQUEMENT, RIEN D'AUTRE) :

{

  "question": "Texte de la question ici ?",

  "options": ["Option A", "Option B", "Option C", "Option D"],

  "correctAnswer": "Option B",

  "explanation": "Courte explication de 1-2 phrases"

}



IMPORTANT : Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;



  try {

    const response = await fetch('https://api.anthropic.com/v1/messages', {

      method: 'POST',

      headers: {

        'Content-Type': 'application/json',

        'x-api-key': apiKey,

        'anthropic-version': '2023-06-01'

      },

      body: JSON.stringify({

        model: 'claude-sonnet-4-20250514',

        max_tokens: 1024,

        messages: [{ role: 'user', content: prompt }]

      })

    });



    if (!response.ok) {

      throw new Error(`Erreur API Claude: ${response.status}`);

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
    

    console.log('✅ Question générée:', questionData.question);

    return questionData;
    

  } catch (error) {

    console.error('❌ Erreur génération:', error);

    return {

      question: "Combien de fois la France a-t-elle remporté la Coupe du monde ?",

      options: ["1 fois", "2 fois", "3 fois", "4 fois"],

      correctAnswer: "2 fois",

      explanation: "La France a gagné en 1998 et 2018",

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

