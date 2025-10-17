import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, push, update, remove, get } from 'firebase/database';

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyATw6VYnsTtPQnJXtHJWvx8FxC6__q3ulk",
  authDomain: "quiz-buteur.firebaseapp.com",
  databaseURL: "https://quiz-buteur-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quiz-buteur",
  storageBucket: "quiz-buteur.firebasestorage.app",
  messagingSenderId: "963474612609",
  appId: "1:963474612609:web:ffc84fb130b9f561c74880",
  measurementId: "G-VMTQN2RT3C"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Banque de questions variées
const QUESTION_BANK = [
  { text: "Qui va marquer le prochain but ?", options: ["Mbappé", "Griezmann", "Giroud", "Dembélé"] },
  { text: "Qui va marquer le prochain but ?", options: ["Benzema", "Neymar", "Messi", "Lewandowski"] },
  { text: "Qui va marquer le prochain but ?", options: ["Haaland", "Salah", "Kane", "De Bruyne"] },
  { text: "Qui va marquer le prochain but ?", options: ["Ronaldo", "Vinicius", "Rodrygo", "Bellingham"] },
  { text: "Quelle équipe aura le prochain corner ?", options: ["Équipe A", "Équipe B", "Aucune", "Les deux"] },
  { text: "Qui va avoir le prochain carton jaune ?", options: ["Défenseur", "Milieu", "Attaquant", "Personne"] },
  { text: "Combien de buts dans les 10 prochaines minutes ?", options: ["0", "1", "2", "3+"] },
  { text: "Y aura-t-il un penalty ?", options: ["Oui", "Non", "Peut-être", "VAR"] },
  { text: "Qui va faire la prochaine passe décisive ?", options: ["Milieu A", "Ailier B", "Défenseur", "Attaquant"] },
  { text: "Quelle équipe dominera les 10 prochaines minutes ?", options: ["Domicile", "Extérieur", "Égalité", "Incertain"] }
];

