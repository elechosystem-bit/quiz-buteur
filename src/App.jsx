import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, update, remove, get } from 'firebase/database';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

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
const auth = getAuth(app);

const QUESTION_INTERVAL = 300000;
const ADMIN_CODE = '1234';

const QUESTIONS = [
  { text: "Qui va marquer le prochain but ?", options: ["Mbappé", "Griezmann", "Giroud", "Dembélé"] },
  { text: "Qui va marquer le prochain but ?", options: ["Benzema", "Neymar", "Messi", "Lewandowski"] },
  { text: "Qui va marquer le prochain but ?", options: ["Haaland", "Salah", "Kane", "De Bruyne"] },
  { text: "Qui va marquer le prochain but ?", options: ["Ronaldo", "Vinicius", "Rodrygo", "Bellingham"] },
  { text: "Qui va marquer le prochain but ?", options: ["Osimhen", "Kvaratskhelia", "Lautaro", "Rashford"] },
  { text: "Qui va marquer le prochain but ?", options: ["Saka", "Foden", "Palmer", "Watkins"] },
  { text: "Quelle équipe aura le prochain corner ?", options: ["Domicile", "Extérieur", "Aucune", "Les deux"] },
  { text: "Qui va avoir le prochain carton jaune ?", options: ["Défenseur", "Milieu", "Attaquant", "Personne"] },
  { text: "Y aura-t-il un penalty ?", options: ["Oui", "Non", "Peut-être", "VAR"] },
  { text: "Combien de buts dans les 10 prochaines minutes ?", options: ["0", "1", "2", "3+"] },
  { text: "Qui va faire la prochaine passe décisive ?", options: ["Milieu offensif", "Ailier", "Défenseur", "Attaquant"] },
  { text: "Quelle équipe dominera ?", options: ["Domicile", "Extérieur", "Égalité", "Incertain"] },
  { text: "Y aura-t-il un carton rouge ?", options: ["Oui", "Non", "Deux cartons", "VAR annule"] },
  { text: "Qui va gagner le plus de duels ?", options: ["Attaquant A", "Milieu B", "Défenseur C", "Gardien"] },
  { text: "Combien de temps additionnel ?", options: ["0-1 min", "2-3 min", "4-5 min", "6+ min"] },
  { text: "Qui va faire le prochain arrêt ?", options: ["Gardien domicile", "Gardien extérieur", "Défenseur", "Poteau"] },
  { text: "Quelle sera la prochaine action ?", options: ["Corner", "Coup franc", "Penalty", "But"] },
  { text: "Qui va sortir sur blessure ?", options: ["Personne", "Attaquant", "Défenseur", "Milieu"] },
  { text: "Combien de fautes au total ?", options: ["0-3", "4-6", "7-9", "10+"] },
  { text: "But dans les 5 prochaines minutes ?", options: ["Oui", "Non", "Peut-être", "Deux buts"] },
  { text: "Quelle équipe tirera le plus ?", options: ["Domicile", "Extérieur", "Égalité", "Aucune"] },
  { text: "Y aura-t-il un hors-jeu ?", options: ["Oui", "Non", "Plusieurs", "Avec but refusé"] },
  { text: "Combien de remplacements ?", options: ["0", "1", "2", "3+"] },
  { text: "Qui va toucher le plus de ballons ?", options: ["Milieu A", "Défenseur B", "Attaquant C", "Gardien"] },
  { text: "Quelle équipe aura le plus de possession ?", options: ["Domicile", "Extérieur", "50-50", "Incertain"] },
  { text: "Y aura-t-il un but contre son camp ?", options: ["Oui", "Non", "Peut-être", "Deux CSC"] },
  { text: "Qui va tenter le prochain dribble ?", options: ["Ailier", "Milieu", "Attaquant", "Défenseur"] },
  { text: "Combien de tirs cadrés ?", options: ["0-1", "2-3", "4-5", "6+"] },
  { text: "Quelle équipe commettra le plus de fautes ?", options: ["Domicile", "Extérieur", "Égalité", "Aucune"] },
  { text: "Y aura-t-il une intervention VAR ?", options: ["Oui", "Non", "Plusieurs", "But refusé"] },
  { text: "Qui va gagner le prochain duel aérien ?", options: ["Attaquant A", "Défenseur B", "Milieu C", "Gardien"] },
  { text: "Combien de corners ?", options: ["0-1", "2-3", "4-5", "6+"] },
  { text: "Quelle équipe va presser le plus haut ?", options: ["Domicile", "Extérieur", "Les deux", "Aucune"] }
];

