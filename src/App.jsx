import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, update, remove, get, push } from 'firebase/database';
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
  const [screen, setScreen] = useState('home');
  const [barId] = useState('default_bar');
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
  const [notification, setNotification] = useState(null);
  const usedQuestionsRef = useRef([]);
  const isProcessingRef = useRef(false);
  const nextQuestionTimer = useRef(null);

  console.log('🚀 APP DÉMARRÉ - Screen initial:', screen);

  const loadBarInfo = async (id) => {
    try {
      const barRef = ref(db, `bars/${id}/info`);
      const snap = await get(barRef);
      if (snap.exists()) {
        setBarInfo(snap.val());
      } else {
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
    console.log('📍 Chargement initial - path:', window.location.pathname);
    loadBarInfo(barId);
    
    const path = window.location.pathname;
    if (path === '/play' || path.includes('/play')) {
      console.log('📱 Redirection vers playJoin');
      setScreen('playJoin');
    } else {
      console.log('🏠 Écran home');
    }
  }, [barId]);

  useEffect(() => {
    console.log('👤 Écoute de l\'authentification...');
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      console.log('👤 Auth changed - user:', currentUser ? currentUser.uid : 'null');
      setUser(currentUser);
      
      if (currentUser) {
        console.log('👤 Chargement du profil pour:', currentUser.uid);
        const userRef = ref(db, `users/${currentUser.uid}`);
        const snap = await get(userRef);
        
        if (snap.exists()) {
          const profile = snap.val();
          console.log('✅ Profil chargé:', profile);
          setUserProfile(profile);
        } else {
          console.log('❌ Profil non trouvé dans Firebase pour:', currentUser.uid);
          setUserProfile(null);
        }
      } else {
        console.log('👤 Pas d\'utilisateur, reset du profil');
        setUserProfile(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!barId) return;
    
    console.log('🎮 Écoute du matchState...');
    const matchStateRef = ref(db, `bars/${barId}/matchState`);
    
    const unsub = onValue(matchStateRef, (snap) => {
      const state = snap.val();
      console.log('🎮 matchState mis à jour:', state);
      
      setMatchState(state);
      
      if (state && state.currentMatchId) {
        console.log('🎮 Match actif détecté:', state.currentMatchId);
        setCurrentMatchId(state.currentMatchId);
      } else {
        console.log('🎮 Aucun match actif');
        setCurrentMatchId(null);
      }
    });
    
    return () => {
      console.log('🎮 Arrêt de l\'écoute du matchState');
      unsub();
    };
  }, [barId]);

  useEffect(() => {
    if (!barId || !currentMatchId) {
      console.log('👥 Reset players - pas de match');
      setPlayers([]);
      return;
    }
    
    console.log('👥 Écoute des joueurs pour le match:', currentMatchId);
    const playersRef = ref(db, `bars/${barId}/matches/${currentMatchId}/players`);
    
    const unsub = onValue(playersRef, (snap) => {
      console.log('👥 Mise à jour des joueurs, exists:', snap.exists());
      
      if (snap.exists()) {
        const data = snap.val();
        console.log('👥 Données brutes:', data);
        
        const list = Object.entries(data).map(([id, p]) => ({ id, ...p }));
        console.log('👥 Liste des joueurs:', list);
        
        setPlayers(list.sort((a, b) => b.score - a.score));
      } else {
        console.log('👥 Aucun joueur');
        setPlayers([]);
      }
    });
    
    return () => {
      console.log('👥 Arrêt de l\'écoute des joueurs');
      unsub();
    };
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
  }, [barId, currentQuestion]);

  useEffect(() => {
    if (!barId || screen !== 'tv') return;
    
    const notifRef = ref(db, `bars/${barId}/notifications`);
    const unsub = onValue(notifRef, (snap) => {
      if (snap.exists()) {
        const notifs = Object.entries(snap.val());
        if (notifs.length > 0) {
          const latest = notifs[notifs.length - 1];
          const notifKey = latest[0];
          const data = latest[1];
          
          if (Date.now() - data.timestamp < 6000) {
            setNotification(data);
            
            setTimeout(() => {
              setNotification(null);
            }, 5000);
            
            setTimeout(() => {
              remove(ref(db, `bars/${barId}/notifications/${notifKey}`));
            }, 10000);
          }
        }
      }
    });
    return () => unsub();
  }, [barId, screen]);

  useEffect(() => {
    const addPlayerToMatch = async () => {
      // Vérifications détaillées
      if (!user) {
        console.log('❌ useEffect addPlayer - Pas d\'utilisateur');
        return;
      }
      if (!barId) {
        console.log('❌ useEffect addPlayer - Pas de barId');
        return;
      }
      if (!currentMatchId) {
        console.log('❌ useEffect addPlayer - Pas de currentMatchId. matchState:', matchState);
        return;
      }
      if (!userProfile) {
        console.log('❌ useEffect addPlayer - Pas de userProfile');
        return;
      }
      if (screen !== 'mobile') {
        console.log('❌ useEffect addPlayer - Pas sur mobile, screen:', screen);
        return;
      }

      // PAS DE VÉRIFICATION matchState.active - on ajoute le joueur dès qu'il y a un match
      console.log('✅ Toutes les conditions OK pour ajouter le joueur');
      console.log('📋 user:', user.uid);
      console.log('📋 barId:', barId);
      console.log('📋 currentMatchId:', currentMatchId);
      console.log('📋 userProfile:', userProfile);

      try {
        const playerPath = `bars/${barId}/matches/${currentMatchId}/players/${user.uid}`;
        console.log('🔍 Vérification du chemin:', playerPath);
        
        const playerRef = ref(db, playerPath);
        const playerSnap = await get(playerRef);
        
        console.log('🔍 Joueur existe déjà ?', playerSnap.exists());
        
        if (!playerSnap.exists()) {
          console.log('➕ Ajout du joueur dans Firebase...');
          
          const newPlayer = {
            pseudo: userProfile.pseudo,
            score: 0,
            joinedAt: Date.now()
          };
          
          console.log('➕ Données du joueur:', newPlayer);
          
          await set(playerRef, newPlayer);
          console.log('✅ set() terminé');
          
          // Vérification immédiate
          await new Promise(resolve => setTimeout(resolve, 500));
          const verifySnap = await get(playerRef);
          console.log('🔍 Vérification immédiate - existe:', verifySnap.exists(), 'valeur:', verifySnap.val());
          
          // Notification
          const notifRef = push(ref(db, `bars/${barId}/notifications`));
          await set(notifRef, {
            type: 'playerJoined',
            pseudo: userProfile.pseudo,
            timestamp: Date.now()
          });
          console.log('✅ Notification envoyée');
          
          console.log('🎉🎉🎉 JOUEUR AJOUTÉ AVEC SUCCÈS !');
        } else {
          console.log('🔄 Joueur déjà présent:', playerSnap.val());
        }
      } catch (e) {
        console.error('❌ ERREUR lors de l\'ajout du joueur:', e);
        console.error('❌ Stack:', e.stack);
      }
    };
    
    // Appeler la fonction
    addPlayerToMatch();
  }, [user, barId, currentMatchId, userProfile, screen]);

  useEffect(() => {
    if (!currentQuestion || !currentQuestion.id || !currentQuestion.createdAt) return;
    
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
  }, [currentQuestion]);

  useEffect(() => {
    if (!matchState || !matchState.nextQuestionTime) {
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
  }, [matchState]);

  useEffect(() => {
    if (!barId || !matchState || !matchState.active) {
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
  }, [barId, matchState, currentQuestion]);

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
    
    console.log('🎬 DÉMARRAGE DU MATCH...');
    
    try {
      // 1. NETTOYAGE COMPLET DE FIREBASE
      console.log('🗑️ Nettoyage complet de Firebase...');
      
      // Récupérer tous les anciens matchs
      const allMatchesSnap = await get(ref(db, `bars/${barId}/matches`));
      if (allMatchesSnap.exists()) {
        console.log('🗑️ Suppression de tous les anciens matchs...');
        await remove(ref(db, `bars/${barId}/matches`));
      }
      
      // Supprimer tout l'état
      await remove(ref(db, `bars/${barId}/matchState`));
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/answers`));
      await remove(ref(db, `bars/${barId}/notifications`));
      
      console.log('✅ Nettoyage terminé');
      
      // Reset local
      usedQuestionsRef.current = [];
      isProcessingRef.current = false;
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
        nextQuestionTimer.current = null;
      }
      
      // 2. ATTENDRE QUE FIREBASE SYNCHRONISE
      console.log('⏳ Attente de synchronisation Firebase (2 secondes)...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 3. CRÉER LE NOUVEAU MATCH
      const now = Date.now();
      const matchId = `match_${now}`;
      console.log('✨ Création du nouveau match:', matchId);
      
      // Créer le matchState AVANT la structure du match
      const newMatchState = {
        active: true,
        startTime: now,
        nextQuestionTime: now + 60000,
        questionCount: 0,
        currentMatchId: matchId
      };
      
      await set(ref(db, `bars/${barId}/matchState`), newMatchState);
      console.log('✅ matchState créé:', newMatchState);
      
      // Attendre un peu
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Créer la structure du match
      const newMatch = {
        info: {
          startedAt: now,
          status: 'active'
        },
        players: {}
      };
      
      await set(ref(db, `bars/${barId}/matches/${matchId}`), newMatch);
      console.log('✅ Structure match créée');
      
      // 4. VÉRIFICATION COMPLÈTE
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const verifyState = await get(ref(db, `bars/${barId}/matchState`));
      console.log('🔍 Vérification matchState:', verifyState.exists(), verifyState.val());
      
      const verifyMatch = await get(ref(db, `bars/${barId}/matches/${matchId}`));
      console.log('🔍 Vérification match:', verifyMatch.exists(), verifyMatch.val());
      
      if (verifyState.exists() && verifyMatch.exists()) {
        console.log('✅✅✅ MATCH DÉMARRÉ AVEC SUCCÈS !');
        console.log('📋 Match ID:', matchId);
        alert('✅ Match démarré avec succès !\n\nID: ' + matchId + '\n\nLes joueurs peuvent maintenant rejoindre.');
      } else {
        throw new Error('La vérification a échoué');
      }
      
    } catch (e) {
      console.error('❌ ERREUR CRITIQUE:', e);
      alert('❌ Erreur lors du démarrage: ' + e.message);
    }
  };

  const stopMatch = async () => {
    if (!barId) return;
    try {
      if (currentMatchId && matchState && matchState.active) {
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
        
        await remove(ref(db, `bars/${barId}/matches/${currentMatchId}`));
      }
      
      await remove(ref(db, `bars/${barId}/matchState`));
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/answers`));
      await remove(ref(db, `bars/${barId}/notifications`));
      
      usedQuestionsRef.current = [];
      isProcessingRef.current = false;
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
        nextQuestionTimer.current = null;
      }
      
      setCurrentMatchId(null);
      setPlayers([]);
      setCurrentQuestion(null);
      
      console.log('✅ Match arrêté et nettoyé');
      alert('✅ Match arrêté ! Tous les scores ont été sauvegardés.');
    } catch (e) {
      console.error('Erreur:', e);
      alert('Erreur lors de l\'arrêt: ' + e.message);
    }
  };

  const createRandomQuestion = async () => {
    if (!barId || isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const existingQ = await get(ref(db, `bars/${barId}/currentQuestion`));
      if (existingQ.exists() && existingQ.val() && existingQ.val().text) {
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

      if (matchState && matchState.active) {
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
      
      if (matchState && matchState.active) {
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

  if (screen === 'home') {
    console.log('🖥️ Affichage écran HOME');
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">⚽</div>
          <h1 className="text-6xl font-black text-white mb-4">QUIZ BUTEUR</h1>
          <p className="text-2xl text-green-200">Pronostics en temps réel</p>
        </div>
        
        <div className="flex gap-6">
          <button 
            onClick={() => {
              console.log('🖥️ Clic sur TV');
              setScreen('tv');
            }}
            className="bg-white text-green-900 px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-100 transition-all shadow-2xl"
          >
            📺 ÉCRAN
          </button>
          <button 
            onClick={() => {
              console.log('🎮 Clic sur ADMIN');
              setScreen('admin');
            }}
            className="bg-green-700 text-white px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-600 transition-all shadow-2xl border-4 border-white"
          >
            🎮 ADMIN
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'playJoin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">⚽</div>
          <h1 className="text-5xl font-black text-white mb-4">{barInfo ? barInfo.name : 'Quiz Buteur Live'}</h1>
          <p className="text-2xl text-green-200">Pronostics en temps réel</p>
        </div>
        
        <button 
          onClick={() => setScreen('auth')}
          className="bg-white text-green-900 px-16 py-10 rounded-3xl text-4xl font-black hover:bg-green-100 transition-all shadow-2xl"
        >
          📱 JOUER
        </button>
      </div>
    );
  }

  if (screen === 'auth') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-2xl font-bold text-green-900">{barInfo ? barInfo.name : 'Chargement...'}</h2>
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

  if (!user && screen === 'mobile') {
    setScreen('auth');
    return null;
  }

  if (screen === 'mobile' && user) {
    const myScore = players.find(p => p.id === user.uid);
    const score = myScore ? myScore.score : 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 p-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl p-6 mb-6 text-center">
            <div className="text-sm text-gray-500">{barInfo ? barInfo.name : ''}</div>
            <div className="text-green-700 text-lg font-semibold">{userProfile ? userProfile.pseudo : ''}</div>
            <div className="text-4xl font-black text-green-900">{score} pts</div>
            <div className="text-sm text-gray-500 mt-2">Total: {userProfile ? (userProfile.totalPoints || 0) : 0} pts</div>
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
              {matchState && matchState.active && countdown && (
                <p className="text-lg text-gray-500">Prochaine question dans {countdown}</p>
              )}
              {(!matchState || !matchState.active) && (
                <p className="text-lg text-gray-500">En attente du démarrage du match</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'tv') {
    const qrUrl = `${window.location.origin}/play`;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 p-8">
        {notification && (
          <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
            <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white px-8 py-6 rounded-2xl shadow-2xl flex items-center gap-4">
              <div className="text-4xl">🎉</div>
              <div>
                <div className="text-2xl font-black">{notification.pseudo}</div>
                <div className="text-lg">a rejoint la partie !</div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-5xl font-black text-white mb-2">🏆 CLASSEMENT LIVE</h1>
            <p className="text-2xl text-green-300">{barInfo ? barInfo.name : 'Quiz Buteur Live'}</p>
            {matchState && matchState.active && countdown && (
              <p className="text-xl text-yellow-400 mt-2">⏱️ Prochaine question: {countdown}</p>
            )}
            {(!matchState || !matchState.active) && (
              <p className="text-gray-300 mt-2">Le match n'est pas démarré</p>
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

  if (screen === 'admin') {
    console.log('🎮 Affichage écran ADMIN');
    console.log('📊 État actuel - matchState:', matchState, 'currentMatchId:', currentMatchId, 'players:', players.length);
    
    const forceCleanup = async () => {
      if (!window.confirm('⚠️ ATTENTION : Ceci va supprimer TOUS les matchs et réinitialiser complètement Firebase. Continuer ?')) {
        return;
      }
      
      console.log('🧹 NETTOYAGE FORCÉ DE FIREBASE...');
      
      try {
        // Supprimer TOUT
        await remove(ref(db, `bars/${barId}/matches`));
        await remove(ref(db, `bars/${barId}/matchState`));
        await remove(ref(db, `bars/${barId}/currentQuestion`));
        await remove(ref(db, `bars/${barId}/answers`));
        await remove(ref(db, `bars/${barId}/notifications`));
        
        console.log('✅ Firebase nettoyé');
        
        // Reset local
        setMatchState(null);
        setCurrentMatchId(null);
        setPlayers([]);
        setCurrentQuestion(null);
        usedQuestionsRef.current = [];
        isProcessingRef.current = false;
        
        if (nextQuestionTimer.current) {
          clearInterval(nextQuestionTimer.current);
          nextQuestionTimer.current = null;
        }
        
        console.log('✅ État local réinitialisé');
        
        // Vérification
        await new Promise(resolve => setTimeout(resolve, 1000));
        const verifyState = await get(ref(db, `bars/${barId}/matchState`));
        console.log('🔍 Vérification après nettoyage - matchState exists:', verifyState.exists());
        
        alert('✅ Nettoyage complet terminé ! Vous pouvez maintenant démarrer un nouveau match.');
      } catch (e) {
        console.error('❌ Erreur nettoyage:', e);
        alert('❌ Erreur: ' + e.message);
      }
    };
    
    const debugFirebase = async () => {
      console.log('🔍 === DEBUG FIREBASE ===');
      try {
        const matchStateSnap = await get(ref(db, `bars/${barId}/matchState`));
        console.log('matchState exists:', matchStateSnap.exists());
        console.log('matchState value:', matchStateSnap.val());
        
        const matchesSnap = await get(ref(db, `bars/${barId}/matches`));
        console.log('matches exists:', matchesSnap.exists());
        console.log('matches value:', matchesSnap.val());
        
        if (currentMatchId) {
          const currentMatchSnap = await get(ref(db, `bars/${barId}/matches/${currentMatchId}`));
          console.log('currentMatch exists:', currentMatchSnap.exists());
          console.log('currentMatch value:', currentMatchSnap.val());
          
          const playersSnap = await get(ref(db, `bars/${barId}/matches/${currentMatchId}/players`));
          console.log('players exists:', playersSnap.exists());
          console.log('players value:', playersSnap.val());
        }
        
        alert('✅ Debug terminé - voir la console');
      } catch (e) {
        console.error('Erreur debug:', e);
        alert('❌ Erreur: ' + e.message);
      }
    };

    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">🎮 Admin - Gestion du Match</h1>
          
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Contrôle du Match</h2>
            
            {!matchState || !matchState.active ? (
              <div>
                <p className="text-gray-400 mb-4">Aucun match en cours</p>
                <div className="flex gap-4 flex-wrap">
                  <button
                    onClick={startMatch}
                    className="bg-green-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-green-700"
                  >
                    ⚽ Démarrer le match
                  </button>
                  <button
                    onClick={forceCleanup}
                    className="bg-orange-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-orange-700"
                  >
                    🧹 Nettoyage forcé
                  </button>
                  <button
                    onClick={debugFirebase}
                    className="bg-purple-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-purple-700"
                  >
                    🔍 Debug Firebase
                  </button>
                </div>
                <p className="text-sm text-gray-400 mt-3">Questions toutes les 5 minutes</p>
              </div>
            ) : (
              <div>
                <p className="text-xl mb-4 text-green-400">✅ Match en cours</p>
                <p className="text-lg mb-2">Match ID: {currentMatchId}</p>
                <p className="text-lg mb-2">Questions: {matchState.questionCount || 0}</p>
                <p className="text-lg mb-2">Joueurs connectés: {players.length}</p>
                {currentQuestion && currentQuestion.text ? (
                  <div className="mb-4">
                    <p className="text-yellow-400 mb-2">📢 {currentQuestion.text}</p>
                    <p className="text-gray-400">⏱️ {timeLeft}s</p>
                  </div>
                ) : (
                  countdown && <p className="text-gray-400 mb-4">⏱️ Prochaine: {countdown}</p>
                )}
                <div className="flex gap-4 flex-wrap">
                  <button
                    onClick={stopMatch}
                    className="bg-red-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-red-700"
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
                    className="bg-blue-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-blue-700"
                  >
                    🎲 Question maintenant
                  </button>
                  <button
                    onClick={forceCleanup}
                    className="bg-orange-600 px-6 py-4 rounded-lg text-lg font-bold hover:bg-orange-700"
                  >
                    🧹 Nettoyage
                  </button>
                  <button
                    onClick={debugFirebase}
                    className="bg-purple-600 px-6 py-4 rounded-lg text-lg font-bold hover:bg-purple-700"
                  >
                    🔍 Debug
                  </button>
                </div>
              </div>
            )}
          </div>

          {currentQuestion && currentQuestion.options && (
            <div className="bg-gray-800 rounded-xl p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4">Votes en direct</h2>
              <div className="grid grid-cols-2 gap-4">
                {currentQuestion.options.map(opt => (
                  <div key={opt} className="bg-gray-700 p-4 rounded-lg">
                    <div className="text-lg font-bold">{opt}</div>
                    <div className="text-3xl font-black text-green-400">{answers[opt] || 0}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Joueurs connectés ({players.length})</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {players.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Aucun joueur pour le moment</p>
              ) : (
                players.map(p => (
                  <div key={p.id} className="flex justify-between bg-gray-700 p-3 rounded">
                    <span>{p.pseudo}</span>
                    <span className="text-green-400">{p.score} pts</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => setScreen('home')} 
              className="bg-gray-700 px-6 py-3 rounded-lg hover:bg-gray-600"
            >
              ← Retour
            </button>
            <button 
              onClick={() => setScreen('tv')} 
              className="bg-blue-600 px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              📺 Voir écran TV
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