// Générer plus de questions
const FULL_QUESTION_BANK = [];
for (let i = 0; i < 20; i++) {
  QUESTION_BANK.forEach(q => FULL_QUESTION_BANK.push({...q}));
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [newPlayerNotif, setNewPlayerNotif] = useState(null);
  const [matchState, setMatchState] = useState(null);
  const [goalNotif, setGoalNotif] = useState(null);
  const [answers, setAnswers] = useState({});
  const [flashingPlayers, setFlashingPlayers] = useState([]);

  // Écouter les joueurs
  useEffect(() => {
    const playersRef = ref(db, 'players');
    let previousScores = {};
    
    const unsubscribe = onValue(playersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const playersList = Object.entries(data).map(([id, player]) => ({
          id,
          ...player
        }));
        
        // Détecter changements de score
        const newFlashing = [];
        playersList.forEach(player => {
          if (previousScores[player.id] && previousScores[player.id] < player.score) {
            newFlashing.push(player.id);
          }
          previousScores[player.id] = player.score;
        });
        
        if (newFlashing.length > 0) {
          setFlashingPlayers(newFlashing);
          setTimeout(() => setFlashingPlayers([]), 3000);
        }
        
        setPlayers([...playersList].sort((a, b) => b.score - a.score));
      } else {
        setPlayers([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Écouter le match
  useEffect(() => {
    const matchRef = ref(db, 'matchState');
    const unsubscribe = onValue(matchRef, (snapshot) => {
      setMatchState(snapshot.val());
    });
    return () => unsubscribe();
  }, []);

  // Écouter la question
  useEffect(() => {
    const questionRef = ref(db, 'currentQuestion');
    const unsubscribe = onValue(questionRef, (snapshot) => {
      const data = snapshot.val();
      setCurrentQuestion(data);
      if (data) {
        setTimeLeft(data.timeLeft || 30);
      } else {
        setPlayerAnswer(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Écouter les réponses
  useEffect(() => {
    if (currentQuestion) {
      const answersRef = ref(db, `answers/${currentQuestion.id}`);
      const unsubscribe = onValue(answersRef, (snapshot) => {
        const data = snapshot.val();
        const answerCount = {};
        if (data) {
          Object.values(data).forEach(answer => {
            answerCount[answer.answer] = (answerCount[answer.answer] || 0) + 1;
          });
        }
        setAnswers(answerCount);
      });
      return () => unsubscribe();
    } else {
      setAnswers({});
    }
  }, [currentQuestion]);

  // Timer
  useEffect(() => {
    if (currentQuestion && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          const newTime = prev - 1;
          if (newTime <= 0) return 0;
          update(ref(db, 'currentQuestion'), { timeLeft: newTime }).catch(() => {});
          return newTime;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [currentQuestion, timeLeft]);

  const handleJoin = async () => {
    if (!playerName.trim()) return;
    try {
      const newPlayerRef = push(ref(db, 'players'));
      await set(newPlayerRef, {
        name: playerName,
        score: 0,
        joinedAt: Date.now()
      });
      setPlayerId(newPlayerRef.key);
      setScreen('mobile');
    } catch (error) {
      console.error('Error joining:', error);
    }
  };

  const handleAnswer = async (answer) => {
    if (!currentQuestion || playerAnswer !== null || !playerId) return;
    try {
      setPlayerAnswer(answer);
      const playerAnswerRef = ref(db, `answers/${currentQuestion.id}/${playerId}`);
      await set(playerAnswerRef, {
        answer,
        timestamp: Date.now(),
        timeLeft
      });
    } catch (error) {
      console.error('Error answering:', error);
    }
  };

  const startMatch = async () => {
    try {
      await set(ref(db, 'matchState'), {
        isActive: true,
        startTime: Date.now()
      });
      // Première question immédiatement
      setTimeout(() => createQuestion(), 2000);
    } catch (error) {
      console.error('Error starting match:', error);
    }
  };

  const createQuestion = async () => {
    try {
      const matchSnapshot = await get(ref(db, 'matchState'));
      if (!matchSnapshot.exists() || !matchSnapshot.val()?.isActive) return;

      const randomQuestion = FULL_QUESTION_BANK[Math.floor(Math.random() * FULL_QUESTION_BANK.length)];
      const questionId = Date.now().toString();
      
      await set(ref(db, 'currentQuestion'), {
        id: questionId,
        text: randomQuestion.text,
        options: randomQuestion.options,
        timeLeft: 30,
        createdAt: Date.now()
      });
    } catch (error) {
      console.error('Error creating question:', error);
    }
  };

  const validateGoal = async (scorer) => {
    if (!currentQuestion) return;
    try {
      setGoalNotif(`⚽ ${scorer} a marqué !`);
      setTimeout(() => setGoalNotif(null), 5000);

      const answersSnapshot = await get(ref(db, `answers/${currentQuestion.id}`));
      
      if (answersSnapshot.exists()) {
        const answersData = answersSnapshot.val();
        for (const [pId, answerData] of Object.entries(answersData)) {
          if (answerData.answer === scorer) {
            const bonusPoints = Math.floor((answerData.timeLeft || 0) / 5);
            const totalPoints = 10 + bonusPoints;
            
            const playerSnapshot = await get(ref(db, `players/${pId}`));
            if (playerSnapshot.exists()) {
              const player = playerSnapshot.val();
              await update(ref(db, `players/${pId}`), {
                score: (player.score || 0) + totalPoints
              });
            }
          }
        }
      }

      await remove(ref(db, 'currentQuestion'));
      await remove(ref(db, 'answers'));
      setPlayerAnswer(null);

      const matchSnapshot = await get(ref(db, 'matchState'));
      if (matchSnapshot.exists() && matchSnapshot.val()?.isActive) {
        setTimeout(() => createQuestion(), 30000);
      }
    } catch (error) {
      console.error('Error validating goal:', error);
    }
  };

  const endMatch = async () => {
    try {
      await remove(ref(db, 'matchState'));
      await remove(ref(db, 'currentQuestion'));
      await remove(ref(db, 'answers'));
    } catch (error) {
      console.error('Error ending match:', error);
    }
  };

  const getMatchTime = () => {
    if (!matchState?.startTime) return "0'";
    const elapsed = Date.now() - matchState.startTime;
    const matchMinutes = Math.floor(elapsed / 6000);
    return matchMinutes >= 90 ? "90'" : `${matchMinutes}'`;
  };

  const getMatchPhase = () => {
    if (!matchState?.startTime) return "En attente";
    const elapsed = Date.now() - matchState.startTime;
    const matchMinutes = Math.floor(elapsed / 6000);
    if (matchMinutes >= 90) return "Fin";
    if (matchMinutes >= 45) return "2nde MT";
    return "1ère MT";
  };

  const MatchClock = () => {
    const [rotation, setRotation] = useState(0);
    
    useEffect(() => {
      if (matchState?.startTime) {
        const interval = setInterval(() => {
          const elapsed = Date.now() - matchState.startTime;
          const matchMinutes = Math.floor(elapsed / 6000);
          setRotation((matchMinutes / 90) * 360);
        }, 1000);
        return () => clearInterval(interval);
      }
    }, []);

    return (
      <div className="relative">
        <div className="w-48 h-48 rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 shadow-2xl flex items-center justify-center border-8 border-white">
          <div className="absolute w-44 h-44 rounded-full bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl font-black text-yellow-400">{getMatchTime()}</div>
              <div className="text-xs text-yellow-300 font-bold mt-1">{getMatchPhase()}</div>
            </div>
            <div 
              className="absolute w-1 h-16 bg-yellow-400 origin-bottom"
              style={{ 
                transform: `rotate(${rotation}deg) translateY(-50%)`,
                bottom: '50%',
                left: 'calc(50% - 0.5px)',
                transition: 'transform 1s linear'
              }}
            />
          </div>
        </div>
        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black px-3 py-1 rounded-full text-xs font-black">
          ROLEX
        </div>
      </div>
    );
  };

  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-700 to-green-900 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">⚽</div>
          <h1 className="text-6xl font-black text-white mb-4">QUIZ BUTEUR</h1>
          <p className="text-2xl text-green-200">Pronostics en temps réel</p>
        </div>
        <div className="flex gap-6">
          <button onClick={() => setScreen('mobile')} className="bg-white text-green-900 px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-100 transition-all shadow-2xl">
            📱 JOUER
          </button>
          <button onClick={() => setScreen('tv')} className="bg-green-800 text-white px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-700 transition-all shadow-2xl border-4 border-white">
            📺 ÉCRAN BAR
          </button>
        </div>
        <div className="mt-12">
          <button onClick={() => setScreen('admin')} className="text-white opacity-50 hover:opacity-100 text-sm">
            Admin
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'mobile') {
    if (!playerId) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-3xl font-bold text-green-900 mb-6 text-center">Entre ton prénom</h2>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="ZYNGA"
              className="w-full px-6 py-4 text-xl border-4 border-green-900 rounded-xl mb-6 focus:outline-none focus:border-green-600"
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button onClick={handleJoin} className="w-full bg-green-900 text-white py-4 rounded-xl text-xl font-bold hover:bg-green-800 transition-all">
              JOUER ! ⚽
            </button>
          </div>
        </div>
      );
    }

    const myScore = players.find(p => p.id === playerId)?.score || 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 p-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl p-6 mb-6 text-center">
            <div className="text-green-700 text-lg font-semibold">{playerName}</div>
            <div className="text-4xl font-black text-green-900">{myScore} pts</div>
          </div>

          {currentQuestion ? (
            <div className="bg-white rounded-3xl p-8 shadow-2xl">
              <div className="text-center mb-6">
                <div className="text-6xl font-black text-green-900 mb-2">{timeLeft}s</div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-600 transition-all duration-1000" style={{ width: `${(timeLeft / 30) * 100}%` }} />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">{currentQuestion.text}</h3>

              <div className="space-y-3">
                {currentQuestion.options.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(option)}
                    disabled={playerAnswer !== null}
                    className={`w-full py-4 px-6 rounded-xl text-lg font-bold transition-all ${
                      playerAnswer === option ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    {option} {playerAnswer === option && ' ⏳'}
                  </button>
                ))}
              </div>

              {playerAnswer && (
                <div className="mt-6 text-center">
                  <p className="text-blue-600 font-semibold">Réponse enregistrée ⏳</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-12 text-center shadow-2xl">
              <div className="text-6xl mb-4">⏳</div>
              <p className="text-2xl text-gray-600 font-semibold">En attente de la prochaine question...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'tv') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 p-8 relative">
        {newPlayerNotif && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white px-24 py-16 rounded-3xl shadow-2xl border-8 border-white animate-pulse">
              <div className="text-7xl font-black text-center mb-4">🎉</div>
              <div className="text-6xl font-black text-center">{newPlayerNotif}</div>
              <div className="text-4xl font-bold text-center mt-4">a rejoint la partie !</div>
            </div>
          </div>
        )}

        {goalNotif && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-24 py-16 rounded-3xl shadow-2xl border-8 border-white animate-bounce">
              <div className="text-8xl font-black text-center">{goalNotif}</div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-5xl font-black text-white mb-2">🏆 CLASSEMENT LIVE</h1>
            <p className="text-2xl text-green-300">Le Penalty - Paris 11e</p>
          </div>
          <div className="flex gap-6">
            {matchState?.isActive && <MatchClock />}
            <div className="bg-white p-6 rounded-2xl">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://quiz-buteur.vercel.app" alt="QR" className="w-48 h-48" />
              <p className="text-center mt-3 font-bold text-green-900">Scanne pour jouer !</p>
            </div>
          </div>
        </div>

        {currentQuestion && (
          <div className="bg-yellow-400 rounded-2xl p-6 mb-6">
            <h3 className="text-3xl font-black text-gray-900 mb-4 text-center">📊 VOTES EN TEMPS RÉEL</h3>
            <div className="grid grid-cols-4 gap-4">
              {currentQuestion.options.map(option => (
                <div key={option} className="bg-white rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">{option}</div>
                  <div className="text-4xl font-black text-green-600">{answers[option] || 0}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white/95 rounded-3xl p-6 shadow-2xl">
          <div className="grid grid-cols-12 gap-3 text-xs font-bold text-gray-600 mb-3 px-3">
            <div className="col-span-1">#</div>
            <div className="col-span-7">JOUEUR</div>
            <div className="col-span-4 text-right">SCORE</div>
          </div>

          <div className="space-y-1">
            {players.slice(0, 16).map((player, idx) => (
              <div
                key={player.id}
                className={`grid grid-cols-12 gap-3 items-center py-3 px-3 rounded-lg transition-all duration-1000 ${
                  flashingPlayers.includes(player.id)
                    ? 'animate-pulse bg-green-400 scale-105'
                    : idx === 0 ? 'bg-yellow-400 text-gray-900 font-black text-2xl'
                    : idx === 1 ? 'bg-gray-300 text-gray-900 font-bold text-xl'
                    : idx === 2 ? 'bg-orange-300 text-gray-900 font-bold text-xl'
                    : 'bg-gray-50 hover:bg-gray-100 text-lg'
                }`}
              >
                <div className="col-span-1 font-bold">
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </div>
                <div className="col-span-7 font-bold truncate">{player.name}</div>
                <div className="col-span-4 text-right font-black">{player.score} pts</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'admin') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">🎮 Admin Panel</h1>
          
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Match</h2>
            {matchState?.isActive ? (
              <div>
                <p className="text-3xl text-yellow-400 font-bold mb-4">⏱️ {getMatchTime()} - {getMatchPhase()}</p>
                <button onClick={endMatch} className="bg-red-600 px-6 py-3 rounded-lg font-bold hover:bg-red-700">
                  Terminer le match
                </button>
              </div>
            ) : (
              <button onClick={startMatch} className="bg-green-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-green-700">
                🚀 Démarrer le match
              </button>
            )}
          </div>

          {currentQuestion && (
            <div className="bg-gray-800 rounded-xl p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4">Question actuelle</h2>
              <p className="text-xl mb-4">{currentQuestion.text}</p>
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-2">Votes :</h3>
                {currentQuestion.options.map(option => (
                  <div key={option} className="text-white mb-2">{option}: {answers[option] || 0}</div>
                ))}
              </div>
              <h3 className="text-xl font-bold mb-4">🎯 Qui a marqué / gagné ?</h3>
              <div className="grid grid-cols-2 gap-3">
                {currentQuestion.options.map(player => (
                  <button key={player} onClick={() => validateGoal(player)} className="bg-yellow-500 text-gray-900 px-6 py-3 rounded-lg font-bold hover:bg-yellow-400">
                    ⚽ {player}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <button onClick={createQuestion} className="bg-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-blue-700">
              Créer question manuelle
            </button>
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4">Joueurs ({players.length})</h2>
            <div className="space-y-2">
              {players.map(player => (
                <div key={player.id} className="flex justify-between bg-gray-700 p-3 rounded">
                  <span>{player.name}</span>
                  <span className="text-green-400">{player.score} pts</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => setScreen('home')} className="mt-6 bg-gray-700 px-6 py-3 rounded-lg hover:bg-gray-600">
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  return null;
}
