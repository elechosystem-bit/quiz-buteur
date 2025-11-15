import React, { useState } from 'react';
import SimulationMatchSetup from './components/SimulationMatchSetup';
import QuestionsContainer from './components/QuestionsContainer';

const TestSimulation = () => {
  const [matchId, setMatchId] = useState(null);
  const userId = 'test_user_123';

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <SimulationMatchSetup onMatchCreated={setMatchId} />

        {matchId ? (
          <QuestionsContainer matchId={matchId} userId={userId} />
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center shadow">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Aucune simulation active
            </h2>
            <p className="text-gray-500">
              Créez un match de simulation pour commencer à tester le quiz.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestSimulation;

