import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, push, update, remove, get } from 'firebase/database';

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

const QUESTIONS = [
  { text: "Qui va marquer le prochain but ?", options: ["Mbappé", "Griezmann", "Giroud", "Dembélé"] },
  { text: "Qui va marquer le prochain but ?", options: ["Benzema", "Neymar", "Messi", "Lewandowski"] },
  { text: "Qui va marquer le prochain but ?", options: ["Haaland", "Salah", "Kane", "De Bruyne"] },
  { text: "Qui va marquer le prochain but ?", options: ["Ronaldo", "Vinicius", "Rodrygo", "Bellingham"] },
  { text: "Qui va marquer le prochain but ?", options: ["Osimhen", "Kvaratskhelia", "Lautaro", "Rashford"] },
  { text: "Qui va marquer le prochain but ?", options: ["Saka", "Foden", "Palmer", "Watkins"] },
  { text: "Qui va marquer le prochain but ?", options: ["Aubameyang", "Thuram", "David", "Barcola"] },
  { text: "Quelle équipe aura le prochain corner ?", options: ["Domicile", "Extérieur", "Aucune", "Les deux"] },
  { text: "Qui va avoir le prochain carton jaune ?", options: ["Défenseur", "Milieu", "Attaquant", "Personne"] },
  { text: "Y aura-t-il un penalty ?", options: ["Oui", "Non", "Peut-être", "VAR"] },
  { text: "Combien de buts dans les 10 prochaines minutes ?", options: ["0", "1", "2", "3+"] },
  { text: "Qui va faire la prochaine passe décisive ?", options: ["Milieu offensif", "Ailier", "Défenseur", "Attaquant"] },
  { text: "Quelle équipe dominera les 10 prochaines minutes ?", options: ["Domicile", "Extérieur", "Égalité", "Incertain"] },
  { text: "Y aura-t-il un carton rouge ?", options: ["Oui", "Non", "Deux cartons", "VAR annule"] },
  { text: "Qui va gagner le plus de duels ?", options: ["Attaquant A", "Milieu B", "Défenseur C", "Gardien"] },
  { text: "Combien de temps additionnel en 1ère mi-temps ?", options: ["0-1 min", "2-3 min", "4-5 min", "6+ min"] },
  { text: "Qui va faire le prochain arrêt décisif ?", options: ["Gardien domicile", "Gardien extérieur", "Défenseur", "Poteau"] },
  { text: "Quelle sera la prochaine action ?", options: ["Corner", "Coup franc", "Penalty", "But"] },
  { text: "Qui va sortir sur blessure en premier ?", options: ["Personne", "Attaquant", "Défenseur", "Milieu"] },
  { text: "Combien de fautes au total dans les 10 prochaines minutes ?", options: ["0-3", "4-6", "7-9", "10+"] },
  { text: "Y aura-t-il un but dans les 5 prochaines minutes ?", options: ["Oui", "Non", "Peut-être", "Deux buts"] },
  { text: "Quelle équipe tirera le plus ?", options: ["Domicile", "Extérieur", "Égalité", "Aucune"] },
  { text: "Qui va rater le prochain tir cadré ?", options: ["Attaquant A", "Attaquant B", "Milieu", "Personne"] },
  { text: "Y aura-t-il un hors-jeu dans les 5 prochaines minutes ?", options: ["Oui", "Non", "Plusieurs", "Avec but refusé"] },
  { text: "Combien de remplacements en 1ère mi-temps ?", options: ["0", "1", "2", "3+"] },
  { text: "Qui va toucher le plus de ballons ?", options: ["Milieu A", "Défenseur B", "Attaquant C", "Gardien"] },
  { text: "Quelle équipe aura le plus de possession ?", options: ["Domicile", "Extérieur", "50-50", "Incertain"] },
  { text: "Y aura-t-il un but contre son camp ?", options: ["Oui", "Non", "Peut-être", "Deux CSC"] },
  { text: "Qui va tenter le prochain dribble réussi ?", options: ["Ailier", "Milieu", "Attaquant", "Défenseur"] },
  { text: "Combien de tirs cadrés dans les 10 prochaines minutes ?", options: ["0-1", "2-3", "4-5", "6+"] },
  { text: "Quelle équipe commettra le plus de fautes ?", options: ["Domicile", "Extérieur", "Égalité", "Aucune"] },
  { text: "Y aura-t-il une intervention de la VAR ?", options: ["Oui", "Non", "Plusieurs", "But refusé"] },
  { text: "Qui va gagner le prochain duel aérien ?", options: ["Attaquant A", "Défenseur B", "Milieu C", "Gardien"] },
  { text: "Combien de corners dans les 10 prochaines minutes ?", options: ["0-1", "2-3", "4-5", "6+"] },
  { text: "Quelle équipe va presser le plus haut ?", options: ["Domicile", "Extérieur", "Les deux", "Aucune"] }
];

