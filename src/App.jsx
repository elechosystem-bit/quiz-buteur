import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, push, update, remove } from 'firebase/database';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function App() {
  const [screen, setScreen] = useState('home');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [newPlayerNotif, setNewPlayerNotif] = useState(null);
  const prevPlayersCountRef = useRef(0);

  // Écouter les joueurs en temps réel
  useEffect(() => {
    const playersRef = ref(db, 'players');
    const unsubscribe = onValue(playersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const playersList = Object.entries(data).map(([id, player]) => ({
          id,
          ...player
        })).sort((a, b) => b.score - a.score);
        
        // Détecter nouveau joueur
        if (prevPlayersCountRef.current > 0 && playersList.length > prevPlayersCountRef.current) {
          const newPlayer = playersList[playersList.length - 1];
          setNewPlayerNotif(newPlayer.name);
          setTimeout(() => setNewPlayerNotif(null), 5000);
        }
        
        prevPlayersCountRef.current = playersList.length;
        setPlayers(playersList);
      }
    });
    return () => unsubscribe();
  }, []);

  // Écouter la question active en temps réel
  useEffect(() => {
    const questionRef = ref(db, 'currentQuestion');
    const unsubscribe = onValue(questionRef, (snapshot) => {
      const data = snapshot.val();
      setCurrentQuestion(data);
      if (data) {
        setTimeLeft(data.timeLeft || 30);
      }
    });
    return () => unsubscribe();
  }, []);

  // Timer countdown
  useEffect(() => {
    if (currentQuestion && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          const newTime = prev - 1;
          if (newTime <= 0) {
            return 0;
          }
          update(ref(db, 'currentQuestion'), { timeLeft: newTime });
          return newTime;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [currentQuestion, timeLeft]);

  // Connexion joueur
  const handleJoin = async () => {
    if (!playerName.trim()) return;
    
    const newPlayerRef = push(ref(db, 'players'));
    await set(newPlayerRef, {
      name: playerName,
      score: 0,
      joinedAt: Date.now()
    });
    
    setPlayerId(newPlayerRef.key);
    setScreen('mobile');
  };

  // Répondre à une question
  const handleAnswer = async (answer) => {
    if (!currentQuestion || playerAnswer !== null) return;
    
    setPlayerAnswer(answer);
    
    const playerAnswerRef = ref(db, `answers/${currentQuestion.id}/${playerId}`);
    await set(playerAnswerRef, {
      answer,
      timestamp: Date.now(),
      timeLeft
    });

    // Vérifier la réponse après un délai
    setTimeout(async () => {
      if (answer === currentQuestion.correctAnswer) {
        const bonusPoints = Math.floor(timeLeft / 5);
        const totalPoints = 10 + bonusPoints;
        
        const playerRef = ref(db, `players/${playerId}`);
        const player = players.find(p => p.id === playerId);
        if (player) {
          await update(playerRef, {
            score: player.score + totalPoints
          });
        }
      }
    }, 2000);
  };

  // ADMIN: Créer une nouvelle question
  const createQuestion = async () => {
    const questionId = Date.now().toString();
    const newQuestion = {
      id: questionId,
      text: "Qui va marquer le prochain but ?",
      options: ["Mbappé", "Griezmann", "Giroud", "Dembélé"],
      correctAnswer: "Mbappé",
      timeLeft: 30,
      createdAt: Date.now()
    };
    
    await set(ref(db, 'currentQuestion'), newQuestion);
    setPlayerAnswer(null);
  };

  // ADMIN: Terminer la question
  const endQuestion = async () => {
    await remove(ref(db, 'currentQuestion'));
    await remove(ref(db, 'answers'));
    setPlayerAnswer(null);
  };

  // HOME SCREEN
  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-700 to-green-900 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">⚽</div>
          <h1 className="text-6xl font-black text-white mb-4">QUIZ BUTEUR</h1>
          <p className="text-2xl text-green-200">Pronostics en temps réel</p>
        </div>
        
        <div className="flex gap-6">
          <button
            onClick={() => setScreen('mobile')}
            className="bg-white text-green-900 px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-100 transition-all shadow-2xl"
          >
            📱 JOUER
          </button>
          
          <button
            onClick={() => setScreen('tv')}
            className="bg-green-800 text-white px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-700 transition-all shadow-2xl border-4 border-white"
          >
            📺 ÉCRAN BAR
          </button>
        </div>

        <div className="mt-12">
          <button
            onClick={() => setScreen('admin')}
            className="text-white opacity-50 hover:opacity-100 text-sm"
          >
            Admin
          </button>
        </div>
      </div>
    );
  }

  // MOBILE SCREEN
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
              placeholder="Ton prénom..."
              className="w-full px-6 py-4 text-xl border-4 border-green-900 rounded-xl mb-6 focus:outline-none focus:border-green-600"
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              onClick={handleJoin}
              className="w-full bg-green-900 text-white py-4 rounded-xl text-xl font-bold hover:bg-green-800 transition-all"
            >
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
                  <div 
                    className="h-full bg-green-600 transition-all duration-1000"
                    style={{ width: `${(timeLeft / 30) * 100}%` }}
                  />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                {currentQuestion.text}
              </h3>

              <div className="space-y-3">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = playerAnswer === option;
                  const isCorrect = option === currentQuestion.correctAnswer;
                  const showResult = playerAnswer !== null && timeLeft === 0;

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(option)}
                      disabled={playerAnswer !== null}
                      className={`w-full py-4 px-6 rounded-xl text-lg font-bold transition-all ${
                        isSelected
                          ? showResult
                            ? isCorrect
                              ? 'bg-green-600 text-white'
                              : 'bg-red-600 text-white'
                            : 'bg-blue-600 text-white'
                          : showResult && isCorrect
                          ? 'bg-green-200 text-green-900'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}
                    >
                      {option}
                      {isSelected && !showResult && ' ⏳'}
                      {showResult && isCorrect && ' ✅'}
                      {showResult && isSelected && !isCorrect && ' ❌'}
                    </button>
                  );
                })}
              </div>

              {playerAnswer && (
                <div className="mt-6 text-center">
                  {timeLeft > 0 ? (
                    <p className="text-blue-600 font-semibold">Réponse enregistrée ⏳</p>
                  ) : playerAnswer === currentQuestion.correctAnswer ? (
                    <p className="text-green-600 text-xl font-bold">Bien joué ! +{10 + Math.floor(timeLeft / 5)} pts 🎉</p>
                  ) : (
                    <p className="text-red-600 text-xl font-bold">Raté ! La bonne réponse était {currentQuestion.correctAnswer} 😢</p>
                  )}
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

  // TV SCREEN
  if (screen === 'tv') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 p-8 relative">
        {newPlayerNotif && (
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div className="bg-green-500 text-white px-20 py-12 rounded-3xl text-6xl font-black shadow-2xl animate-bounce border-8 border-white">
              🎉 {newPlayerNotif} a rejoint la partie !
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-5xl font-black text-white mb-2">🏆 CLASSEMENT LIVE</h1>
            <p className="text-2xl text-green-300">Le Penalty - Paris 11e</p>
          </div>
          <div className="bg-white p-6 rounded-2xl">
            <img 
              src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://quiz-buteur.vercel.app"
              alt="QR Code"
              className="w-48 h-48"
            />
            <p className="text-center mt-3 font-bold text-green-900">Scanne pour jouer !</p>
          </div>
        </div>

        <div className="bg-white/95 rounded-3xl p-6 shadow-2xl">
          <div className="grid grid-cols-12 gap-3 text-xs font-bold text-gray-600 mb-3 px-3">
            <div className="col-span-1">#</div>
            <div className="col-span-7">JOUEUR</div>
            <div className="col-span-4 text-right">SCORE</div>
          </div>

          <div className="space-y-1">
            {players.slice(0, 50).map((player, idx) => (
              <div
                key={player.id}
                className={`grid grid-cols-12 gap-3 items-center py-2 px-3 rounded-lg transition-all ${
                  idx === 0
                    ? 'bg-yellow-400 text-gray-900 font-black text-lg'
                    : idx === 1
                    ? 'bg-gray-300 text-gray-900 font-bold text-base'
                    : idx === 2
                    ? 'bg-orange-300 text-gray-900 font-bold text-base'
                    : 'bg-gray-50 hover:bg-gray-100 text-sm'
                }`}
              >
                <div className="col-span-1 font-bold">
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </div>
                <div className="col-span-7 font-bold truncate">
                  {player.name}
                </div>
                <div className="col-span-4 text-right font-black">
                  {player.score} pts
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ADMIN SCREEN
  if (screen === 'admin') {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">🎮 Admin Panel</h1>
          
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Question actuelle</h2>
            {currentQuestion ? (
              <div>
                <p className="text-xl mb-4">{currentQuestion.text}</p>
                <p className="text-green-400 mb-4">Temps restant: {timeLeft}s</p>
                <button
                  onClick={endQuestion}
                  className="bg-red-600 px-6 py-3 rounded-lg font-bold hover:bg-red-700"
                >
                  Terminer la question
                </button>
              </div>
            ) : (
              <div>
                <p className="text-gray-400 mb-4">Aucune question active</p>
                <button
                  onClick={createQuestion}
                  className="bg-green-600 px-6 py-3 rounded-lg font-bold hover:bg-green-700"
                >
                  Créer une question
                </button>
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4">Joueurs connectés ({players.length})</h2>
            <div className="space-y-2">
              {players.map(player => (
                <div key={player.id} className="flex justify-between items-center bg-gray-700 p-3 rounded">
                  <span className="font-semibold">{player.name}</span>
                  <span className="text-green-400">{player.score} pts</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setScreen('home')}
            className="mt-6 bg-gray-700 px-6 py-3 rounded-lg hover:bg-gray-600"
          >
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  return null;
}
