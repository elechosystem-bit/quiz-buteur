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
  // State
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

  // Refs
  const usedQuestionsRef = useRef([]);
  const isProcessingRef = useRef(false);
  const nextQuestionTimer = useRef(null);
  const wakeLockRef = useRef(null);
  const matchCheckInterval = useRef(null);

  // Utilities
  const generateBarCode = () => 'BAR-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  // 1) createNewBar: validation, trim, console.logs
  const createNewBar = async (barName) => {
    const name = (barName || '').trim();
    console.log('[createNewBar] called with:', barName, '-> trimmed:', name);

    if (!name) {
      console.warn('[createNewBar] invalid name (empty after trim)');
      alert('❌ Veuillez saisir un nom de bar valide');
      return;
    }

    const barCode = generateBarCode();
    const newBarData = {
      code: barCode,
      name,
      createdAt: Date.now(),
      active: true
    };

    try {
      console.log('[createNewBar] creating bar:', { barCode, newBarData });
      await set(ref(db, `bars/${barCode}/info`), newBarData);
      console.log('[createNewBar] bar created successfully:', barCode);
      alert(`✅ Bar créé !\n\nNom : ${name}\nCode : ${barCode}\n\nDonnez ce code à votre client.`);
      await loadAllBars();
    } catch (e) {
      console.error('[createNewBar] error:', e);
      alert('❌ Erreur: ' + e.message);
    }
  };

  // 2) loadAllBars: handle data.info or data directly + logs
  const loadAllBars = async () => {
    console.log('[loadAllBars] fetching bars ...');
    try {
      const barsSnap = await get(ref(db, 'bars'));
      const exists = barsSnap.exists();
      console.log('[loadAllBars] snapshot exists:', exists);

      if (exists) {
        const barsData = barsSnap.val();
        console.log('[loadAllBars] raw data keys:', Object.keys(barsData || {}));

        const barsList = Object.entries(barsData).map(([id, data]) => {
          const info = data?.info || data || {};
          return {
            id,
            code: info.code || id,
            name: info.name || '(Sans nom)',
            createdAt: info.createdAt || 0,
            active: typeof info.active === 'boolean' ? info.active : true
          };
        });

        console.log('[loadAllBars] parsed bars count:', barsList.length, barsList);
        setAllBars(barsList);
      } else {
        console.log('[loadAllBars] no bars found');
        setAllBars([]);
      }
    } catch (e) {
      console.error('[loadAllBars] error:', e);
    }
  };

  // deleteBar: super admin action to remove a bar
  const deleteBar = async (id) => {
    if (!id) return;
    if (!window.confirm('⚠️ Supprimer cet établissement et toutes ses données ?')) return;

    try {
      console.log('[deleteBar] deleting bar:', id);
      await remove(ref(db, `bars/${id}`));
      setAllBars(prev => prev.filter(b => b.id !== id));
      try {
        await loadAllBars();
      } catch (e) {
        console.warn('[deleteBar] reload failed', e);
      }
      alert('✅ Établissement supprimé');
    } catch (e) {
      console.error('[deleteBar] error:', e);
      alert('❌ Erreur suppression: ' + e.message);
    }
  };

  // verifyBarCode for admin login
  const verifyBarCode = async (code) => {
    try {
      const barSnap = await get(ref(db, `bars/${code}/info`));
      return barSnap.exists();
    } catch (e) {
      return false;
    }
  };

  // searchMatches: fetch live fixtures / fallback to today, cleaned up
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
              // Exclude finished/cancelled statuses
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
              score: fixture.fixture.status.short === 'NS' ? 'vs' : `${fixture.goals.home || 0}-${fixture.goals.away || 0}`
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

  // selectMatch, loadMatchLineups, loadBarInfo (kept as before)
  const selectMatch = async (match) => {
    setSelectedMatch(match);
    console.log('⚽ Match sélectionné:', match);
    
    // Configurer l'horloge du match
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
        half: match.half || '1H',
        autoStartEnabled: true
      };
      
      await set(ref(db, `bars/${barId}/selectedMatch`), matchData);
      await new Promise(resolve => setTimeout(resolve, 500));
      setSelectedMatch(matchData);
      
      // Start monitoring
      startMatchMonitoring(match.id);
      
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    }
    
    // Récupérer les compositions d'équipes
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

  // Auth listener
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

  // Load bars when superAdmin screen is accessed
  useEffect(() => {
    if (screen === 'superAdmin') {
      loadAllBars();
    }
  }, [screen]);

  // 🔄 SYNCHRONISATION AUTOMATIQUE AVEC L'API FOOTBALL
  useEffect(() => {
    if (!selectedMatch || !matchState?.active) {
      console.log('⏹️ Pas de synchronisation - match non sélectionné ou inactif');
      return;
    }

    console.log('🔄 Démarrage de la synchronisation avec l\'API Football');
    
    const syncWithAPI = async () => {
      try {
        const apiKey = import.meta.env.VITE_API_FOOTBALL_KEY;
        
        if (!apiKey) {
          console.error('❌ Clé API manquante pour la synchronisation');
          return;
        }

        // Récupérer les données en direct du match
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
          console.log('📡 Données match reçues:', fixture);

          // Mettre à jour le score
          const newScore = `${fixture.goals.home || 0}-${fixture.goals.away || 0}`;
          const oldScore = selectedMatch.score;
          
          if (newScore !== oldScore) {
            console.log('⚽ BUT ! Score mis à jour:', oldScore, '→', newScore);
            
            // Mettre à jour le match sélectionné
            setSelectedMatch(prev => ({
              ...prev,
              score: newScore
            }));

            // Mettre à jour dans Firebase
            if (currentMatchId && barId) {
              await update(ref(db, `bars/${barId}/matchState`), {
                matchInfo: {
                  ...matchState.matchInfo,
                  score: newScore
                }
              });

              // Envoyer une notification de but
              const notifRef = push(ref(db, `bars/${barId}/notifications`));
              await set(notifRef, {
                type: 'goal',
                message: `⚽ BUT ! ${fixture.teams.home.name} ${newScore} ${fixture.teams.away.name}`,
                timestamp: Date.now()
              });

              console.log('🎉 Notification de but envoyée !');
            }
          }

          // Mettre à jour l'horloge du match
          if (fixture.fixture.status.elapsed !== undefined) {
            const newElapsed = fixture.fixture.status.elapsed;
            const newHalf = fixture.fixture.status.short;
            
            setMatchElapsedMinutes(newElapsed);
            setMatchStartTime(Date.now() - (newElapsed * 60000));
            setMatchHalf(newHalf);

            // Mettre à jour dans Firebase
            if (currentMatchId && barId) {
              await update(ref(db, `bars/${barId}/matchState`), {
                matchClock: {
                  startTime: Date.now() - (newElapsed * 60000),
                  elapsedMinutes: newElapsed,
                  half: newHalf
                }
              });
            }

            console.log('⏱️ Horloge synchronisée:', newElapsed, 'min -', newHalf);
          }

          // Détecter les événements récents (cartons, remplacements, etc.)
          if (fixture.events && Array.isArray(fixture.events)) {
            const recentEvents = fixture.events.slice(-3); // 3 derniers événements
            
            recentEvents.forEach(event => {
              console.log('📢 Événement détecté:', event.type, '-', event.player?.name);
              
              // Vous pouvez générer des questions basées sur ces événements
              if (event.type === 'Card' && event.detail === 'Yellow Card') {
                console.log('🟨 Carton jaune pour:', event.player?.name);
              } else if (event.type === 'subst') {
                console.log('🔄 Remplacement:', event.player?.name, '→', event.assist?.name);
              }
            });
          }

          console.log('✅ Synchronisation terminée');
        }
        
      } catch (e) {
        console.error('❌ Erreur synchronisation API:', e);
      }
    };

    // Synchroniser immédiatement
    syncWithAPI();

    // Puis toutes les 30 secondes
    const syncInterval = setInterval(syncWithAPI, 30000);

    return () => {
      console.log('⏹️ Arrêt de la synchronisation API');
      clearInterval(syncInterval);
    };
  }, [selectedMatch, matchState?.active, currentMatchId, barId]);

  // When barId changes, load info and setup matchState listener
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

    // Cleanup
    return () => {
      stopMatchMonitoring();
    };
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
          new Notification('⚽ Nouvelle question !', {
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

  // startMatch: démarrer le quiz pour le match sélectionné
  const startMatch = async () => {
    if (!selectedMatch) {
      alert('❌ Veuillez d\'abord sélectionner un match');
      return;
    }

    try {
      const matchData = {
        currentMatchId: selectedMatch.id,
        active: true,
        startTime: Date.now(),
        nextQuestionTime: Date.now() + 30000, // Première question dans 30 secondes
        questionCount: 0
      };

      await set(ref(db, `bars/${barId}/matchState`), matchData);
      
      // Créer le dossier du match
      await set(ref(db, `bars/${barId}/matches/${selectedMatch.id}`), {
        ...selectedMatch,
        startTime: Date.now(),
        active: true
      });

      alert('✅ Match démarré ! Les questions vont commencer dans 30 secondes.');
    } catch (e) {
      console.error('Erreur démarrage match:', e);
      alert('❌ Erreur: ' + e.message);
    }
  };

  // stopMatch: arrêter le quiz
  const stopMatch = async () => {
    try {
      await set(ref(db, `bars/${barId}/matchState`), {
        active: false,
        endTime: Date.now()
      });

      // Nettoyer la question courante
      await remove(ref(db, `bars/${barId}/currentQuestion`));

      alert('✅ Match arrêté');
    } catch (e) {
      console.error('Erreur arrêt match:', e);
      alert('❌ Erreur: ' + e.message);
    }
  };

  // createRandomQuestion: créer une question aléatoire
  const createRandomQuestion = async () => {
    if (!matchState?.active) {
      alert('❌ Le match n\'est pas actif');
      return;
    }

    try {
      // Trouver une question non utilisée
      const availableQuestions = QUESTIONS.filter(q => !usedQuestionsRef.current.includes(q.text));
      
      if (availableQuestions.length === 0) {
        // Réinitialiser si toutes les questions ont été utilisées
        usedQuestionsRef.current = [];
        const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
        usedQuestionsRef.current.push(question.text);
      } else {
        const question = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
        usedQuestionsRef.current.push(question.text);
      }

      const questionData = {
        ...availableQuestions[Math.floor(Math.random() * availableQuestions.length)],
        id: Date.now(),
        createdAt: Date.now(),
        timeLeft: 15
      };

      await set(ref(db, `bars/${barId}/currentQuestion`), questionData);

      // Programmer la prochaine question
      const nextTime = Date.now() + QUESTION_INTERVAL;
      await update(ref(db, `bars/${barId}/matchState`), {
        nextQuestionTime: nextTime,
        questionCount: (matchState?.questionCount || 0) + 1
      });

    } catch (e) {
      console.error('Erreur création question:', e);
      alert('❌ Erreur: ' + e.message);
    }
  };

  // autoValidate: valider automatiquement la question courante
  const autoValidate = async () => {
    if (!currentQuestion) return;

    try {
      // Trouver la réponse la plus populaire
      const answerCounts = Object.entries(answers);
      if (answerCounts.length === 0) {
        await remove(ref(db, `bars/${barId}/currentQuestion`));
        return;
      }

      const correctAnswer = answerCounts.reduce((a, b) => answers[a[0]] > answers[b[0]] ? a : b)[0];

      // Calculer les scores
      const playersRef = ref(db, `bars/${barId}/matches/${currentMatchId}/players`);
      const playersSnap = await get(playersRef);
      
      if (playersSnap.exists()) {
        const playersData = playersSnap.val();
        const updates = {};

        // Récupérer les réponses des joueurs
        const answersRef = ref(db, `bars/${barId}/answers/${currentQuestion.id}`);
        const answersSnap = await get(answersRef);
        
        if (answersSnap.exists()) {
          const answersData = answersSnap.val();
          
          Object.entries(answersData).forEach(([playerId, answerData]) => {
            if (answerData.answer === correctAnswer && playersData[playerId]) {
              updates[`${playerId}/score`] = (playersData[playerId].score || 0) + 1;
            }
          });
        }

        if (Object.keys(updates).length > 0) {
          await update(playersRef, updates);
        }
      }

      // Nettoyer la question et les réponses
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/answers/${currentQuestion.id}`));

    } catch (e) {
      console.error('Erreur validation:', e);
    }
  };

  // forceCleanup: nettoyer toutes les données
  const forceCleanup = async () => {
    if (!window.confirm('⚠️ Nettoyer toutes les données ? Cette action est irréversible.')) return;

    try {
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, `bars/${barId}/matchState`));
      await remove(ref(db, `bars/${barId}/selectedMatch`));
      await remove(ref(db, `bars/${barId}/answers`));
      await remove(ref(db, `bars/${barId}/notifications`));
      
      alert('✅ Nettoyage terminé');
    } catch (e) {
      console.error('Erreur nettoyage:', e);
      alert('❌ Erreur: ' + e.message);
    }
  };

  // debugFirebase: afficher les données Firebase
  const debugFirebase = async () => {
    try {
      const barRef = ref(db, `bars/${barId}`);
      const snap = await get(barRef);
      
      if (snap.exists()) {
        console.log('🔍 Données Firebase:', snap.val());
        alert('✅ Données affichées dans la console');
      } else {
        alert('❌ Aucune donnée trouvée');
      }
    } catch (e) {
      console.error('Erreur debug:', e);
      alert('❌ Erreur: ' + e.message);
    }
  };

  // startMatchMonitoring / stopMatchMonitoring
  const startMatchMonitoring = (fixtureId) => {
    if (matchCheckInterval.current) {
      clearInterval(matchCheckInterval.current);
    }

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

          if (elapsed > 0 && !matchState?.active && ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status)) {
            console.log('🚀 Match détecté comme commencé ! Démarrage automatique...');
            
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
            
            await startMatch();
            
            clearInterval(matchCheckInterval.current);
            matchCheckInterval.current = null;
          }
        }
      } catch (e) {
        console.error('Erreur surveillance match:', e);
      }
    }, 30000);
  };

  const stopMatchMonitoring = () => {
    if (matchCheckInterval.current) {
      clearInterval(matchCheckInterval.current);
      matchCheckInterval.current = null;
    }
  };

  // UI components (MatchClock etc.) omitted here are included above in the large file earlier
  // For brevity the rest of UI rendering follows the same structure as before (kept intact),
  // with the key fix: superAdminLogin and adminLogin handlers use e.target.value when reading Enter key.

  // HOME
  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">⚽</div>
          <h1 className="text-6xl font-black text-white mb-4">QUIZ BUTEUR</h1>
          <p className="text-2xl text-green-200">Pronostics en temps réel</p>
        </div>
        
        <div className="flex gap-6">
          <button 
            onClick={() => setScreen('tv')}
            className="bg-white text-green-900 px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-100 transition-all shadow-2xl"
          >
            📺 ÉCRAN
          </button>
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

  // ADMIN LOGIN (fixed to read e.target.value on Enter)
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
            maxLength={12}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                const code = (e.target.value || '').trim().toUpperCase();
                if (!code) { alert('Veuillez entrer votre code d\'accès'); return; }
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
        </div>
      </div>
    );
  }

  // ADMIN (kept intact, as in earlier full file)
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
              <h1 className="text-4xl font-bold">🎮 Admin — {barInfo?.name || barId}</h1>
              <p className="text-green-400 text-lg mt-2">📍 Bar : <span className="font-bold">{barId}</span></p>
            </div>
            <button
              onClick={() => {
                setBarId(null);
                setScreen('home');
              }}
              className="bg-red-600 px-6 py-3 rounded-lg hover:bg-red-700"
            >
              🚪 Déconnexion
            </button>
          </div>
          
          {/* Sélection du match */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">🔍 Sélection du match</h2>
            <div className="flex gap-4 mb-4">
              <input
                type="text"
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
                placeholder="PSG, Real Madrid..."
                className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg"
                onKeyDown={(e) => e.key === 'Enter' && searchMatches()}
              />
              <button
                onClick={searchMatches}
                disabled={loadingMatches}
                className="bg-blue-600 px-6 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:bg-gray-600"
              >
                {loadingMatches ? '⏳' : '🔍 Rechercher'}
              </button>
            </div>

            {availableMatches.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableMatches.map(match => (
                  <div key={match.id} className={`p-4 rounded-lg transition-all cursor-pointer ${selectedMatch?.id === match.id ? 'bg-green-800 border-2 border-green-500' : 'bg-gray-700 hover:bg-gray-600'}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs bg-blue-600 px-2 py-1 rounded">{match.league}</span>
                          {match.elapsed && <span className="text-xs bg-red-600 px-2 py-1 rounded font-bold">🔴 LIVE {match.elapsed}'</span>}
                        </div>
                        <div className="text-lg font-bold">{match.homeTeam} {match.score} {match.awayTeam}</div>
                        <div className="text-sm text-gray-400">{match.date}</div>
                      </div>
                      <div>
                        <button onClick={(e) => { e.stopPropagation(); selectMatch(match); }} className="bg-green-600 px-6 py-2 rounded font-bold">Sélectionner</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Aucun match trouvé</p>
            )}
          </div>

          {/* Contrôle du match */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Contrôle du match</h2>
            <div className="flex gap-4">
              <button onClick={startMatch} disabled={!selectedMatch} className="bg-green-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-green-700 disabled:bg-gray-600">⚽ Démarrer</button>
              <button onClick={stopMatch} className="bg-red-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-red-700">⏹️ Arrêter</button>
              <button onClick={async () => { if (currentQuestion) { await autoValidate(); setTimeout(() => createRandomQuestion(), 1000); } else { await createRandomQuestion(); } }} className="bg-blue-600 px-8 py-4 rounded-lg font-bold hover:bg-blue-700">🎲 Question</button>
            </div>
            {matchState?.active && <p className="mt-3 text-green-300">Match en cours — Prochaine: {countdown || '...'}</p>}
          </div>

          {/* Joueurs connectés */}
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

          {/* Debug */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Debug</h2>
            <div className="flex gap-4">
              <button onClick={forceCleanup} className="bg-orange-600 px-8 py-4 rounded-lg font-bold hover:bg-orange-700">🧹 Nettoyage</button>
              <button onClick={debugFirebase} className="bg-purple-600 px-8 py-4 rounded-lg font-bold hover:bg-purple-700">🔍 Debug Firebase</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SUPERADMIN LOGIN (fixed to read e.target.value on Enter)
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = (e.target.value || '').trim();
                if (val === 'ADMIN2025') {
                  setScreen('superAdmin');
                  loadAllBars();
                } else {
                  alert('❌ Mot de passe incorrect');
                }
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

  // SUPERADMIN screen
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
                onKeyDown={(e) => {
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
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-gray-900">📋 Liste des bars ({allBars.length})</h2>
              <button
                onClick={loadAllBars}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                🔄 Actualiser
              </button>
            </div>
            
            {allBars.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-6xl mb-4">🏪</div>
                <p className="text-xl">Aucun bar créé pour le moment</p>
                <button
                  onClick={loadAllBars}
                  className="mt-4 bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700"
                >
                  🔄 Recharger la liste
                </button>
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
                    <div className="flex items-center gap-3">
                      <div className="text-center bg-white px-6 py-4 rounded-xl border-2 border-yellow-600">
                        <div className="text-sm text-gray-500 mb-1">Code d'accès</div>
                        <div className="text-3xl font-black text-yellow-900">{bar.code || bar.id}</div>
                      </div>
                      <button
                        onClick={() => deleteBar(bar.id)}
                        className="ml-2 bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700"
                      >
                        Supprimer
                      </button>
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

          {/* Debug / Nettoyage */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={debugFirebase}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700"
            >
              🔍 Debug Firebase
            </button>
            <button
              onClick={forceCleanup}
              className="bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700"
            >
              🧹 Nettoyage Complet
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PLAY JOIN
  if (screen === 'playJoin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">⚽</div>
            <h2 className="text-3xl font-black text-green-900 mb-2">REJOINDRE LE QUIZ</h2>
            <p className="text-gray-600">Entrez le code du bar</p>
          </div>

          <input
            type="text"
            value={barIdInput}
            onChange={(e) => setBarIdInput(e.target.value.toUpperCase())}
            placeholder="BAR-XXXXX"
            className="w-full px-6 py-4 text-xl border-4 border-green-900 rounded-xl mb-6 focus:outline-none focus:border-green-600 text-center font-bold uppercase"
            maxLength={12}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                const code = (e.target.value || '').trim().toUpperCase();
                if (!code) { alert('Veuillez entrer le code du bar'); return; }
                const isValid = await verifyBarCode(code);
                if (isValid) {
                  setBarId(code);
                  setScreen('auth');
                } else {
                  alert('❌ Code invalide.\n\nVérifiez le code avec le bar.');
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
                  setScreen('auth');
                } else {
                  alert('❌ Code invalide.\n\nVérifiez le code avec le bar.');
                }
              } else {
                alert('Veuillez entrer le code du bar');
              }
            }}
            className="w-full bg-green-900 text-white py-4 rounded-xl text-xl font-bold hover:bg-green-800 mb-4"
          >
            REJOINDRE 🚀
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

  // AUTH
  if (screen === 'auth') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-8">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🔐</div>
            <h2 className="text-3xl font-black text-blue-900 mb-2">CONNEXION</h2>
            <p className="text-gray-600">Créez un compte ou connectez-vous</p>
          </div>

          <div className="flex mb-6">
            <button
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-3 rounded-t-xl font-bold ${authMode === 'login' ? 'bg-blue-900 text-white' : 'bg-gray-200 text-gray-600'}`}
            >
              Connexion
            </button>
            <button
              onClick={() => setAuthMode('register')}
              className={`flex-1 py-3 rounded-t-xl font-bold ${authMode === 'register' ? 'bg-blue-900 text-white' : 'bg-gray-200 text-gray-600'}`}
            >
              Inscription
            </button>
          </div>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-6 py-4 text-xl border-4 border-gray-300 rounded-xl mb-4 focus:outline-none focus:border-blue-600"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            className="w-full px-6 py-4 text-xl border-4 border-gray-300 rounded-xl mb-4 focus:outline-none focus:border-blue-600"
          />

          {authMode === 'register' && (
            <input
              type="text"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              placeholder="Pseudo"
              className="w-full px-6 py-4 text-xl border-4 border-gray-300 rounded-xl mb-4 focus:outline-none focus:border-blue-600"
            />
          )}

          <button
            onClick={async () => {
              if (!email || !password) {
                alert('Veuillez remplir tous les champs');
                return;
              }

              if (authMode === 'register' && !pseudo) {
                alert('Veuillez entrer un pseudo');
                return;
              }

              try {
                if (authMode === 'register') {
                  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                  await set(ref(db, `users/${userCredential.user.uid}`), {
                    pseudo: pseudo,
                    email: email,
                    createdAt: Date.now()
                  });
                  setScreen('mobile');
                } else {
                  await signInWithEmailAndPassword(auth, email, password);
                  setScreen('mobile');
                }
              } catch (error) {
                alert('❌ Erreur: ' + error.message);
              }
            }}
            className="w-full bg-blue-900 text-white py-4 rounded-xl text-xl font-bold hover:bg-blue-800 mb-4"
          >
            {authMode === 'register' ? 'S\'INSCRIRE' : 'SE CONNECTER'} 🚀
          </button>

          <button
            onClick={() => setScreen('playJoin')}
            className="w-full text-gray-600 py-2 text-sm underline"
          >
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  // MOBILE
  if (screen === 'mobile') {
    if (!user || !barId) {
      setScreen('playJoin');
      return null;
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 p-4">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="bg-white rounded-2xl p-6 mb-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-green-900">⚽ Quiz Buteur</h1>
                <p className="text-gray-600">{barInfo?.name || barId}</p>
              </div>
              <button
                onClick={() => {
                  signOut(auth);
                  setScreen('playJoin');
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
              >
                Déconnexion
              </button>
            </div>

            {selectedMatch && (
              <div className="bg-gray-100 rounded-xl p-4">
                <div className="text-center">
                  <div className="text-lg font-bold">{selectedMatch.homeTeam} vs {selectedMatch.awayTeam}</div>
                  <div className="text-sm text-gray-600">{selectedMatch.league}</div>
                  {matchState?.active && (
                    <div className="text-green-600 font-bold mt-2">🔴 EN COURS</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Question courante */}
          {currentQuestion ? (
            <div className="bg-white rounded-2xl p-6 mb-4 shadow-xl">
              <div className="text-center mb-4">
                <div className="text-2xl font-bold text-gray-900 mb-2">{currentQuestion.text}</div>
                <div className="text-4xl font-black text-green-600">{timeLeft}s</div>
              </div>

              <div className="space-y-3">
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      if (!playerAnswer) {
                        setPlayerAnswer(option);
                        const answerRef = push(ref(db, `bars/${barId}/answers/${currentQuestion.id}`));
                        set(answerRef, {
                          playerId: user.uid,
                          answer: option,
                          timestamp: Date.now()
                        });
                      }
                    }}
                    className={`w-full py-4 rounded-xl text-lg font-bold transition-all ${
                      playerAnswer === option
                        ? 'bg-green-600 text-white'
                        : playerAnswer
                        ? 'bg-gray-200 text-gray-500'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    disabled={!!playerAnswer}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {playerAnswer && (
                <div className="text-center mt-4 text-green-600 font-bold">
                  ✅ Réponse enregistrée !
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-6 mb-4 shadow-xl text-center">
              <div className="text-6xl mb-4">⏳</div>
              <div className="text-xl font-bold text-gray-600">En attente de la prochaine question...</div>
              {countdown && (
                <div className="text-green-600 font-bold mt-2">Prochaine question dans : {countdown}</div>
              )}
            </div>
          )}

          {/* Classement */}
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">🏆 Classement</h2>
            {players.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                Aucun joueur pour le moment
              </div>
            ) : (
              <div className="space-y-2">
                {players.slice(0, 10).map((player, index) => (
                  <div key={player.id} className={`flex justify-between items-center p-3 rounded-lg ${
                    player.id === user.uid ? 'bg-green-100 border-2 border-green-500' : 'bg-gray-100'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-bold">#{index + 1}</div>
                      <div className="font-bold">{player.pseudo}</div>
                    </div>
                    <div className="text-green-600 font-bold">{player.score} pts</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // TV
  if (screen === 'tv') {
    const qrUrl = `${window.location.origin}/play?bar=${barId || ''}`;
    return (
      <div className="min-h-screen bg-black text-white p-4">
        {/* QR Code en haut à droite */}
        {barId && (
          <div className="fixed top-6 right-6 z-50 bg-white p-2 rounded-xl shadow-2xl">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
              alt="QR Code pour rejoindre"
              className="w-40 h-40"
            />
          </div>
        )}

        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-8xl mb-4">⚽</div>
            <h1 className="text-6xl font-black text-white mb-2">QUIZ BUTEUR</h1>
            <p className="text-2xl text-green-400">Pronostics en temps réel</p>
          </div>

          {/* Match info enrichi */}
          {(selectedMatch || matchState?.matchInfo) && (
            <div className="bg-gray-900 rounded-2xl p-8 mb-8">
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-4 flex-1">
                  { (matchState?.matchInfo?.homeLogo || selectedMatch?.homeLogo) && (
                    <img
                      src={matchState?.matchInfo?.homeLogo || selectedMatch?.homeLogo}
                      alt={matchState?.matchInfo?.homeTeam || selectedMatch?.homeTeam}
                      className="w-16 h-16 object-contain bg-white rounded-lg"
                    />
                  )}
                  <div className="text-2xl font-bold">
                    {matchState?.matchInfo?.homeTeam || selectedMatch?.homeTeam}
                  </div>
                </div>

                <div className="text-center flex-1">
                  <div className="text-5xl font-black">
                    {(matchState?.matchInfo?.score || selectedMatch?.score || 'vs')}
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    {matchState?.matchInfo?.league || selectedMatch?.league}
                  </div>
                  {matchState?.active && (
                    <div className="text-red-500 text-xl font-bold mt-1">🔴 MATCH EN COURS</div>
                  )}
                </div>

                <div className="flex items-center gap-4 justify-end flex-1">
                  <div className="text-2xl font-bold text-right">
                    {matchState?.matchInfo?.awayTeam || selectedMatch?.awayTeam}
                  </div>
                  { (matchState?.matchInfo?.awayLogo || selectedMatch?.awayLogo) && (
                    <img
                      src={matchState?.matchInfo?.awayLogo || selectedMatch?.awayLogo}
                      alt={matchState?.matchInfo?.awayTeam || selectedMatch?.awayTeam}
                      className="w-16 h-16 object-contain bg-white rounded-lg"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Question courante */}
          {currentQuestion ? (
            <div className="bg-gray-900 rounded-2xl p-8 mb-8">
              <div className="text-center mb-8">
                <div className="text-5xl font-bold text-white mb-4">{currentQuestion.text}</div>
                <div className="text-8xl font-black text-red-500 mb-4">{timeLeft}</div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {currentQuestion.options.map((option, index) => (
                  <div key={index} className="bg-gray-800 rounded-xl p-6 text-center">
                    <div className="text-3xl font-bold mb-2">{option}</div>
                    <div className="text-6xl font-black text-green-400">
                      {answers[option] || 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-2xl p-8 mb-8 text-center">
              <div className="text-8xl mb-4">⏳</div>
              <div className="text-3xl font-bold text-gray-400">En attente de la prochaine question...</div>
              {countdown && (
                <div className="text-green-400 text-2xl font-bold mt-4">Prochaine question dans : {countdown}</div>
              )}
            </div>
          )}

          {/* Classement */}
          <div className="bg-gray-900 rounded-2xl p-8">
            <h2 className="text-4xl font-bold text-center mb-8">🏆 CLASSEMENT</h2>
            {players.length === 0 ? (
              <div className="text-center text-gray-500 text-2xl py-8">
                Aucun joueur pour le moment
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {players.slice(0, 12).map((player, index) => (
                  <div key={player.id} className="bg-gray-800 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold mb-1">#{index + 1}</div>
                    <div className="text-xl font-bold mb-1">{player.pseudo}</div>
                    <div className="text-green-400 text-2xl font-bold">{player.score} pts</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notification */}
          {notification && (
            <div className="fixed top-8 right-8 bg-green-600 text-white p-6 rounded-xl shadow-2xl z-50">
              <div className="text-2xl font-bold">🎉 {notification.pseudo} a rejoint le quiz !</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
