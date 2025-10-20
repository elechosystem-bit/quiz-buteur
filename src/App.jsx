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
      
      // Vérification immédiate
      await new Promise(resolve => setTimeout(resolve, 500));
      const verifySnap = await get(ref(db, `bars/${barId}/selectedMatch`));
      console.log('🔍 Vérification: exists =', verifySnap.exists(), 'data =', verifySnap.val());
      
      // Mettre à jour le state local APRÈS la sauvegarde
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

    // Re-demander le Wake Lock si l'onglet redevient visible
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

  // 🔥 NOUVEAU : Écoute de selectedMatch pour l'écran TV
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
        
        // 🔥 Envoyer une notification push quand une nouvelle question arrive
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
      
      // 🔥 Demander la permission pour les notifications
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
      
      // Calculer le startTime du chrono basé sur l'elapsed du match sélectionné
      let clockStartTime = now; // Par défaut, on démarre maintenant
      if (selectedMatch && selectedMatch.elapsed !== undefined) {
        // Si le match a déjà commencé, on recule le startTime
        clockStartTime = now - (selectedMatch.elapsed * 60000);
        console.log(`⏱️ Match déjà en cours depuis ${selectedMatch.elapsed} min, startTime ajusté`);
      }
      
      const newMatchState = {
        active: true,
        startTime: now,
        nextQuestionTime: now + 60000, // Première question dans 1 minute
        questionCount: 0,
        currentMatchId: matchId,
        matchInfo: selectedMatch ? {
          homeTeam: selectedMatch.homeTeam,
          awayTeam: selectedMatch.awayTeam,
          homeLogo: selectedMatch.homeLogo,
          awayLogo: selectedMatch.awayLogo,
          league: selectedMatch.league,
          score: selectedMatch.score
        } : null,
        matchClock: {
          startTime: clockStartTime, // Temps calculé pour le chrono
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
            const bonus = Math.floor((data.timeLeft || 0) / 3); // Bonus de rapidité (max 5 pts)
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

  const MatchClock = () => {
    const [time, setTime] = useState('');
    const [phase, setPhase] = useState('');
    
    useEffect(() => {
      const updateTime = () => {
        // Utiliser matchState.matchClock en priorité (fixé au démarrage du match)
        let clockStartTime = matchState?.matchClock?.startTime;
        let clockHalf = matchState?.matchClock?.half || selectedMatch?.half || matchHalf;
        
        // Si pas de matchClock dans matchState, utiliser les variables locales
        if (!clockStartTime) {
          clockStartTime = matchStartTime;
        }
        
        // Si le match est terminé, figer le chrono
        if (clockHalf === 'FT') {
          setTime('90\'00');
          setPhase('TERMINÉ');
          return;
        }
        
        if (clockStartTime) {
          const elapsed = Math.floor((Date.now() - clockStartTime) / 60000);
          const secs = Math.floor((Date.now() - clockStartTime) / 1000) % 60;
          
          let displayTime;
          if (elapsed < 45) {
            // 1ère mi-temps : 0' à 44'59"
            displayTime = `${elapsed}'${secs.toString().padStart(2, '0')}`;
          } else if (elapsed >= 45 && elapsed < 90) {
            // 2ème mi-temps : 45' à 89'59"
            displayTime = `${elapsed}'${secs.toString().padStart(2, '0')}`;
          } else {
            // Temps additionnel : 90'+1, 90'+2, etc.
            const additionalMins = elapsed - 90 + 1;
            displayTime = `90'+${additionalMins}`;
          }
          
          setTime(displayTime);
          
          if (clockHalf === 'HT') {
            setPhase('MI-TEMPS');
          } else if (elapsed >= 45 && clockHalf !== '1H') {
            setPhase('2MT');
          } else {
            setPhase('1MT');
          }
        } else {
          // Fallback: générer un temps fictif
          const mins = Math.floor((Date.now() - (Date.now() % 600000)) / 6000) % 90;
          const secs = Math.floor((Date.now() / 1000) % 60);
          setTime(`${mins}'${secs.toString().padStart(2, '0')}`);
          setPhase(mins >= 45 ? "2MT" : "1MT");
        }
      };
      
      updateTime();
      const iv = setInterval(updateTime, 1000);
      return () => clearInterval(iv);
    }, [matchState, matchStartTime, matchHalf, selectedMatch?.half]);

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
          <div className="flex-1">
            <h1 className="text-5xl font-black text-white mb-2">🏆 CLASSEMENT LIVE</h1>
            
            {hasMatchInfo ? (
              <div className="mb-3 bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-4 rounded-xl border-2 border-blue-500">
                <div className="flex items-center justify-center gap-4">
                  {matchInfo.homeLogo && (
                    <img src={matchInfo.homeLogo} alt={matchInfo.homeTeam} className="w-12 h-12 object-contain" />
                  )}
                  <div className="text-center">
                    <p className="text-4xl font-bold text-yellow-400">
                      {matchInfo.homeTeam} 
                      <span className="text-white mx-3">{matchInfo.score}</span> 
                      {matchInfo.awayTeam}
                    </p>
                    <p className="text-xl text-green-300 mt-1">{matchInfo.league}</p>
                  </div>
                  {matchInfo.awayLogo && (
                    <img src={matchInfo.awayLogo} alt={matchInfo.awayTeam} className="w-12 h-12 object-contain" />
                  )}
                </div>
              </div>
            ) : matchState?.active ? (
              <div className="mb-3 bg-yellow-900/30 p-4 rounded-xl border-2 border-yellow-500">
                <p className="text-2xl text-yellow-400">⚽ Match en cours</p>
                <p className="text-lg text-gray-300">En attente des informations...</p>
              </div>
            ) : (
              <p className="text-2xl text-green-300">{barInfo ? barInfo.name : 'Quiz Buteur Live'}</p>
            )}
            
            {matchState && matchState.active && countdown && (
              <div className="space-y-2">
                <p className="text-xl text-yellow-400">⏱️ Prochaine question: {countdown}</p>
                <MatchClock />
              </div>
            )}
            {(!matchState || !matchState.active) && (
              <p className="text-gray-300 mt-2">Le match n'est pas démarré</p>
            )}
          </div>
          <div className="bg-white p-6 rounded-2xl ml-6">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} 
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
    
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">🎮 Admin - Gestion du Match</h1>
          
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">🔍 Rechercher un match</h2>
            <div className="flex gap-4 mb-4">
              <input
                type="text"
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
                placeholder="PSG, Real Madrid, Premier League..."
                className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && searchMatches()}
              />
              <button
                onClick={searchMatches}
                disabled={loadingMatches}
                className="bg-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-600"
              >
                {loadingMatches ? '⏳ Recherche...' : '🔍 Rechercher'}
              </button>
            </div>

            {selectedMatch && (
              <div className="bg-green-900 border-2 border-green-500 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {selectedMatch.homeLogo && (
                      <img src={selectedMatch.homeLogo} alt={selectedMatch.homeTeam} className="w-10 h-10 object-contain" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm text-green-300">{selectedMatch.league}</div>
                      <div className="text-xl font-bold">
                        {selectedMatch.homeTeam} <span className="text-green-400">{selectedMatch.score}</span> {selectedMatch.awayTeam}
                      </div>
                      <div className="text-sm text-gray-300">{selectedMatch.date}</div>
                    </div>
                    {selectedMatch.awayLogo && (
                      <img src={selectedMatch.awayLogo} alt={selectedMatch.awayTeam} className="w-10 h-10 object-contain" />
                    )}
                  </div>
                  <div className="text-green-400 text-2xl ml-4">✅ Sélectionné</div>
                </div>
              </div>
            )}

            {availableMatches.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableMatches.map(match => (
                  <div
                    key={match.id}
                    onClick={() => selectMatch(match)}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${
                      selectedMatch && selectedMatch.id === match.id
                        ? 'bg-green-800 border-2 border-green-500'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {match.homeLogo && (
                          <img src={match.homeLogo} alt={match.homeTeam} className="w-8 h-8 object-contain" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-blue-600 px-2 py-1 rounded">{match.league}</span>
                            <span className={`text-xs px-2 py-1 rounded ${
                              match.status === 'En cours' ? 'bg-red-600 animate-pulse' :
                              match.status === 'À venir' ? 'bg-yellow-600' :
                              'bg-gray-600'
                            }`}>
                              {match.status}
                            </span>
                          </div>
                          <div className="text-lg font-bold">
                            {match.homeTeam} <span className="text-blue-400 mx-2">{match.score}</span> {match.awayTeam}
                          </div>
                          <div className="text-sm text-gray-400">{match.date}</div>
                        </div>
                        {match.awayLogo && (
                          <img src={match.awayLogo} alt={match.awayTeam} className="w-8 h-8 object-contain" />
                        )}
                      </div>
                      <div className="text-2xl ml-4">⚽</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {availableMatches.length === 0 && !loadingMatches && (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">🔍</div>
                <p>Recherchez un match pour commencer</p>
                <p className="text-sm mt-2">Ex: "PSG", "Premier League", "Real Madrid"</p>
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Contrôle du Match</h2>
            
            {!matchState || !matchState.active ? (
              <div>
                <p className="text-gray-400 mb-4">
                  {selectedMatch 
                    ? `Prêt à démarrer : ${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}`
                    : 'Sélectionnez un match ci-dessus'}
                </p>
                {loadingPlayers && (
                  <p className="text-yellow-400 mb-4">⏳ Chargement des compositions...</p>
                )}
                {matchPlayers.length > 0 && (
                  <div className="mb-4 p-3 bg-green-900 rounded-lg">
                    <p className="text-green-300">✅ {matchPlayers.length} joueurs chargés</p>
                    <p className="text-sm text-gray-300 mt-1">Les questions utiliseront les vrais joueurs du match !</p>
                  </div>
                )}
                <div className="flex gap-4 flex-wrap">
                  <button
                    onClick={startMatch}
                    disabled={!selectedMatch}
                    className="bg-green-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
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
                {!selectedMatch && (
                  <p className="text-sm text-yellow-400 mt-3">⚠️ Sélectionnez d'abord un match ci-dessus</p>
                )}
                <p className="text-sm text-gray-400 mt-3">⚡ Questions toutes les 1 minute (15 secondes pour répondre)</p>
              </div>
            ) : (
              <div>
                <p className="text-xl mb-4 text-green-400">✅ Match en cours</p>
                {selectedMatch && (
                  <div className="bg-gray-700 rounded-lg p-3 mb-4 flex items-center gap-3">
                    {selectedMatch.homeLogo && (
                      <img src={selectedMatch.homeLogo} alt={selectedMatch.homeTeam} className="w-8 h-8 object-contain" />
                    )}
                    <div className="flex-1">
                      <div className="text-lg font-bold">{selectedMatch.homeTeam} vs {selectedMatch.awayTeam}</div>
                      <div className="text-sm text-gray-400">{selectedMatch.league}</div>
                    </div>
                    {selectedMatch.awayLogo && (
                      <img src={selectedMatch.awayLogo} alt={selectedMatch.awayTeam} className="w-8 h-8 object-contain" />
                    )}
                  </div>
                )}
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
