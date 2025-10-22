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

const QUESTION_INTERVAL = 60000;

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
  const [barId, setBarId] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('bar') || null;
  });
  const [barIdInput, setBarIdInput] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [allBars, setAllBars] = useState([]);
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
  const matchCheckInterval = useRef(null);

  const searchMatches = async () => {
    setLoadingMatches(true);

    try {
      const apiKey = import.meta.env.VITE_API_FOOTBALL_KEY;

      if (!apiKey) {
        alert('❌ Clé API non configurée');
        setLoadingMatches(false);
        return;
      }

      const response = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
        method: 'GET',
        headers: {
          'x-rapidapi-key': apiKey,
          'x-rapidapi-host': 'v3.football.api-sports.io'
        }
      });

      const data = await response.json();

      if (data.errors && Object.keys(data.errors).length > 0) {
        alert('❌ Erreur API: ' + JSON.stringify(data.errors));
        setLoadingMatches(false);
        return;
      }

      if (!data.response || data.response.length === 0) {
        const today = new Date().toISOString().split('T')[0];
        const responseToday = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
          method: 'GET',
          headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': 'v3.football.api-sports.io'
          }
        });

        const dataToday = await responseToday.json();

        if (dataToday.response && dataToday.response.length > 0) {
          const matches = dataToday.response
            .filter(fixture => {
              const status = fixture.fixture.status.short;
              // Exclure les matchs terminés (FT, AET, PEN, etc.)
              return !['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(status);
            })
            .slice(0, 20)
            .map(fixture => ({
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
          
          if (matches.length === 0) {
            alert('⚠️ Aucun match disponible (tous les matchs du jour sont terminés)');
          }
        } else {
          alert('⚠️ Aucun match trouvé');
          setAvailableMatches([]);
        }
      } else {
        const matches = data.response
          .filter(fixture => {
            const status = fixture.fixture.status.short;
            // Exclure les matchs terminés
            return !['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(status);
          })
          .slice(0, 20)
          .map(fixture => ({
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
        
        if (matches.length === 0) {
          alert('⚠️ Aucun match disponible (tous les matchs en direct sont terminés)');
        }
      }

    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    } finally {
      setLoadingMatches(false);
    }
  };

  const selectMatch = async (match) => {
    if (match.elapsed !== undefined) {
      setMatchElapsedMinutes(match.elapsed);
      setMatchStartTime(Date.now() - (match.elapsed * 60000));
      setMatchHalf(match.half || '1H');
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
        half: match.half || '1H',
        autoStartEnabled: true // Activation du démarrage auto
      };
      
      await set(ref(db, `bars/${barId}/selectedMatch`), matchData);
      await new Promise(resolve => setTimeout(resolve, 500));
      setSelectedMatch(matchData);
      
      // Lancer la surveillance du match
      startMatchMonitoring(match.id);
      
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    }
    
    await loadMatchLineups(match.id);
  };

  const loadMatchLineups = async (fixtureId) => {
    setLoadingPlayers(true);
    
    try {
      const apiKey = import.meta.env.VITE_API_FOOTBALL_KEY;
      
      if (!apiKey) {
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
        
        setMatchPlayers(allPlayers);
      } else {
        setMatchPlayers([]);
      }
      
    } catch (e) {
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
    if (barId) loadBarInfo(barId);
    
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const barFromUrl = urlParams.get('bar');
    
    if (barFromUrl && !barId) {
      setBarId(barFromUrl);
    }
    
    if (path === '/play' || path.includes('/play')) {
      setScreen('playJoin');
    }

    // Nettoyage à la fermeture
    return () => {
      stopMatchMonitoring();
    };
  }, []);

  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && (screen === 'tv' || screen === 'mobile')) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          wakeLockRef.current.addEventListener('release', () => {});
        } catch (err) {
          console.error('Erreur Wake Lock:', err);
        }
      }
    };

    const releaseWakeLock = () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
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
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        const userRef = ref(db, `users/${currentUser.uid}`);
        const snap = await get(userRef);
        setUserProfile(snap.exists() ? snap.val() : null);
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!barId) return;
    
    const matchStateRef = ref(db, `bars/${barId}/matchState`);
    
    const unsub = onValue(matchStateRef, (snap) => {
      const state = snap.val();
      setMatchState(state);
      setCurrentMatchId(state?.currentMatchId || null);
    });
    
    return () => unsub();
  }, [barId]);

  useEffect(() => {
    if (!barId || screen !== 'tv') return;
    
    const selectedMatchRef = ref(db, `bars/${barId}/selectedMatch`);
    
    const unsub = onValue(selectedMatchRef, (snap) => {
      if (snap.exists()) {
        const match = snap.val();
        setSelectedMatch(match);
        
        if (match.elapsed !== undefined) {
          setMatchElapsedMinutes(match.elapsed);
          setMatchStartTime(Date.now() - (match.elapsed * 60000));
          setMatchHalf(match.half || '1H');
        }
      }
    });
    
    return () => unsub();
  }, [barId, screen]);

  useEffect(() => {
    if (!barId || !currentMatchId) {
      setPlayers([]);
      return;
    }
    
    const playersRef = ref(db, `bars/${barId}/matches/${currentMatchId}/players`);
    
    const unsub = onValue(playersRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list = Object.entries(data).map(([id, p]) => ({ id, ...p }));
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
        setTimeLeft(data.timeLeft || 15);
        
        if (screen === 'mobile' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('🏀 Nouvelle question !', {
            body: data.text,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200],
            tag: 'quiz-question',
            requireInteraction: true
          });
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
            setTimeout(() => setNotification(null), 5000);
            setTimeout(() => remove(ref(db, `bars/${barId}/notifications/${notifKey}`)), 10000);
          }
        }
      }
    });
    return () => unsub();
  }, [barId, screen]);

  useEffect(() => {
    const addPlayerToMatch = async () => {
      if (!user || !barId || !currentMatchId || !userProfile || screen !== 'mobile') return;

      try {
        const playerPath = `bars/${barId}/matches/${currentMatchId}/players/${user.uid}`;
        const playerRef = ref(db, playerPath);
        const playerSnap = await get(playerRef);
        
        if (!playerSnap.exists()) {
          await set(playerRef, {
            pseudo: userProfile.pseudo,
            score: 0,
            joinedAt: Date.now()
          });
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const notifRef = push(ref(db, `bars/${barId}/notifications`));
          await set(notifRef, {
            type: 'playerJoined',
            pseudo: userProfile.pseudo,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        console.error('Erreur ajout joueur:', e);
      }
    };
    
    addPlayerToMatch();
  }, [user, barId, currentMatchId, userProfile, screen]);

  useEffect(() => {
    if (!currentQuestion?.id || !currentQuestion?.createdAt) return;
    
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
  }, [matchState]);

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
      
      const userRef = ref(db, `users/${userCredential.user.uid}`);
      const snap = await get(userRef);
      
      if (!snap.exists()) {
        await set(userRef, {
          email: userCredential.user.email,
          pseudo: email.split('@')[0],
          totalPoints: 0,
          matchesPlayed: 0,
          createdAt: Date.now()
        });
        alert('✅ Profil créé !');
      }
      
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification('🎉 Notifications activées !', {
            body: 'Vous serez alerté à chaque nouvelle question',
            icon: '/icon-192.png'
          });
        }
      }
      
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
    if (!barId) {
      alert('❌ Erreur : Aucun bar sélectionné.\n\nRetournez à l\'accueil et connectez-vous avec votre code bar.');
      return;
    }
    
    try {
      // 🔥 SYNCHRONISATION AVEC L'API EN TEMPS RÉEL
      console.log('🔄 Synchronisation avec l\'API...');
      let realTimeElapsed = selectedMatch?.elapsed || 0;
      let realTimeHalf = selectedMatch?.half || '1H';
      let realTimeScore = selectedMatch?.score || 'vs';
      
      if (selectedMatch?.id) {
        const apiKey = import.meta.env.VITE_API_FOOTBALL_KEY;
        if (apiKey) {
          try {
            const response = await fetch(`https://v3.football.api-sports.io/fixtures?id=${selectedMatch.id}`, {
              method: 'GET',
              headers: {
                'x-rapidapi-key': apiKey,
                'x-rapidapi-host': 'v3.football.api-sports.io'
              }
            });
            
            const data = await response.json();
            
            if (data.response && data.response.length > 0) {
              const fixture = data.response[0];
              realTimeElapsed = fixture.fixture.status.elapsed || 0;
              realTimeHalf = fixture.fixture.status.short;
              realTimeScore = `${fixture.goals.home || 0}-${fixture.goals.away || 0}`;
              
              console.log(`✅ Synchro réussie : ${realTimeElapsed}' - ${realTimeHalf} - ${realTimeScore}`);
            }
          } catch (apiError) {
            console.warn('⚠️ Impossible de synchroniser, utilisation des données locales', apiError);
          }
        }
      }
      
      const allMatchesSnap = await get(ref(db, `bars/${barId}/matches`));
      if (allMatchesSnap.exists()) {
        await remove(ref(db, `bars/${barId}/matches`));
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
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const now = Date.now();
      const matchId = `match_${now}`;
      
      // 🔥 CALCUL DU TEMPS DE DÉPART BASÉ SUR LE TEMPS RÉEL
      const clockStartTime = now - (realTimeElapsed * 60000);
      
      console.log(`⏱️ Chrono configuré : ${realTimeElapsed}' écoulées, démarrage à ${new Date(clockStartTime).toLocaleTimeString()}`);
      
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
          score: realTimeScore // Score en temps réel
        } : null,
        matchClock: {
          startTime: clockStartTime, // Temps calculé avec l'elapsed réel
          elapsedMinutes: realTimeElapsed, // Minutes réelles
          half: realTimeHalf // Mi-temps réelle
        }
      };
      
      await set(ref(db, `bars/${barId}/matchState`), newMatchState);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await set(ref(db, `bars/${barId}/matches/${matchId}`), {
        info: {
          startedAt: now,
          status: 'active',
          realElapsed: realTimeElapsed
        },
        players: {}
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const verifyState = await get(ref(db, `bars/${barId}/matchState`));
      const verifyMatch = await get(ref(db, `bars/${barId}/matches/${matchId}`));
      
      if (verifyState.exists() && verifyMatch.exists()) {
        alert(`✅ Match démarré !\n\n⏱️ Temps synchronisé : ${realTimeElapsed}'\nMi-temps : ${realTimeHalf}\nScore : ${realTimeScore}`);
      } else {
        throw new Error('Vérification échouée');
      }
      
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
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
      
      stopMatchMonitoring();
      
      setCurrentMatchId(null);
      setPlayers([]);
      setCurrentQuestion(null);
      
      alert('✅ Match arrêté !');
    } catch (e) {
      alert('Erreur: ' + e.message);
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

      let questionToUse;
      
      if (matchPlayers.length >= 4) {
        const shuffled = [...matchPlayers].sort(() => 0.5 - Math.random());
        const selectedPlayers = shuffled.slice(0, 4);
        
        const questionTypes = [
          { text: "Qui va marquer le prochain but ?", options: selectedPlayers.map(p => p.name.split(' ').pop()) },
          { text: "Quel joueur va faire la prochaine passe décisive ?", options: selectedPlayers.map(p => p.name.split(' ').pop()) },
          { text: "Qui va avoir le prochain carton ?", options: selectedPlayers.map(p => p.name.split(' ').pop()) },
          { text: "Quel joueur va tenter le prochain tir ?", options: selectedPlayers.map(p => p.name.split(' ').pop()) }
        ];
        
        questionToUse = questionTypes[Math.floor(Math.random() * questionTypes.length)];
      } else {
        const availableQuestions = QUESTIONS.filter(q => !usedQuestionsRef.current.includes(q.text));
        
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
    if (!barId || !currentQuestion?.options || isProcessingRef.current) return;
    
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
      
      if (matchState?.active) {
        await update(ref(db, `bars/${barId}/matchState`), {
          nextQuestionTime: Date.now() + QUESTION_INTERVAL
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
    if (!window.confirm('⚠️ Supprimer TOUT et réinitialiser ?')) return;
    
    try {
      await remove(ref(db, `bars/${barId}/matches`));
      await remove(ref(db, `bars/${barId}/matchState`));
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/answers`));
      await remove(ref(db, `bars/${barId}/notifications`));
      await remove(ref(db, `bars/${barId}/selectedMatch`));
      
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
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert('✅ Nettoyage terminé !');
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    }
  };

  const debugFirebase = async () => {
    console.log('🔍 DEBUG FIREBASE');
    try {
      const matchStateSnap = await get(ref(db, `bars/${barId}/matchState`));
      console.log('matchState:', matchStateSnap.val());
      
      const selectedMatchSnap = await get(ref(db, `bars/${barId}/selectedMatch`));
      console.log('selectedMatch:', selectedMatchSnap.val());
      
      const matchesSnap = await get(ref(db, `bars/${barId}/matches`));
      console.log('matches:', matchesSnap.val());
      
      if (currentMatchId) {
        const playersSnap = await get(ref(db, `bars/${barId}/matches/${currentMatchId}/players`));
        console.log('players:', playersSnap.val());
      }
      
      alert('✅ Voir console');
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    }
  };

  const generateBarCode = () => {
    return 'BAR-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createNewBar = async (barName) => {
    const barCode = generateBarCode();
    const newBarData = {
      code: barCode,
      name: barName,
      createdAt: Date.now(),
      active: true
    };
    
    try {
      await set(ref(db, `bars/${barCode}/info`), newBarData);
      alert(`✅ Bar créé !\n\nNom : ${barName}\nCode : ${barCode}\n\nDonnez ce code à votre client.`);
      await loadAllBars();
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    }
  };

  const loadAllBars = async () => {
    try {
      const barsSnap = await get(ref(db, 'bars'));
      if (barsSnap.exists()) {
        const barsData = barsSnap.val();
        const barsList = Object.entries(barsData).map(([id, data]) => ({
          id,
          ...data.info
        }));
        setAllBars(barsList);
      }
    } catch (e) {
      console.error('Erreur chargement bars:', e);
    }
  };

  const verifyBarCode = async (code) => {
    try {
      const barSnap = await get(ref(db, `bars/${code}/info`));
      return barSnap.exists();
    } catch (e) {
      return false;
    }
  };

  const startMatchMonitoring = (fixtureId) => {
    // Arrêter toute surveillance précédente
    if (matchCheckInterval.current) {
      clearInterval(matchCheckInterval.current);
    }

    // Vérifier toutes les 30 secondes si le match a commencé
    matchCheckInterval.current = setInterval(async () => {
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
        
        if (data.response && data.response.length > 0) {
          const fixture = data.response[0];
          const status = fixture.fixture.status.short;
          const elapsed = fixture.fixture.status.elapsed || 0;

          // Si le match a commencé (statut 1H, 2H, HT, ET, etc.) et qu'il n'y a pas de match actif
          if (elapsed > 0 && !matchState?.active && ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status)) {
            console.log('🚀 Match détecté comme commencé ! Démarrage automatique...');
            
            // Mettre à jour les infos du match
            const updatedMatchData = {
              ...selectedMatch,
              elapsed: elapsed,
              half: status,
              score: `${fixture.goals.home || 0}-${fixture.goals.away || 0}`
            };
            
            await set(ref(db, `bars/${barId}/selectedMatch`), updatedMatchData);
            setSelectedMatch(updatedMatchData);
            setMatchElapsedMinutes(elapsed);
            setMatchStartTime(Date.now() - (elapsed * 60000));
            setMatchHalf(status);
            
            // Démarrer automatiquement
            await startMatch();
            
            // Arrêter la surveillance
            clearInterval(matchCheckInterval.current);
            matchCheckInterval.current = null;
          }
        }
      } catch (e) {
        console.error('Erreur surveillance match:', e);
      }
    }, 30000); // Vérifier toutes les 30 secondes
  };

  const stopMatchMonitoring = () => {
    if (matchCheckInterval.current) {
      clearInterval(matchCheckInterval.current);
      matchCheckInterval.current = null;
    }
  };

  const MatchClock = () => {
    const [time, setTime] = useState('');
    const [phase, setPhase] = useState('');
    
    useEffect(() => {
      const updateTime = () => {
        // 🔥 TOUJOURS utiliser matchState.matchClock en priorité (synchronisé avec l'API)
        let clockStartTime = matchState?.matchClock?.startTime;
        let clockHalf = matchState?.matchClock?.half;
        
        if (clockHalf === 'FT') {
          setTime('90\'00');
          setPhase('TERMINÉ');
          return;
        }
        
        if (clockStartTime) {
          // Calcul du temps écoulé depuis le startTime synchronisé
          const totalElapsedMs = Date.now() - clockStartTime;
          const elapsed = Math.floor(totalElapsedMs / 60000);
          const secs = Math.floor(totalElapsedMs / 1000) % 60;
          
          let displayTime;
          if (elapsed < 90) {
            displayTime = `${elapsed}'${secs.toString().padStart(2, '0')}`;
          } else {
            displayTime = `90'+${elapsed - 90 + 1}`;
          }
          
          setTime(displayTime);
          
          // Déterminer la phase
          if (clockHalf === 'HT') {
            setPhase('MI-TEMPS');
          } else if (elapsed >= 45 && (clockHalf === '2H' || elapsed >= 45)) {
            setPhase('2MT');
          } else {
            setPhase('1MT');
          }
        } else {
          // Fallback si pas de données
          setTime('0\'00');
          setPhase('1MT');
        }
      };
      
      updateTime();
      const iv = setInterval(updateTime, 1000);
      return () => clearInterval(iv);
    }, [matchState]);

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
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">🏀</div>
          <h1 className="text-6xl font-black text-white mb-4">QUIZ BUTEUR</h1>
          <p className="text-2xl text-green-200">Pronostics en temps réel</p>
        </div>
        
        <div className="flex gap-6">
          <button 
            onClick={() => setScreen('adminLogin')}
            className="bg-green-700 text-white px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-600 transition-all shadow-2xl border-4 border-white"
          >
            🎮 ADMIN BAR
          </button>
          <button 
            onClick={() => setScreen('superAdminLogin')}
            className="bg-yellow-600 text-white px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-yellow-500 transition-all shadow-2xl border-4 border-white"
          >
            👑 SUPER ADMIN
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'superAdminLogin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-900 via-orange-900 to-red-900 flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">👑</div>
            <h2 className="text-3xl font-black text-yellow-900 mb-2">SUPER ADMIN</h2>
            <p className="text-gray-600">Gestion des établissements</p>
          </div>

          <input
            type="password"
            value={superAdminPassword}
            onChange={(e) => setSuperAdminPassword(e.target.value)}
            placeholder="Mot de passe super admin"
            className="w-full px-6 py-4 text-xl border-4 border-yellow-900 rounded-xl mb-6 focus:outline-none focus:border-yellow-600 text-center font-bold"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && superAdminPassword === 'ADMIN2025') {
                setScreen('superAdmin');
                loadAllBars();
              }
            }}
          />

          <button
            onClick={() => {
              if (superAdminPassword === 'ADMIN2025') {
                setScreen('superAdmin');
                loadAllBars();
              } else {
                alert('❌ Mot de passe incorrect');
              }
            }}
            className="w-full bg-yellow-900 text-white py-4 rounded-xl text-xl font-bold hover:bg-yellow-800 mb-4"
          >
            CONNEXION 🔐
          </button>

          <button
            onClick={() => setScreen('home')}
            className="w-full text-gray-600 py-2 text-sm underline"
          >
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'superAdmin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-900 via-orange-900 to-red-900 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-5xl font-black text-white mb-2">👑 SUPER ADMIN</h1>
              <p className="text-yellow-300 text-xl">Gestion des établissements</p>
            </div>
            <button
              onClick={() => {
                setSuperAdminPassword('');
                setScreen('home');
              }}
              className="bg-red-600 px-6 py-3 rounded-lg text-white font-bold hover:bg-red-700"
            >
              🚪 Déconnexion
            </button>
          </div>

          <div className="bg-white rounded-2xl p-8 mb-6 shadow-2xl">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">➕ Créer un nouveau bar</h2>
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Nom du bar (ex: Le Penalty Paris)"
                className="flex-1 px-6 py-4 text-xl border-4 border-gray-300 rounded-xl focus:outline-none focus:border-yellow-600"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    createNewBar(e.target.value.trim());
                    e.target.value = '';
                  }
                }}
                id="newBarName"
              />
              <button
                onClick={() => {
                  const input = document.getElementById('newBarName');
                  if (input.value.trim()) {
                    createNewBar(input.value.trim());
                    input.value = '';
                  }
                }}
                className="bg-yellow-600 text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-yellow-700"
              >
                CRÉER 🚀
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">📋 Liste des bars ({allBars.length})</h2>
            
            {allBars.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-6xl mb-4">🏪</div>
                <p className="text-xl">Aucun bar créé pour le moment</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allBars.map(bar => (
                  <div key={bar.id} className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-6 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-3xl">🏪</div>
                        <div>
                          <h3 className="text-2xl font-bold text-gray-900">{bar.name}</h3>
                          <p className="text-sm text-gray-500">
                            Créé le {new Date(bar.createdAt).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-center bg-white px-6 py-4 rounded-xl border-2 border-yellow-600">
                      <div className="text-sm text-gray-500 mb-1">Code d'accès</div>
                      <div className="text-3xl font-black text-yellow-900">{bar.code || bar.id}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setScreen('home')}
            className="mt-6 bg-gray-700 text-white px-6 py-3 rounded-lg hover:bg-gray-600"
          >
            ← Retour accueil
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'adminLogin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🎮</div>
            <h2 className="text-3xl font-black text-green-900 mb-2">ADMIN BAR</h2>
            <p className="text-gray-600">Entrez votre code d'accès</p>
          </div>

          <input
            type="text"
            value={barIdInput}
            onChange={(e) => setBarIdInput(e.target.value.toUpperCase())}
            placeholder="BAR-XXXXX"
            className="w-full px-6 py-4 text-xl border-4 border-green-900 rounded-xl mb-6 focus:outline-none focus:border-green-600 text-center font-bold uppercase"
            maxLength={10}
            onKeyPress={async (e) => {
              if (e.key === 'Enter' && barIdInput.trim()) {
                const code = barIdInput.trim().toUpperCase();
                const isValid = await verifyBarCode(code);
                if (isValid) {
                  setBarId(code);
                  setScreen('admin');
                } else {
                  alert('❌ Code invalide.\n\nContactez votre fournisseur pour obtenir votre code d\'accès.');
                }
              }
            }}
          />

          <button
            onClick={async () => {
              if (barIdInput.trim()) {
                const code = barIdInput.trim().toUpperCase();
                const isValid = await verifyBarCode(code);
                if (isValid) {
                  setBarId(code);
                  setScreen('admin');
                } else {
                  alert('❌ Code invalide.\n\nContactez votre fournisseur pour obtenir votre code d\'accès.');
                }
              } else {
                alert('Veuillez entrer votre code d\'accès');
              }
            }}
            className="w-full bg-green-900 text-white py-4 rounded-xl text-xl font-bold hover:bg-green-800 mb-4"
          >
            SE CONNECTER 🚀
          </button>

          <button
            onClick={() => setScreen('home')}
            className="w-full text-gray-600 py-2 text-sm underline"
          >
            ← Retour
          </button>

          <div className="mt-6 p-4 bg-green-100 rounded-lg text-sm text-gray-700">
            <p className="font-bold mb-2">💡 Vous n'avez pas de code ?</p>
            <p>Contactez votre fournisseur Quiz Buteur pour obtenir votre code d'accès unique.</p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'playJoin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">🏀</div>
          <h1 className="text-5xl font-black text-white mb-4">{barInfo?.name || 'Quiz Buteur Live'}</h1>
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
            {authMode === 'login' ? 'SE CONNECTER' : "S'INSCRIRE"} 🏀
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
    const score = myScore?.score || 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 p-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl p-6 mb-6 text-center">
            <div className="text-sm text-gray-500">{barInfo?.name || ''}</div>
            <div className="text-green-700 text-lg font-semibold">{userProfile?.pseudo || ''}</div>
            <div className="text-4xl font-black text-green-900">{score} pts</div>
            <div className="text-sm text-gray-500 mt-2">Total: {userProfile?.totalPoints || 0} pts</div>
            <button onClick={handleLogout} className="mt-3 text-red-600 text-sm underline">
              Déconnexion
            </button>
                      </div>

          {currentQuestion?.text && currentQuestion?.options ? (
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
              <div className="text-6xl mb-4">🏀</div>
              <p className="text-2xl text-gray-600 font-semibold mb-4">Match en cours...</p>
              {matchState?.active && countdown && (
                <p className="text-lg text-gray-500">Prochaine question dans {countdown}</p>
              )}
              {(!matchState || !matchState.active) && (
                <p className="text-lg text-gray-500">En attente du démarrage</p>
            )}
          </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'tv') {
    if (!barId) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex items-center justify-center p-8">
          <div className="bg-white rounded-3xl p-10 max-w-2xl w-full shadow-2xl text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-3xl font-black text-red-900 mb-4">AUCUN BAR SÉLECTIONNÉ</h2>
            <p className="text-gray-600 mb-6 text-xl">
              Vous devez accéder à cet écran depuis l'admin avec un code bar valide.
            </p>
            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 mb-6">
              <p className="text-blue-900 font-bold mb-2">💡 Comment faire ?</p>
              <ol className="text-left text-blue-800 space-y-2">
                <li>1. Retournez à l'accueil</li>
                <li>2. Cliquez sur "🎮 ADMIN BAR"</li>
                <li>3. Entrez votre code (ex: BAR-TEX9MJ)</li>
                <li>4. Cliquez sur "📺 Voir écran TV"</li>
              </ol>
            </div>
            <button 
              onClick={() => {
                window.location.href = '/';
              }}
              className="bg-green-900 text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-green-800"
            >
              ← Retour à l'accueil
            </button>
          </div>
        </div>
      );
    }

    const qrUrl = `${window.location.origin}/play?bar=${barId}`;
    const matchInfo = selectedMatch || matchState?.matchInfo;
    const hasMatchInfo = matchInfo?.homeTeam && matchInfo?.awayTeam;
    
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
                <p className="text-2xl text-yellow-400">🏀 Match en cours</p>
      </div>
            ) : (
              <p className="text-2xl text-green-300">{barInfo?.name || 'Quiz Buteur Live'}</p>
            )}
            
            {matchState?.active && countdown && (
              <div className="space-y-2">
                <p className="text-xl text-yellow-400">⏱️ Prochaine: {countdown}</p>
                <MatchClock />
          </div>
            )}
            {(!matchState || !matchState.active) && (
              <p className="text-gray-300 mt-2">Match non démarré</p>
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
    if (!barId) {
      setScreen('adminLogin');
      return null;
    }

    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold">🎮 Admin</h1>
              <p className="text-green-400 text-lg mt-2">📍 Bar : <span className="font-bold">{barId}</span></p>
            </div>
            <button
              onClick={() => {
                setBarId(null);
                setScreen('home');
              }}
              className="bg-red-600 px-6 py-3 rounded-lg hover:bg-red-700"
            >
              🚪 Changer de bar
            </button>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">🔍 Rechercher un match</h2>
            <div className="flex gap-4 mb-4">
              <input
                type="text"
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
                placeholder="PSG, Real Madrid..."
                className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg"
                onKeyPress={(e) => e.key === 'Enter' && searchMatches()}
              />
              <button
                onClick={searchMatches}
                disabled={loadingMatches}
                className="bg-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-600"
              >
                {loadingMatches ? '⏳' : '🔍 Rechercher'}
              </button>
            </div>

            {selectedMatch && (
              <div className="bg-green-900 border-2 border-green-500 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  {selectedMatch.homeLogo && <img src={selectedMatch.homeLogo} alt="" className="w-10 h-10" />}
                  <div className="flex-1">
                    <div className="text-xl font-bold">
                      {selectedMatch.homeTeam} {selectedMatch.score} {selectedMatch.awayTeam}
          </div>
                    <div className="text-sm text-gray-300">{selectedMatch.league}</div>
                  </div>
                  {selectedMatch.awayLogo && <img src={selectedMatch.awayLogo} alt="" className="w-10 h-10" />}
                  <div className="text-green-400 text-2xl">✅</div>
                </div>
              </div>
            )}

            {availableMatches.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableMatches.map(match => {
                  const isLive = match.elapsed && match.elapsed > 0;
                  const isUpcoming = !match.elapsed || match.elapsed === 0;
                  
                  return (
                    <div
                      key={match.id}
                      onClick={() => selectMatch(match)}
                      className={`p-4 rounded-lg transition-all ${
                        isUpcoming 
                          ? 'bg-gray-800 opacity-60 cursor-not-allowed'
                          : selectedMatch?.id === match.id 
                            ? 'bg-green-800 border-2 border-green-500 cursor-pointer' 
                            : 'bg-gray-700 hover:bg-gray-600 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {match.homeLogo && <img src={match.homeLogo} alt="" className="w-8 h-8" />}
                    <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-blue-600 px-2 py-1 rounded">
                              {match.league}
                            </span>
                            {isLive && (
                              <span className="text-xs bg-red-600 px-2 py-1 rounded font-bold animate-pulse">
                                🔴 LIVE {match.elapsed}'
                              </span>
                            )}
                            {isUpcoming && (
                              <span className="text-xs bg-yellow-600 px-2 py-1 rounded font-bold">
                                ⏰ À VENIR
                              </span>
                            )}
                          </div>
                          <div className="text-lg font-bold">
                            {match.homeTeam} {match.score} {match.awayTeam}
                          </div>
                          <div className="text-sm text-gray-400">{match.date}</div>
                        </div>
                        {match.awayLogo && <img src={match.awayLogo} alt="" className="w-8 h-8" />}
                        {isUpcoming && <div className="text-2xl ml-4">🔒</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Contrôle</h2>
            
            {!matchState?.active ? (
                        <div>
                <p className="text-gray-400 mb-4">
                  {selectedMatch ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}` : 'Sélectionnez un match'}
                          </p>
                {loadingPlayers && <p className="text-yellow-400 mb-4">⏳ Chargement...</p>}
                {matchPlayers.length > 0 && (
                  <div className="mb-4 p-3 bg-green-900 rounded-lg">
                    <p className="text-green-300">✅ {matchPlayers.length} joueurs chargés</p>
                        </div>
                )}
                <div className="flex gap-4 flex-wrap">
                  <button
                    onClick={startMatch}
                    disabled={!selectedMatch}
                    className="bg-green-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-green-700 disabled:bg-gray-600"
                  >
                    🏀 Démarrer
                  </button>
                  <button onClick={forceCleanup} className="bg-orange-600 px-8 py-4 rounded-lg font-bold hover:bg-orange-700">
                    🧹 Nettoyage
                  </button>
                  <button onClick={debugFirebase} className="bg-purple-600 px-8 py-4 rounded-lg font-bold hover:bg-purple-700">
                    🔍 Debug
                  </button>
                      </div>
                    </div>
            ) : (
              <div>
                <p className="text-xl mb-4 text-green-400">✅ Match en cours</p>
                <p className="text-lg mb-2">Joueurs: {players.length}</p>
                {currentQuestion?.text && <p className="text-yellow-400 mb-2">📢 {currentQuestion.text}</p>}
                <div className="flex gap-4 flex-wrap">
                  <button onClick={stopMatch} className="bg-red-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-red-700">
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
                    className="bg-blue-600 px-8 py-4 rounded-lg font-bold hover:bg-blue-700"
                  >
                    🎲 Question
                      </button>
                    </div>
              </div>
            )}
          </div>

          {currentQuestion?.options && (
            <div className="bg-gray-800 rounded-xl p-6 mb-6">
              <h2 className="text-2xl font-bold mb-4">Votes</h2>
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
            <h2 className="text-2xl font-bold mb-4">Joueurs ({players.length})</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {players.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Aucun joueur</p>
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
            <button onClick={() => setScreen('home')} className="bg-gray-700 px-6 py-3 rounded-lg">
              ← Retour
          </button>
            <button onClick={() => setScreen('tv')} className="bg-blue-600 px-6 py-3 rounded-lg">
              📺 TV
            </button>
            <button 
              onClick={() => setScreen('tv')}
              className="bg-white text-green-900 px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-100 transition-all shadow-2xl"
            >
              📺 ÉCRAN
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
