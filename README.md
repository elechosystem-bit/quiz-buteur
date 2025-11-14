# 🎮 Système de Questions Quiz Buteur - Guide d'Intégration

## 📋 Vue d'ensemble

Ce système implémente **3 types de validation** pour le quiz :

### 1. ✅ Validation INSTANTANÉE (Culture générale)
- Réponse validée immédiatement
- Résultat + points instantanés

### 2. 💥 Validation IMMÉDIATE sur événement (Prédiction "OUI")
- Se déclenche dès que l'événement arrive
- Exemple : “Y aura-t-il un carton jaune ?” → “Oui” → validation dès le carton
- Si délai expiré sans event → perdue

### 3. ⏳ Validation DIFFÉRÉE (Prédiction "NON")
- Attente du délai complet
- Exemple : “Penalty ?” → “Non” → si pas de penalty durant la fenêtre → gagnée

## 📁 Fichiers fournis
- `cultureQuestions.js` – Questions culture PSG/OM
- `predictionQuestions.js` – Templates de prédiction
- `answerValidator.js` – Validation (3 modes)
- `questionManager.js` – Génération/scheduler
- `QuestionCard.jsx` + `.css` – UI question
- `QuestionsContainer.jsx` + `.css` – Liste questions
- `SimulationMatchSetup.jsx` + `.css` – Création match de test

## 🚀 Installation
1. Copier les fichiers dans `src/components` et `src/utils` (voir structure listée).
2. Installer Firebase : `npm install firebase`
3. S’assurer que Firebase RTDB suit la structure décrite (matches/{matchId}/...).

## 💻 Utilisation
### Mode 1 – App réelle
```jsx
<QuestionsContainer matchId={matchId} userId={userId} />
```
### Mode 2 – Simulation
```jsx
<SimulationMatchSetup onMatchCreated={setMatchId} />
{matchId && <QuestionsContainer matchId={matchId} userId="test_user" />}
```
### Mode 3 – Match réel (API)
```js
const questions = generateMatchQuestions(apiMatchId, 90);
await initializeMatchQuestions(apiMatchId, questions);
```

## 🔧 Configuration
### Ajuster le nombre de questions (questionManager.js)
- `getRandomCultureQuestions(15)` → changer 15
- Boucle `for (let minute = 5; minute < matchDuration; minute += getRandomInterval(3,5))`
- Ratio culture/prédiction : `Math.random() < 0.4`

### Ajouter des questions culture
Ajouter dans `CULTURE_QUESTIONS_PSG_OM` (id unique, options, bonne réponse, etc.).

### Personnaliser les prédictions
Ajouter des templates dans `PREDICTION_QUESTIONS_TEMPLATES` (eventType, fenêtre, difficulty).

## 🎯 Fonctionnalités clés
- `answerValidator.js` gère tout (validation, écoute events, scores).
- Stats via `getQuestionStats(matchId, questionId)`.
- Nettoyage via `cleanupAllListeners()` ou `cleanupPlayerListeners(userId)`.

## 🔍 Débogage
- `console.log` déjà présents (soumission, validation, événements).
- Vérifier Firebase (`matches/{matchId}/players/...`, `events`, `questions`).

## ⚠️ Points importants
1. Adapter `findMatchingEvent` selon votre API (type, timestamps).
2. Timer : mettre à jour `matches/{matchId}/timer/elapsed` chaque minute.
3. Ajouter règles RTDB (écriture limitée au joueur pour ses réponses).

## 📚 Scénarios
- Flux culture → réponse, validation instantanée, score.
- Flux “Oui” → écoute event, validation dès qu’il se produit.
- Flux “Non” → attente, validation après fenêtre.

## 🐛 Résolution
- Pas de validation → vérifier `matches/{matchId}/events` + mapping types.
- Pas de questions → s’assurer qu’elles sont `status: "active"` et timer actif.
- Score immobile → vérifier `updatePlayerScore` + règles Firebase.

## 🎨 CSS
Personnaliser via `QuestionCard.css`, `QuestionsContainer.css`, `SimulationMatchSetup.css`.

## ✅ Checklist
- [ ] Fichiers copiés
- [ ] Firebase prêt
- [ ] Simulation testée
- [ ] Questions culture/prédiction OK
- [ ] Validations “Oui/Non” et scores OK
- [ ] Responsive

## 🔄 Passer à l’API live
1. Retirer `createSimulationMatch` si inutile.
2. Aligner vos événements API sur le format `matches/{matchId}/events` (type/detail/time/timestamp).
3. Appeler `generateMatchQuestions` + `initializeMatchQuestions` au démarrage d’un match réel.
4. Laisser `startQuestionScheduler` et `answerValidator` gérer le reste.

Bon match ! ⚽🎮