export default function App() {
  const [screen, setScreen] = useState('home');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answers, setAnswers] = useState({});
  const [usedQuestions, setUsedQuestions] = useState([]);
  const usedQuestionsRef = React.useRef([]);

  // Démarrage automatique du système
  useEffect(() => {
    const initSystem = async () => {
      const matchRef = ref(db, 'matchState');
      const matchSnap = await get(matchRef);
      
      if (!matchSnap.exists()) {
        await set(matchRef, { 
          isActive: true, 
          startTime: Date.now(),
          autoMode: true
        });
      }
    };
    
    initSystem();
    
    // Vérifier toutes les 5 secondes s'il faut créer une question
    const interval = setInterval(async () => {
      try {
        const qSnap = await get(ref(db, 'currentQuestion'));
        if (!qSnap.exists()) {
          createRandomQuestion();
        }
      } catch (e) {
        console.error(e);
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Écouter les joueurs
  useEffect(() => {
    const unsub = onValue(ref(db, 'players'), (snap) => {
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(([id, p]) => ({ id, ...p }));
        setPlayers(list.sort((a, b) => b.score - a.score));
      } else {
        setPlayers([]);
      }
    });
    return () => unsub();
  }, []);

  // Écouter la question
  useEffect(() => {
    const unsub = onValue(ref(db, 'currentQuestion'), (snap) => {
      const data = snap.val();
      setCurrentQuestion(data);
      if (data) {
        setTimeLeft(data.timeLeft || 30);
      } else {
        setPlayerAnswer(null);
      }
    });
    return () => unsub();
  }, []);

  // Écouter les réponses
  useEffect(() => {
    if (!currentQuestion) {
      setAnswers({});
      return;
    }
    const unsub = onValue(ref(db, `answers/${currentQuestion.id}`), (snap) => {
      const count = {};
      if (snap.exists()) {
        Object.values(snap.val()).forEach(a => {
          count[a.answer] = (count[a.answer] || 0) + 1;
        });
      }
      setAnswers(count);
    });
    return () => unsub();
  }, [currentQuestion?.id]);

  // Timer avec validation automatique
  useEffect(() => {
    if (!currentQuestion) return;
    
    if (timeLeft <= 0) {
      autoValidate();
      return;
    }
    
    const timer = setTimeout(() => {
      setTimeLeft(timeLeft - 1);
      update(ref(db, 'currentQuestion'), { timeLeft: timeLeft - 1 }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentQuestion, timeLeft]);

  const createRandomQuestion = async () => {
    try {
      // Filtrer les questions déjà utilisées
      const availableQuestions = QUESTIONS.filter(q => 
        !usedQuestionsRef.current.includes(q.text)
      );
      
      // Si toutes les questions ont été utilisées, réinitialiser
      if (availableQuestions.length === 0) {
        usedQuestionsRef.current = [];
        return createRandomQuestion();
      }
      
      // Choisir une question aléatoire parmi celles disponibles
      const randomQ = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
      const qId = Date.now().toString();
      
      // Marquer cette question comme utilisée
      usedQuestionsRef.current.push(randomQ.text);
      
      await set(ref(db, 'currentQuestion'), {
        id: qId,
        text: randomQ.text,
        options: randomQ.options,
        timeLeft: 30,
        createdAt: Date.now()
      });
      
    } catch (e) {
      console.error(e);
    }
  };

  const autoValidate = async () => {
    if (!currentQuestion) return;
    try {
      const randomWinner = currentQuestion.options[Math.floor(Math.random() * currentQuestion.options.length)];
      
      const answersSnap = await get(ref(db, `answers/${currentQuestion.id}`));
      
      if (answersSnap.exists()) {
        for (const [pId, data] of Object.entries(answersSnap.val())) {
          if (data.answer === randomWinner) {
            const playerSnap = await get(ref(db, `players/${pId}`));
            if (playerSnap.exists()) {
              const bonus = Math.floor((data.timeLeft || 0) / 5);
              const total = 10 + bonus;
              await update(ref(db, `players/${pId}`), {
                score: (playerSnap.val().score || 0) + total
              });
            }
          }
        }
      }

      await remove(ref(db, 'currentQuestion'));
      await remove(ref(db, 'answers'));
      
      setTimeout(() => createRandomQuestion(), 10000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim()) return;
    try {
      const newRef = push(ref(db, 'players'));
      await set(newRef, { name: playerName, score: 0, joinedAt: Date.now() });
      setPlayerId(newRef.key);
      setScreen('mobile');
    } catch (e) {
      alert('Erreur de connexion');
    }
  };

  const handleAnswer = async (answer) => {
    if (!currentQuestion || playerAnswer || !playerId) return;
    try {
      setPlayerAnswer(answer);
      await set(ref(db, `answers/${currentQuestion.id}/${playerId}`), {
        answer,
        timestamp: Date.now(),
        timeLeft
      });
    } catch (e) {
      console.error(e);
    }
  };

  const getMatchTime = () => {
    const mins = Math.floor((Date.now() - (Date.now() % 600000)) / 6000) % 90;
    return `${mins}'`;
  };

  const getMatchPhase = () => {
    const mins = Math.floor((Date.now() - (Date.now() % 600000)) / 6000) % 90;
    if (mins >= 45) return "2MT";
    return "1MT";
  };

  const MatchClock = () => {
    const [rot, setRot] = useState(0);
    
    useEffect(() => {
      const iv = setInterval(() => {
        const mins = Math.floor((Date.now() - (Date.now() % 600000)) / 6000) % 90;
        setRot((mins / 90) * 360);
      }, 1000);
      return () => clearInterval(iv);
    }, []);

    return (
      <div className="relative">
        <div className="w-48 h-48 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-2xl flex items-center justify-center border-8 border-white">
          <div className="absolute w-44 h-44 rounded-full bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl font-black text-yellow-400">{getMatchTime()}</div>
              <div className="text-xs text-yellow-300 font-bold mt-1">{getMatchPhase()}</div>
            </div>
            <div 
              className="absolute w-1 h-16 bg-yellow-400 origin-bottom"
              style={{ 
                transform: `rotate(${rot}deg) translateY(-50%)`,
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
          <p className="text-lg text-yellow-300 mt-4">🤖 Mode automatique activé</p>
        </div>
        <div className="flex gap-6">
          <button onClick={() => setScreen('mobile')} className="bg-white text-green-900 px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-100 transition-all shadow-2xl">
            📱 JOUER
          </button>
          <button onClick={() => setScreen('tv')} className="bg-green-800 text-white px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-700 transition-all shadow-2xl border-4 border-white">
            📺 ÉCRAN BAR
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
            <button onClick={handleJoin} className="w-full bg-green-900 text-white py-4 rounded-xl text-xl font-bold hover:bg-green-800">
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
                  <div className="h-full bg-green-600 transition-all" style={{ width: `${(timeLeft / 30) * 100}%` }} />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">{currentQuestion.text}</h3>
              <div className="space-y-3">
                {currentQuestion.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(opt)}
                    disabled={playerAnswer !== null}
                    className={`w-full py-4 px-6 rounded-xl text-lg font-bold transition-all ${
                      playerAnswer === opt ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    {opt} {playerAnswer === opt && '⏳'}
                  </button>
                ))}
              </div>
              {playerAnswer && <p className="mt-6 text-center text-blue-600 font-semibold">Réponse enregistrée ⏳</p>}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-12 text-center shadow-2xl">
              <div className="text-6xl mb-4">⏳</div>
              <p className="text-2xl text-gray-600 font-semibold">Prochaine question dans 10 secondes...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'tv') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 p-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-5xl font-black text-white mb-2">🏆 CLASSEMENT LIVE</h1>
            <p className="text-2xl text-green-300">Le Penalty - Paris 11e</p>
            <p className="text-lg text-yellow-300 mt-2">🤖 Mode automatique</p>
          </div>
          <div className="flex gap-6">
            <MatchClock />
            <div className="bg-white p-6 rounded-2xl">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://quiz-buteur.vercel.app" alt="QR" className="w-48 h-48" />
              <p className="text-center mt-3 font-bold text-green-900">Scanne pour jouer !</p>
            </div>
          </div>
        </div>

        {currentQuestion && (
          <div className="bg-yellow-400 rounded-2xl p-6 mb-6">
            <h3 className="text-3xl font-black text-gray-900 mb-4 text-center">📊 VOTES</h3>
            <div className="grid grid-cols-4 gap-4">
              {currentQuestion.options.map(opt => (
                <div key={opt} className="bg-white rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">{opt}</div>
                  <div className="text-4xl font-black text-green-600">{answers[opt] || 0}</div>
                  <div className="text-sm text-gray-500 mt-1">votes</div>
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
            {players.slice(0, 16).map((p, i) => (
              <div
                key={p.id}
                className={`grid grid-cols-12 gap-3 items-center py-3 px-3 rounded-lg transition-all ${
                  i === 0 ? 'bg-yellow-400 text-gray-900 font-black text-2xl'
                  : i === 1 ? 'bg-gray-300 text-gray-900 font-bold text-xl'
                  : i === 2 ? 'bg-orange-300 text-gray-900 font-bold text-xl'
                  : 'bg-gray-50 text-lg'
                }`}
              >
                <div className="col-span-1 font-bold">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
                <div className="col-span-7 font-bold truncate">{p.name}</div>
                <div className="col-span-4 text-right font-black">{p.score} pts</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
