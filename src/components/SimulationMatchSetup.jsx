import React, { useState } from 'react';
import { ref, update, get } from 'firebase/database';
import { db } from '../firebase';
import { createSimulationMatch } from '../questionManager';
import './SimulationMatchSetup.css';

const SimulationMatchSetup = ({ onMatchCreated }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [matchId, setMatchId] = useState(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [activationMessage, setActivationMessage] = useState('');

  const handleCreateMatch = async () => {
    setIsCreating(true);
    try {
      const newMatchId = await createSimulationMatch();
      setMatchId(newMatchId);

      if (onMatchCreated) {
        onMatchCreated(newMatchId);
      }

      alert(`Match de simulation créé : ${newMatchId}`);
    } catch (error) {
      console.error('Erreur lors de la création du match:', error);
      alert('Erreur lors de la création du match');
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartTimer = async () => {
    if (!matchId) return;

    const timerRef = ref(db, `matches/${matchId}/timer`);
    await update(timerRef, {
      running: true,
      startedAt: Date.now()
    });

    setTimerRunning(true);

    const interval = setInterval(async () => {
      const snapshot = await get(ref(db, `matches/${matchId}/timer`));
      const timerData = snapshot.val();

      if (!timerData?.running) {
        clearInterval(interval);
        return;
      }

      const newElapsed = (timerData.elapsed || 0) + 1;

      await update(timerRef, {
        elapsed: newElapsed
      });

      if (newElapsed >= 90) {
        await update(timerRef, {
          running: false
        });
        clearInterval(interval);
        setTimerRunning(false);
      }
    }, 60000);
  };

  const handleStopTimer = async () => {
    if (!matchId) return;

    const timerRef = ref(db, `matches/${matchId}/timer`);
    await update(timerRef, {
      running: false
    });

    setTimerRunning(false);
  };

  const handleFastForward = async (minutes) => {
    if (!matchId) return;

    const timerRef = ref(db, `matches/${matchId}/timer`);
    const snapshot = await get(timerRef);
    const currentElapsed = snapshot.val()?.elapsed || 0;

    await update(timerRef, {
      elapsed: Math.min(90, currentElapsed + minutes)
    });
  };

  const handleActivateAllQuestions = async () => {
    if (!matchId) return;
    try {
      const questionsRef = ref(db, `matches/${matchId}/questions`);
      const snapshot = await get(questionsRef);
      if (!snapshot.exists()) {
        alert('Aucune question à activer.');
        return;
      }

      const questionsData = snapshot.val();
      const updates = {};
      Object.keys(questionsData).forEach((questionKey) => {
        updates[`${questionKey}/status`] = 'active';
      });
      await update(questionsRef, updates);
      setActivationMessage('Questions activées !');
    } catch (error) {
      console.error('Erreur lors de l’activation des questions :', error);
      alert('Impossible d’activer les questions.');
    }
  };

  return (
    <div className="simulation-setup">
      <div className="setup-header">
        <h2>🎮 Mode Simulation</h2>
        <p>Créez un match de test PSG vs Marseille</p>
      </div>

      {!matchId ? (
        <button
          className="create-match-btn"
          onClick={handleCreateMatch}
          disabled={isCreating}
        >
          {isCreating ? 'Création...' : '⚽ Créer un match de simulation'}
        </button>
      ) : (
        <div className="match-controls">
          <div className="match-info">
            <div className="info-item">
              <span className="label">Match ID:</span>
              <span className="value">{matchId}</span>
            </div>
            <div className="info-item">
              <span className="label">Statut:</span>
              <span className={`status ${timerRunning ? 'live' : 'paused'}`}>
                {timerRunning ? '🔴 En direct' : '⏸️ En pause'}
              </span>
            </div>
          </div>

          <div className="timer-controls">
            <h3>⏱️ Contrôle du timer</h3>
            <div className="controls-grid">
              {!timerRunning ? (
                <button
                  className="control-btn start"
                  onClick={handleStartTimer}
                  disabled={!matchId}
                >
                  ▶️ Démarrer
                </button>
              ) : (
                <button
                  className="control-btn stop"
                  onClick={handleStopTimer}
                >
                  ⏸️ Pause
                </button>
              )}

              <button
                className="control-btn fast"
                onClick={() => handleFastForward(5)}
                disabled={!timerRunning}
              >
                ⏩ +5 min
              </button>

              <button
                className="control-btn fast"
                onClick={() => handleFastForward(10)}
                disabled={!timerRunning}
              >
                ⏩ +10 min
              </button>

              <button
                className="control-btn fast"
                onClick={() => handleFastForward(15)}
                disabled={!timerRunning}
              >
                ⏩ +15 min
              </button>

              <button
                className="control-btn activate"
                onClick={handleActivateAllQuestions}
                disabled={!matchId}
              >
                🔥 Activer toutes les questions
              </button>
            </div>
            {activationMessage && (
              <p className="activation-message">{activationMessage}</p>
            )}
          </div>

          <div className="simulation-info">
            <h3>ℹ️ Informations</h3>
            <ul>
              <li>✅ Questions de culture générale validées instantanément</li>
              <li>💥 Prédictions "OUI" validées dès que l'événement arrive</li>
              <li>⏳ Prédictions "NON" validées après le délai complet</li>
              <li>🎲 Événements simulés pré-programmés dans le match</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationMatchSetup;

