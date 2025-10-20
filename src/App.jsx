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

const QUESTION_INTERVAL = 60000; // 1 minute (pour les tests)

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
  const [matchSearch, setMatchSearch] = useState('');
  const [availableMatches, setAvailableMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchStartTime, setMatchStartTime] = useState(null);
  const [matchElapsedMinutes, setMatchElapsedMinutes] = useState(0);
  const [matchHalf, setMatchHalf] = useState('1H');
  const [matchPlayers, setMatchPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const usedQuestionsRef = useRef([]);
  const isProcessingRef = useRef(false);
  const nextQuestionTimer = useRef(null);
  const wakeLockRef = useRef(null);

  console.log('🚀 APP DÉMARRÉ - Screen initial:', screen);

  // 🔥 NOUVEAU : Fonction pour mettre à jour le status du match depuis l'API
  const updateMatchStatus = async (fixtureId) => {
    try {
      const apiKey = import.meta.env.VITE_API_FOOTBALL_KEY;
      if (!apiKey) return;
      
      const response = await fetch(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'v3.football.api-sports.io'
        }
      });
      
      const data = await response.json();
      
      if (data.response && data.response[0]) {
        const match = data.response[0];
        await update(ref(db, `bars/${barId}/selectedMatch`), {
          status: match.fixture.status.long,
          elapsed: match.fixture.status.elapsed || 0,
          half: match.fixture.status.short,
          score: `${match.goals.home || 0}-${match.goals.away || 0}`
        });
        console.log('✅ Status match mis à jour:', match.fixture.status.long);
      }
    } catch (e) {
      console.error('❌ Erreur mise à jour status:', e);
    }
  };

  const searchMatches = async () => {
    setLoadingMatches(true);
    console.log('🔍 Recherche de matchs via API-Football...');
    
    try {
      const apiKey = import.meta.env.VITE_API_FOOTBALL_KEY;
      
      if (!apiKey) {
        console.error('❌ Clé API manquante !');
        alert('❌ Clé API non configurée. Vérifiez votre fichier .env.local');
        setLoadingMatches(false);
        return;
      }

      console.log('✅ Clé API trouvée');

      const response = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
        method: 'GET',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'v3.football.api-sports.io'
        }
      });

      const data = await response.json();
      console.log('📡 Réponse API:', data);

      if (data.errors && Object.keys(data.errors).length > 0) {
        console.error('❌ Erreur API:', data.errors);
        alert('❌ Erreur API: ' + JSON.stringify(data.errors));
        setLoadingMatches(false);
        return;
      }

      if (!data.response || data.response.length === 0) {
        console.log('⚠️ Aucun match en direct trouvé');
        
        const today = new Date().toISOString().split('T')[0];
        const responseToday = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
          method: 'GET',
          headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': 'v3.football.api-sports.io'
          }
        });

        const dataToday = await responseToday.json();
        console.log('📡 Matchs du jour:', dataToday);

        if (dataToday.response && dataToday.response.length > 0) {
          const matches = dataToday.response.slice(0, 20).map(fixture => ({
            id: fixture.fixture.id,
            homeTeam: fixture.teams.home.name,
            awayTeam: fixture.teams.away.name,
            homeLogo: fixture.teams.home.logo,
            awayLogo: fixture.teams.away.logo,
            league: fixture.league.name,
            date: new Date(fixture.fixture.date).toLocaleString('fr-FR'),
            status: fixture.fixture.status.long,
            score: fixture.fixture.status.short === 'NS' 
              ? 'vs' 
              : `${fixture.goals.home || 0}-${fixture.goals.away || 0}`
          }));

          setAvailableMatches(matches);
          console.log('✅ Matchs trouvés:', matches.length);
        } else {
          alert('⚠️ Aucun match trouvé aujourd\'hui');
          setAvailableMatches([]);
        }
      } else {
        const matches = data.response.slice(0, 20).map(fixture => ({
          id: fixture.fixture.id,
          homeTeam: fixture.teams.home.name,
          awayTeam: fixture.teams.away.name,
          homeLogo: fixture.teams.home.logo,
          awayLogo: fixture.teams.away.logo,
          league: fixture.league.name,
          date: new Date(fixture.fixture.date).toLocaleString('fr-FR'),
          status: fixture.fixture.status.long,
          score: `${fixture.goals.home || 0}-${fixture.goals.away || 0}`,
          elapsed: fixture.fixture.status.elapsed || 0,
          half: fixture.fixture.status.short
        }));

        setAvailableMatches(matches);
        console.log('✅ Matchs en direct trouvés:', matches.length);
      }

    } catch (e) {
      console.error('❌ Erreur recherche matchs:', e);
      alert('❌ Erreur: ' + e.message);
    } finally {
      setLoadingMatches(false);
    }
  };

  const selectMatch = async (match) => {
    console.log('⚽ Match sélectionné:', match);
    
    if (match.elapsed !== undefined) {
      setMatchElapsedMinutes(match.elapsed);
      setMatchStartTime(Date.now() - (match.elapsed * 60000));
      setMatchHalf(match.half || '1H');
      console.log('⏱️ Temps du match configuré:', match.elapsed, 'min -', match.half);
    }
    
    try {
      const matchData = {
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeLogo: match.homeLogo,
        awayLogo: match.awayLogo,
        league: match.league,
        score: match.score,
        date: match.date,
        status: match.status,
        elapsed: match.elapsed || 0,
        half: match.half || '1H'
      };
      
      console.log('💾 Sauvegarde dans Firebase:', matchData);
      await set(ref(db, `bars/${barId}/selectedMatch`), matchData);
      console.log('✅ Match sauvegardé dans Firebase');
      
      await new Promise(resolve => setTimeout(resolve, 500));
      const verifySnap = await get(ref(db, `bars/${barId}/selectedMatch`));
      console.log('🔍 Vérification: exists =', verifySnap.exists(), 'data =', verifySnap.val());
      
      setSelectedMatch(matchData);
      
    } catch (e) {
      console.error('❌ Erreur sauvegarde match sélectionné:', e);
      alert('❌ Erreur lors de la sélection du match: ' + e.message);
    }
    
    await loadMatchLineups(match.id);
  };

  const loadMatchLineups = async (fixtureId) => {
    setLoadingPlayers(true);
    console.log('👥 Récupération des compositions pour le match:', fixtureId);
    
    try {
      const apiKey = import.meta.env.VITE_API_FOOTBALL_KEY;
      
      if (!apiKey) {
        console.error('❌ Clé API manquante');
        setLoadingPlayers(false);
        return;
      }

      const response = await fetch(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'v3.football.api-sports.io'
        }
      });

      const data = await response.json();
      console.log('📡 Compositions reçues:', data);

      if (data.response && data.response.length > 0) {
        const allPlayers = [];
        
        data.response.forEach(team => {
          if (team.startXI && Array.isArray(team.startXI)) {
            team.startXI.forEach(playerObj => {
              if (playerObj.player) {
                allPlayers.push({
                  name: playerObj.player.name,
                  number: playerObj.player.number,
                  position: playerObj.player.pos,
                  team: team.team.name
                });
              }
            });
          }
        });
        
        console.log('✅ Joueurs extraits:', allPlayers.length);
        setMatchPlayers(allPlayers);
      } else {
        console.log('⚠️ Aucune composition disponible pour ce match');
        setMatchPlayers([]);
      }
      
    } catch (e) {
      console.error('❌ Erreur récupération compositions:', e);
      setMatchPlayers([]);
    } finally {
      setLoadingPlayers(false);
    }
  };

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

  // 🔥 Wake Lock : Empêcher l'écran de s'éteindre
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && (screen === 'tv' || screen === 'mobile')) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('✅ Wake Lock activé - l\'écran ne s\'éteindra pas');
          
          wakeLockRef.current.addEventListener('release', () => {
            console.log('⚠️ Wake Lock libéré');
          });
        } catch (err) {
          console.error('❌ Erreur Wake Lock:', err);
        }
      }
    };

    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('🔓 Wake Lock libéré manuellement');
      }
    };

    if (screen === 'tv' || screen === 'mobile') {
      requestWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (screen === 'tv' || screen === 'mobile')) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [screen]);

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

  // 🔥 Écoute de selectedMatch pour l'écran TV
  useEffect(() => {
    if (!barId || screen !== 'tv') return;
    
    console.log('📺 Écoute de selectedMatch...');
    const selectedMatchRef = ref(db, `bars/${barId}/selectedMatch`);
    
    const unsub = onValue(selectedMatchRef, (snap) => {
      if (snap.exists()) {
        const match = snap.val();
        console.log('📺 Match sélectionné reçu depuis Firebase:', match);
        
        setSelectedMatch(match);
        
        if (match.elapsed !== undefined) {
          setMatchElapsedMinutes(match.elapsed);
          setMatchStartTime(Date.now() - (match.elapsed * 60000));
          setMatchHalf(match.half || '1H');
          console.log('📺 Temps synchronisé:', match.elapsed, 'min');
        }
      } else {
        console.log('📺 Aucun match sélectionné dans Firebase');
      }
    });
    
    return () => {
      console.log('📺 Arrêt de l\'écoute de selectedMatch');
      unsub();
    };
  }, [barId, screen]);

  // 🔥 NOUVEAU : Mise à jour automatique du status du match toutes les 30 secondes
  useEffect(() => {
    if (!selectedMatch?.id || screen !== 'tv') return;
    
    console.log('⏰ Démarrage de la mise à jour automatique du status');
    
    const interval = setInterval(() => {
      updateMatchStatus(selectedMatch.id);
    }, 30000); // Toutes les 30 secondes
    
    // Premier appel immédiat
    updateMatchStatus(selectedMatch.id);
    
    return () => {
      console.log('⏰ Arrêt de la mise à jour automatique');
      clearInterval(interval);
    };
  }, [selectedMatch?.id, screen]);

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
        setTimeLeft(data.timeLeft || 15);
        
        if (screen === 'mobile' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification('⚽ Nouvelle question !', {
              body: data.text,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              vibrate: [200, 100, 200],
              tag: 'quiz-question',
              requireInteraction: true
            });
          }
        }
      } else {
        setCurrentQuestion(null);
        setPlayerAnswer(null);
      }
    });
    return () => unsub();
  }, [barId, screen]);

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
          
          await new Promise(resolve => setTimeout(resolve, 500));
          const verifySnap = await get(playerRef);
          console.log('🔍 Vérification immédiate - existe:', verifySnap.exists(), 'valeur:', verifySnap.val());
          
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
    
    addPlayerToMatch();
  }, [user, barId, currentMatchId, userProfile, screen]);

  useEffect(() => {
    if (!currentQuestion || !currentQuestion.id || !currentQuestion.createdAt) return;
    
    const calculateTimeLeft = () => {
      const elapsed = Math.floor((Date.now() - currentQuestion.createdAt) / 1000);
      const remaining = Math.max(0, 15 - elapsed);
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
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('✅ Connexion réussie:', userCredential.user.uid);
      
      const userRef = ref(db, `users/${userCredential.user.uid}`);
      const snap = await get(userRef);
      
      if (!snap.exists()) {
        console.log('⚠️ Profil manquant, création automatique...');
        await set(userRef, {
          email: userCredential.user.email,
          pseudo: email.split('@')[0],
          totalPoints: 0,
          matchesPlayed: 0,
          createdAt: Date.now()
        });
        console.log('✅ Profil créé automatiquement');
        alert('✅ Profil créé ! Vous pouvez maintenant jouer.');
      }
      
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          console.log('✅ Notifications autorisées');
          new Notification('🎉 Notifications activées !', {
            body: 'Vous serez alerté à chaque nouvelle question',
            icon: '/icon-192.png'
          });
        }
      }
      
      setScreen('mobile');
    } catch (e) {
      console.error('❌ Erreur connexion:', e);
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
      const allMatchesSnap = await get(ref(db, `bars/${barId}/matches`));
      if (allMatchesSnap.exists()) {
        console.log('🗑️ Suppression de tous les anciens matchs...');
        await remove(ref(db, `bars/${barId}/matches`));
      }
      
      await remove(ref(db, `bars/${barId}/matchState`));
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/answers`));
      await remove(ref(db, `bars/${barId}/notifications`));
      
      console.log('✅ Nettoyage terminé');
      
      usedQuestionsRef.current = [];
      isProcessingRef.current = false;
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
        nextQuestionTimer.current = null;
      }
      
      console.log('⏳ Attente de synchronisation Firebase (2 secondes)...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const now = Date.now();
      const matchId = `match_${now}`;
      console.log('✨ Création du nouveau match:', matchId);
      
      let clockStartTime = now;
      if (selectedMatch && selectedMatch.elapsed !== undefined) {
        clockStartTime = now - (selectedMatch.elapsed * 60000);
        console.log(`⏱️ Match déjà en cours depuis ${selectedMatch.elapsed} min, startTime ajusté`);
      }
      
      const newMatchState = {
        active: true,
        startTime: now,
        nextQuestionTime: now + 60000,
        questionCount: 0,
        currentMatchId: matchId,
        matchInfo: selectedMatch ? {
          homeTeam: selectedMatch.homeTeam,
          awayTeam: selectedMatch.awayTeam,
          homeLogo: selectedMatch.homeLogo,
          awayLogo: selectedMatch.awayLogo,
          league: selectedMatch.league,
          score: selectedMatch.score,
          status: selectedMatch.status
        } : null,
        matchClock: {
          startTime: clockStartTime,
          elapsedMinutes: selectedMatch?.elapsed || 0,
          half: selectedMatch?.half || matchHalf || '1H'
        }
      };
      
      await set(ref(db, `bars/${barId}/matchState`), newMatchState);
      console.log('✅ matchState créé:', newMatchState);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const newMatch = {
        info: {
          startedAt: now,
          status: 'active'
        },
        players: {}
      };
      
      await set(ref(db, `bars/${barId}/matches/${matchId}`), newMatch);
      console.log('✅ Structure match créée');
      
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

      let questionToUse;
      
      if (matchPlayers.length >= 4) {
        console.log('🎲 Génération de question avec joueurs réels');
        
        const shuffled = [...matchPlayers].sort(() => 0.5 - Math.random());
        const selectedPlayers = shuffled.slice(0, 4);
        
        const questionTypes = [
          {
            text: "Qui va marquer le prochain but ?",
            options: selectedPlayers.map(p => p.name.split(' ').pop())
          },
          {
            text: "Quel joueur va faire la prochaine passe décisive ?",
            options: selectedPlayers.map(p => p.name.split(' ').pop())
          },
          {
            text: "Qui va avoir le prochain carton ?",
            options: selectedPlayers.map(p => p.name.split(' ').pop())
          },
          {
            text: "Quel joueur va tenter le prochain tir ?",
            options: selectedPlayers.map(p => p.name.split(' ').pop())
          }
        ];
        
        questionToUse = questionTypes[Math.floor(Math.random() * questionTypes.length)];
        console.log('✅ Question créée:', questionToUse);
      } else {
        console.log('📋 Utilisation des questions par défaut');
        const availableQuestions = QUESTIONS.filter(q => 
          !usedQuestionsRef.current.includes(q.text)
        );
        
        if (availableQuestions.length === 0) {
          usedQuestionsRef.current = [];
        }
        
        questionToUse = availableQuestions.length > 0 
          ? availableQuestions[Math.floor(Math.random() * availableQuestions.length)]
          : QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
      }
      
      const qId = Date.now().toString();
      usedQuestionsRef.current.push(questionToUse.text);
      
      await set(ref(db, `bars/${barId}/currentQuestion`), {
        id: qId,
        text: questionToUse.text,
        options: questionToUse.options,
        timeLeft: 15,
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
            const bonus = Math.floor((data.timeLeft || 0) / 3);
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

  const forceCleanup = async () => {
    if (!window.confirm('⚠️ ATTENTION : Ceci va supprimer TOUS les matchs et réinitialiser complètement Firebase. Continuer ?')) {
      return;
    }
    
    console.log('🧹 NETTOYAGE FORCÉ DE FIREBASE...');
    
    try {
      await remove(ref(db, `bars/${barId}/matches`));
      await remove(ref(db, `bars/${barId}/matchState`));
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/answers`));
      await remove(ref(db, `bars/${barId}/notifications`));
      await remove(ref(db, `bars/${barId}/selectedMatch`));
      
      console.log('✅ Firebase nettoyé');
      
      setMatchState(null);
      setCurrentMatchId(null);
      setPlayers([]);
      setCurrentQuestion(null);
      setSelectedMatch(null);
      usedQuestionsRef.current = [];
      isProcessingRef.current = false;
      
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
        nextQuestionTimer.current = null;
      }
      
      console.log('✅ État local réinitialisé');
      
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
      
      const selectedMatchSnap = await get(ref(db, `bars/${barId}/selectedMatch`));
      console.log('selectedMatch exists:', selectedMatchSnap.exists());
      console.log('selectedMatch value:', selectedMatchSnap.val());
      
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

  // 🔥 COMPOSANT MATCH CLOCK CORRIGÉ
  const MatchClock = () => {
    const [time, setTime] = useState('');
    const [phase, setPhase] = useState('');
    
    useEffect(() => {
      const updateTime = () => {
        let clockStartTime = matchState?.matchClock?.startTime;
        let clockHalf = matchState?.matchClock?.half || matchHalf;
        
        // 🔥 Vérifier le status du match depuis l'API
        const matchStatus = selectedMatch?.status || matchState?.matchInfo?.status;
        
        // 🔥 Si le match est terminé selon l'API, arrêter le chrono
        if (matchStatus === 'Match Finished' || matchStatus === 'FT' || matchStatus === 'Terminé' || 
            matchStatus === 'Match terminé' || matchStatus === 'Fin du match') {
          const finalElapsed = selectedMatch?.elapsed || matchState?.matchInfo?.elapsed || 90;
          setTime(`${finalElapsed}'00`);
          setPhase('TERMINÉ');
          return;
        }
        
        // 🔥 Si mi-temps
        if (clockHalf === 'HT' || matchStatus === 'Halftime' || matchStatus === 'HT' || matchStatus === 'Mi-temps') {
          setTime("45'00");
          setPhase('MI-TEMPS');
          return;
        }
        
        if (!clockStartTime) {
          clockStartTime = matchStartTime;
        }
        
        if (clockStartTime) {
          const elapsed = Math.floor((Date.now() - clockStartTime) / 60000);
          const secs = Math.floor((Date.now() - clockStartTime) / 1000) % 60;
          
          let displayTime;
          let displayPhase;
          
          // Sécurité : ne jamais dépasser 120 minutes
          if (elapsed >= 120) {
            displayTime = "120'00";
            displayPhase = 'TERMINÉ';
          }
          // 1ère mi-temps
          else if (elapsed < 45) {
            displayTime = `${elapsed}'${secs.toString().padStart(2, '0')}`;
            displayPhase = '1MT';
          }
          // 2ème mi-temps
          else if (elapsed >= 45 && elapsed < 90) {
            displayTime = `${elapsed}'${secs.toString().padStart(2, '0')}`;
            displayPhase = '2MT';
          }
          // Prolongations
          else if (elapsed >= 90) {
            displayTime = `${elapsed}'${secs.toString().padStart(2, '0')}`;
            displayPhase = 'PROL.';
          }
          
          setTime(displayTime);
          setPhase(displayPhase);
        } else {
          const mins = Math.min(Math.floor((Date.now() - (Date.now() % 600000)) / 6000) % 120, 90);
          const secs = Math.floor((Date.now() / 1000) % 60);
          setTime(`${mins}'${secs.toString().padStart(2, '0')}`);
          setPhase(mins >= 45 ? "2MT" : "1MT");
        }
      };
      
      updateTime();
      const iv = setInterval(updateTime, 1000);
      return () => clearInterval(iv);
    }, [matchState, matchStartTime, matchHalf, selectedMatch]);

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
                  <div className="h-full bg-green-600 transition-all" style={{ width: `${(timeLeft / 15) * 100}%` }} />
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
    
    console.log('📺 === ÉCRAN TV - DEBUG COMPLET ===');
    console.log('📺 matchState:', matchState);
    console.log('📺 selectedMatch (state):', selectedMatch);
    console.log('📺 matchState?.matchInfo:', matchState?.matchInfo);
    
    const matchInfo = selectedMatch || matchState?.matchInfo;
    const hasMatchInfo = matchInfo && matchInfo.homeTeam && matchInfo.awayTeam;
    
    console.log('📺 matchInfo FINAL utilisé:', matchInfo);
    console.log('📺 hasMatchInfo:', hasMatchInfo);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 p-8">
        {notification && (
          <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
            <div className="bg-gradient-to-r from-green-500 to