export default function App() {
  const [screen, setScreen] = useState('barLogin');
  const [barId] = useState('default_bar'); // Bar unique par défaut
  const [barInfo, setBarInfo] = useState(null);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [currentMatchId, setCurrentMatchId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [playerAnswer, setPlayerAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answers, setAnswers] = useState({});
  const [matchState, setMatchState] = useState(null);
  const [countdown, setCountdown] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [adminCode, setAdminCode] = useState('');
  const [barIdInput, setBarIdInput] = useState('');
  const usedQuestionsRef = useRef([]);
  const isProcessingRef = useRef(false);
  const nextQuestionTimer = useRef(null);

  // Charger les infos du bar au démarrage
  useEffect(() => {
    loadBarInfo(barId);
  }, []);

  // Détecter si on arrive via un QR code (URL avec /play)
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/play') {
      setScreen('auth');
    }
  }, []);

  const loadBarInfo = async (id) => {
    try {
      const barRef = ref(db, `bars/${id}/info`);
      const snap = await get(barRef);
      if (snap.exists()) {
        setBarInfo(snap.val());
      } else {
        // Créer le bar par défaut
        const defaultInfo = {
          name: "Quiz Buteur Live",
          createdAt: Date.now()
        };
        await set(barRef, defaultInfo);
        setBarInfo(defaultInfo);
      }
    } catch (e) {
      console.error('Erreur chargement bar:', e);
    }
  };

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = ref(db, `users/${currentUser.uid}`);
        const snap = await get(userRef);
        if (snap.exists()) {
          setUserProfile(snap.val());
        }
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!barId) return;
    const unsub = onValue(ref(db, `bars/${barId}/matchState`), (snap) => {
      const state = snap.val();
      setMatchState(state);
      if (state?.currentMatchId) {
        setCurrentMatchId(state.currentMatchId);
      }
    });
    return () => unsub();
  }, [barId]);

  useEffect(() => {
    if (!barId || !currentMatchId) return;
    const unsub = onValue(ref(db, `bars/${barId}/matches/${currentMatchId}/players`), (snap) => {
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(([id, p]) => ({ id, ...p }));
        setPlayers(list.sort((a, b) => b.score - a.score));
      } else {
        setPlayers([]);
      }
    });
    return () => unsub();
  }, [barId, currentMatchId]);

  useEffect(() => {
    if (!barId) return;
    const unsub = onValue(ref(db, `bars/${barId}/currentQuestion`), (snap) => {
      const data = snap.val();
      if (data && data.text && data.options && Array.isArray(data.options)) {
        setCurrentQuestion(data);
        setTimeLeft(data.timeLeft || 30);
      } else {
        setCurrentQuestion(null);
        setPlayerAnswer(null);
      }
    });
    return () => unsub();
  }, [barId]);

  useEffect(() => {
    if (!barId || !currentQuestion) {
      setAnswers({});
      return;
    }
    const unsub = onValue(ref(db, `bars/${barId}/answers/${currentQuestion.id}`), (snap) => {
      const count = {};
      if (snap.exists()) {
        Object.values(snap.val()).forEach(a => {
          count[a.answer] = (count[a.answer] || 0) + 1;
        });
      }
      setAnswers(count);
    });
    return () => unsub();
  }, [barId, currentQuestion?.id]);

  useEffect(() => {
    const addPlayerToMatch = async () => {
      if (user && barId && currentMatchId && userProfile && screen === 'mobile') {
        try {
          const playerRef = ref(db, `bars/${barId}/matches/${currentMatchId}/players/${user.uid}`);
          const playerSnap = await get(playerRef);
          
          if (!playerSnap.exists()) {
            await set(playerRef, {
              pseudo: userProfile.pseudo,
              score: 0,
              joinedAt: Date.now()
            });
            console.log('✅ Joueur ajouté au match:', userProfile.pseudo);
          }
        } catch (e) {
          console.error('Erreur ajout joueur:', e);
        }
      }
    };
    
    addPlayerToMatch();
  }, [user, barId, currentMatchId, userProfile, screen]);

  useEffect(() => {
    if (!currentQuestion?.id || !currentQuestion?.createdAt) return;
    
    const calculateTimeLeft = () => {
      const elapsed = Math.floor((Date.now() - currentQuestion.createdAt) / 1000);
      const remaining = Math.max(0, 30 - elapsed);
      setTimeLeft(remaining);
      
      if (remaining === 0 && !isProcessingRef.current) {
        autoValidate();
      }
    };
    
    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [currentQuestion?.id, currentQuestion?.createdAt]);

  useEffect(() => {
    if (!matchState?.nextQuestionTime) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const diff = matchState.nextQuestionTime - Date.now();
      if (diff <= 0) {
        setCountdown('Bientôt...');
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setCountdown(`${mins}m ${secs}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [matchState?.nextQuestionTime]);

  useEffect(() => {
    if (!barId || !matchState?.active) {
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
        nextQuestionTimer.current = null;
      }
      return;
    }

    if (nextQuestionTimer.current) clearInterval(nextQuestionTimer.current);

    nextQuestionTimer.current = setInterval(async () => {
      if (currentQuestion) return;
      
      const now = Date.now();
      const nextTime = matchState.nextQuestionTime || 0;

      if (now >= nextTime) {
        await createRandomQuestion();
      }
    }, 2000);

    return () => {
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
      }
    };
  }, [barId, matchState?.active, matchState?.nextQuestionTime, currentQuestion]);

  const handleBarLogin = async () => {
    if (!barIdInput.trim()) {
      alert('Entrez le code du bar');
      return;
    }
    
    const id = barIdInput.trim().toLowerCase().replace(/\s+/g, '_');
    setBarId(id);
    await loadBarInfo(id);
    setScreen('tv');
  };

  const handleSignup = async () => {
    if (!email || !password || !pseudo) {
      alert('Remplissez tous les champs');
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await set(ref(db, `users/${userCredential.user.uid}`), {
        email,
        pseudo,
        totalPoints: 0,
        matchesPlayed: 0,
        createdAt: Date.now()
      });
      // Après inscription → TOUJOURS aller sur Mobile (Jouer)
      setScreen('mobile');
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      alert('Email et mot de passe requis');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Après connexion → TOUJOURS aller sur Mobile (Jouer)
      setScreen('mobile');
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  const startMatch = async () => {
    if (!barId) return;
    try {
      await remove(ref(db, `bars/${barId}/matchState`));
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/answers`));
      
      usedQuestionsRef.current = [];
      isProcessingRef.current = false;
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
        nextQuestionTimer.current = null;
      }
      
      const now = Date.now();
      const matchId = `match_${now}`;
      
      await set(ref(db, `bars/${barId}/matchState`), {
        active: true,
        startTime: now,
        nextQuestionTime: now + 60000,
        questionCount: 0,
        currentMatchId: matchId
      });
      
      console.log('✅ Match démarré:', matchId);
    } catch (e) {
      console.error('Erreur:', e);
      alert('Erreur: ' + e.message);
    }
  };

  const stopMatch = async () => {
    if (!barId) return;
    try {
      if (currentMatchId && matchState?.active) {
        const playersSnap = await get(ref(db, `bars/${barId}/matches/${currentMatchId}/players`));
        if (playersSnap.exists()) {
          for (const [userId, playerData] of Object.entries(playersSnap.val())) {
            const userSnap = await get(ref(db, `users/${userId}`));
            if (userSnap.exists()) {
              const userData = userSnap.val();
              await update(ref(db, `users/${userId}`), {
                totalPoints: (userData.totalPoints || 0) + (playerData.score || 0),
                matchesPlayed: (userData.matchesPlayed || 0) + 1
              });
            }
          }
        }
      }
      
      await remove(ref(db, `bars/${barId}/matchState`));
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/answers`));
      
      usedQuestionsRef.current = [];
      isProcessingRef.current = false;
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
        nextQuestionTimer.current = null;
      }
      
      console.log('✅ Match arrêté');
    } catch (e) {
      console.error('Erreur:', e);
    }
  };

  const createRandomQuestion = async () => {
    if (!barId || isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const existingQ = await get(ref(db, `bars/${barId}/currentQuestion`));
      if (existingQ.exists() && existingQ.val()?.text) {
        isProcessingRef.current = false;
        return;
      }

      const availableQuestions = QUESTIONS.filter(q => 
        !usedQuestionsRef.current.includes(q.text)
      );
      
      if (availableQuestions.length === 0) {
        usedQuestionsRef.current = [];
      }
      
      const randomQ = availableQuestions.length > 0 
        ? availableQuestions[Math.floor(Math.random() * availableQuestions.length)]
        : QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
      
      const qId = Date.now().toString();
      usedQuestionsRef.current.push(randomQ.text);
      
      await set(ref(db, `bars/${barId}/currentQuestion`), {
        id: qId,
        text: randomQ.text,
        options: randomQ.options,
        timeLeft: 30,
        createdAt: Date.now()
      });

      if (matchState?.active) {
        await update(ref(db, `bars/${barId}/matchState`), {
          questionCount: (matchState.questionCount || 0) + 1
        });
      }
      
    } catch (e) {
      console.error('Erreur:', e);
    } finally {
      isProcessingRef.current = false;
    }
  };

  const autoValidate = async () => {
    if (!barId || !currentQuestion || !currentQuestion.options || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    const questionId = currentQuestion.id;
    
    try {
      const randomWinner = currentQuestion.options[Math.floor(Math.random() * currentQuestion.options.length)];
      const answersSnap = await get(ref(db, `bars/${barId}/answers/${questionId}`));
      
      if (answersSnap.exists() && currentMatchId) {
        for (const [userId, data] of Object.entries(answersSnap.val())) {
          if (data.answer === randomWinner) {
            const playerRef = ref(db, `bars/${barId}/matches/${currentMatchId}/players/${userId}`);
            const playerSnap = await get(playerRef);
            const bonus = Math.floor((data.timeLeft || 0) / 5);
            const total = 10 + bonus;
            
            if (playerSnap.exists()) {
              await update(playerRef, {
                score: (playerSnap.val().score || 0) + total
              });
            } else {
              const userSnap = await get(ref(db, `users/${userId}`));
              if (userSnap.exists()) {
                await set(playerRef, {
                  pseudo: userSnap.val().pseudo,
                  score: total
                });
              }
            }
          }
        }
      }

      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/answers/${questionId}`));
      
      if (matchState?.active) {
        const nextTime = Date.now() + QUESTION_INTERVAL;
        await update(ref(db, `bars/${barId}/matchState`), {
          nextQuestionTime: nextTime
        });
      }
      
    } catch (e) {
      console.error('Erreur:', e);
    } finally {
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 2000);
    }
  };

  const handleAnswer = async (answer) => {
    if (!barId || !currentQuestion || playerAnswer || !user) return;
    try {
      setPlayerAnswer(answer);
      await set(ref(db, `bars/${barId}/answers/${currentQuestion.id}/${user.uid}`), {
        answer,
        timestamp: Date.now(),
        timeLeft
      });
    } catch (e) {
      console.error(e);
    }
  };

  const MatchClock = () => {
    const [time, setTime] = useState('');
    
    useEffect(() => {
      const updateTime = () => {
        const mins = Math.floor((Date.now() - (Date.now() % 600000)) / 6000) % 90;
        const secs = Math.floor((Date.now() / 1000) % 60);
        setTime(`${mins}'${secs.toString().padStart(2, '0')}`);
      };
      
      updateTime();
      const iv = setInterval(updateTime, 1000);
      return () => clearInterval(iv);
    }, []);

    const mins = Math.floor((Date.now() - (Date.now() % 600000)) / 6000) % 90;
    const phase = mins >= 45 ? "2MT" : "1MT";

    return (
      <div className="bg-black rounded-xl px-6 py-3 border-2 border-gray-700 shadow-lg">
        <div className="text-6xl font-mono font-black text-green-400" style={{ letterSpacing: '0.1em' }}>
          {time}
        </div>
        <div className="text-sm font-bold text-green-500 text-center mt-1">
          {phase}
        </div>
      </div>
    );
  };

  // Page d'accueil simple avec bouton ADMIN
  if (screen === 'barLogin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">⚽</div>
          <h1 className="text-6xl font-black text-white mb-4">QUIZ BUTEUR</h1>
          <p className="text-2xl text-green-200">Pronostics en temps réel</p>
        </div>
        
        <button 
          onClick={() => setScreen('tv')}
          className="bg-white text-green-900 px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-100 transition-all shadow-2xl"
        >
          🎮 ADMIN
        </button>
      </div>
    );
  }

  // Écran d'authentification JOUEUR
  if (screen === 'auth') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-2xl font-bold text-green-900">{barInfo?.name || 'Chargement...'}</h2>
          </div>

          <h3 className="text-xl font-bold text-green-900 mb-6 text-center">
            {authMode === 'login' ? 'Connexion' : 'Inscription'}
          </h3>
          
          {authMode === 'signup' && (
            <input
              type="text"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              placeholder="Pseudo"
              className="w-full px-6 py-4 text-xl border-4 border-green-900 rounded-xl mb-4 focus:outline-none focus:border-green-600"
            />
          )}
          
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-6 py-4 text-xl border-4 border-green-900 rounded-xl mb-4 focus:outline-none focus:border-green-600"
          />
          
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            className="w-full px-6 py-4 text-xl border-4 border-green-900 rounded-xl mb-6 focus:outline-none focus:border-green-600"
          />
          
          <button 
            onClick={authMode === 'login' ? handleLogin : handleSignup}
            className="w-full bg-green-900 text-white py-4 rounded-xl text-xl font-bold hover:bg-green-800 mb-4"
          >
            {authMode === 'login' ? 'SE CONNECTER' : "S'INSCRIRE"} ⚽
          </button>
          
          <button
            onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
            className="w-full text-green-900 py-2 text-sm underline"
          >
            {authMode === 'login' ? "Pas de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
          </button>
        </div>
      </div>
    );
  }

  // Rediriger vers auth si pas connecté
  if (!user && screen !== 'auth' && screen !== 'barLogin') {
    setScreen('auth');
    return null;
  }

  // Écran MOBILE (Joueur)
  if (screen === 'mobile' && user) {
    const myScore = players.find(p => p.id === user.uid)?.score || 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 p-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl p-6 mb-6 text-center">
            <div className="text-sm text-gray-500">{barInfo?.name}</div>
            <div className="text-green-700 text-lg font-semibold">{userProfile?.pseudo}</div>
            <div className="text-4xl font-black text-green-900">{myScore} pts</div>
            <div className="text-sm text-gray-500 mt-2">Total: {userProfile?.totalPoints || 0} pts</div>
            <button onClick={handleLogout} className="mt-3 text-red-600 text-sm underline">
              Déconnexion
            </button>
          </div>

          {currentQuestion && currentQuestion.text && currentQuestion.options ? (
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
              <div className="text-6xl mb-4">⚽</div>
              <p className="text-2xl text-gray-600 font-semibold mb-4">Match en cours...</p>
              {matchState?.active && countdown && (
                <p className="text-lg text-gray-500">Prochaine question dans {countdown}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Écran TV (Bar)
  if (screen === 'tv') {
    const qrUrl = `${window.location.origin}/play`;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 p-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-5xl font-black text-white mb-2">🏆 CLASSEMENT LIVE</h1>
            <p className="text-2xl text-green-300">{barInfo?.name || barId}</p>
            {matchState?.active && countdown && (
              <p className="text-xl text-yellow-400 mt-2">⏱️ Prochaine question: {countdown}</p>
            )}
            {!matchState?.active && (
              <div className="mt-4">
                <button
                  onClick={startMatch}
                  className="bg-green-600 px-6 py-3 rounded-lg text-lg font-bold hover:bg-green-700"
                >
                  ⚽ Démarrer le match
                </button>
              </div>
            )}
            {matchState?.active && (
              <div className="mt-4 flex gap-4">
                <button
                  onClick={stopMatch}
                  className="bg-red-600 px-6 py-3 rounded-lg text-lg font-bold hover:bg-red-700"
                >
                  ⏹️ Arrêter
                </button>
                <button
                  onClick={async () => {
                    if (currentQuestion) {
                      await autoValidate();
                      setTimeout(() => createRandomQuestion(), 1000);
                    } else {
                      await createRandomQuestion();
                    }
                  }}
                  className="bg-blue-600 px-6 py-3 rounded-lg text-lg font-bold hover:bg-blue-700"
                >
                  🎲 Question maintenant
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-6">
            <MatchClock />
            <div className="bg-white p-6 rounded-2xl">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} 
                alt="QR Code" 
                className="w-48 h-48" 
              />
              <p className="text-center mt-3 font-bold text-green-900">Scanne pour jouer !</p>
            </div>
          </div>
        </div>

        <div className="bg-white/95 rounded-3xl p-6 shadow-2xl">
          <div className="grid grid-cols-12 gap-3 text-xs font-bold text-gray-600 mb-3 px-3">
            <div className="col-span-1">#</div>
            <div className="col-span-7">JOUEUR</div>
            <div className="col-span-4 text-right">SCORE</div>
          </div>
          <div className="space-y-1">
            {players.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-4">👥</div>
                <p className="text-xl">En attente de joueurs...</p>
                <p className="text-sm mt-2">Scannez le QR code pour rejoindre !</p>
              </div>
            ) : (
              players.slice(0, 16).map((p, i) => (
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
                  <div className="col-span-7 font-bold truncate">{p.pseudo}</div>
                  <div className="col-span-4 text-right font-black">{p.score} pts</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
