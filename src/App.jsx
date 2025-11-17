import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ref, onValue, set, update, remove, get, push, serverTimestamp, runTransaction } from 'firebase/database';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { QRCodeSVG } from 'qrcode.react';
import { generateCultureQuestion, generatePredictionQuestion, checkClaudeQuota } from './generateCultureQuestion';
import SimulationMatchSetup from './components/SimulationMatchSetup';
import { createSimulationMatch, startQuestionScheduler } from './questionManager';



// ---- Server time utils (Firebase server clock) ----
const serverOffsetRef = ref(db, '.info/serverTimeOffset');
let __serverOffset = 0;
onValue(serverOffsetRef, snap => { __serverOffset = snap.val() || 0; });
const serverNow = () => Date.now() + __serverOffset;

const schedulerLockRef = (barId) => ref(db, `bars/${barId}/locks/scheduler`);
const tryLock = async (uid, barId) => {
  const now = serverNow();
  const ttlMs = 60_000;
  const res = await runTransaction(schedulerLockRef(barId), cur => {
    if (!cur || (cur.expiresAt && cur.expiresAt < now)) {
      return { uid, acquiredAt: now, expiresAt: now + ttlMs };
    }
    return cur;
  });
  const v = res.snapshot.val();
  return res.committed && v && v.uid === uid;
};

const QUESTION_INTERVAL = 120000;
const API_SYNC_INTERVAL = 10000; // 🔥 Synchronisation toutes les 10 secondes (au lieu de 30)
const SIMULATION_MINUTE_MS = 13333;

// --- QUESTIONS par défaut (fallback pour le quiz) ---
const QUESTIONS = [
  { text: "Y aura-t-il un but dans les 5 prochaines minutes ?", options: ["Oui", "Non"] },
  { text: "Y aura-t-il un corner dans les 5 prochaines minutes ?", options: ["Oui", "Non"] },
  { text: "Y aura-t-il un carton jaune dans les 10 prochaines minutes ?", options: ["Oui", "Non"] },
  { text: "Qui va marquer le prochain but ?", options: ["Domicile", "Extérieur", "Aucun"] },
  { text: "Y aura-t-il un but contre son camp ?", options: ["Oui", "Non"] },
  { text: "Y aura-t-il un penalty sifflé ?", options: ["Oui", "Non"] }
];

const LIVE_STATUSES = new Set(['1H','2H','ET','LIVE']);
const PAUSE_STATUSES = new Set(['HT','BT','P','SUSP','INT']);
const FINISHED_STATUSES = new Set(['FT','AET','PEN','AWD','WO']);

const computeElapsed = (apiElapsed, lastSyncAt, half, isPaused) => {
  if (isPaused || !LIVE_STATUSES.has(half)) return apiElapsed || 0;
  const drift = Math.floor((serverNow() - (lastSyncAt || serverNow())) / 60000);
  return Math.max(0, (apiElapsed || 0) + drift);
};

const formatMatchMinute = ({ half, elapsed, isPaused }) => {
  // 1) Finished → "TERMINÉ"
  if (FINISHED_STATUSES.has(half)) return '✅ TERMINÉ';

  // 2) Half-time → "MI-TEMPS"
  if (half === 'HT') return '⏸️ MI-TEMPS';

  // 3) First half + stoppage time → "45+X"
  if (half === '1H') {
    if (elapsed > 45) return `45+${elapsed - 45}`;
    return `${Math.max(0, elapsed)}`;
  }

  // 4) Second half baseline: restart FROM 45 (not below)
  if (half === '2H') {
    if (elapsed <= 90) {
      // show at least 45 at the restart, then 46..90
      const clamped = Math.max(45, elapsed);
      return `${clamped}`;
    }
    // 5) Second half stoppage → "90+X"
    return `90+${elapsed - 90}`;
  }

  // 6) Extra time or other statuses → show raw elapsed (can be refined later)
  return `${elapsed}`;
};

// --- Helpers affichage horloge match ---
function formatMatchTime(statusShort, elapsed = 0) {
  if (!elapsed || elapsed < 0) return '0';

  switch (statusShort) {
    case 'HT':
      return 'MI-TEMPS';
    case '1H':
      return elapsed <= 45 ? `${elapsed}` : `45+${elapsed - 45}`;
    case '2H':
      return elapsed <= 90 ? `${elapsed}` : `90+${elapsed - 90}`;
    case 'ET': // prolongations : on laisse la minute brute
      return `${elapsed}`;
    case 'FT':
      return 'TERMINÉ';
    default:
      return `${elapsed}`;
  }
}

function formatHalfLabel(statusShort) {
  switch (statusShort) {
    case 'HT': return 'Mi-temps';
    case '1H': return '1ʳᵉ MT';
    case '2H': return '2ᵉ MT';
    case 'FT': return 'Terminé';
    default:   return statusShort || '';
  }
}

// ---------- PREDICTION HELPERS ----------
const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu,'')
  .replace(/[^a-z0-9 ]+/g,' ')
  .replace(/\s+/g,' ')
  .trim();

// Essaie d'associer un buteur/équipe à une option
const findMatchingOption = (options, scorerName, scorerTeam) => {
  const nScorer = norm(scorerName);
  const nTeam   = norm(scorerTeam);
  for (const opt of options || []) {
    const nOpt = norm(opt);
    if (nOpt && nScorer && (nScorer.includes(nOpt) || nOpt.includes(nScorer))) return opt;
  }
  for (const opt of options || []) {
    const nOpt = norm(opt);
    if (nOpt && nTeam && (nTeam.includes(nOpt) || nOpt.includes(nTeam))) return opt;
  }
  return null;
};

const hasAucune = (options=[]) => options.some(o => {
  const n = norm(o);
  return n === 'aucune' || n === 'aucun';
});

// === START PATCH: helpers + autoValidate avec API-Football ===

// Parse "…dans les 5/10 prochaines minutes ?" -> 5 ou 10 (fallback 10)
function parsePredictionWindowMinutes(text = '') {
  const m = text.match(/(\d+)\s*prochaines?\s*minutes?/i);
  const n = m ? parseInt(m[1], 10) : 10;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

// Détermine le type simple de question
function detectQuestionType(text = '') {
  const t = text.toLowerCase();
  if (t.includes('carton')) return 'card';
  if (t.includes('corner')) return 'corner';
  if (t.includes('contre son camp')) return 'own_goal';
  if (t.includes('but')) return 'goal';
  return 'unknown';
}

// 🔥 Helper pour appeler l'API Football via le proxy Vercel (contourne CORS)
async function fetchFootballAPI(endpoint, queryParams = {}) {
  const params = new URLSearchParams({ endpoint, ...queryParams });
  const res = await fetch(`/api/football?${params.toString()}`);
  
  if (!res.ok) {
    throw new Error(`API Football error: ${res.status}`);
  }
  
  return await res.json();
}

// Récupération du fixture (events + elapsed)
async function fetchFixtureNow(fixtureId, apiKey) {
  const data = await fetchFootballAPI('fixtures', { id: fixtureId });
  const fx = data?.response?.[0];
  return {
    events: Array.isArray(fx?.events) ? fx.events : [],
    elapsedNow: Number.isFinite(fx?.fixture?.status?.elapsed) ? fx.fixture.status.elapsed : null,
  };
}

// Test si l'événement tombe dans la fenêtre [startMin, endMin]
function isInMinuteWindow(ev, startMin, endMin) {
  const evMin = (ev?.time?.elapsed ?? 0) + ((ev?.time?.extra ?? 0) / 1);
  return evMin >= startMin && evMin <= endMin;
}

// Détecte une question "dans X minutes"
const parseWindowPrediction = (text) => {
  if (!text) return null;
  const t = String(text).toLowerCase();
  const m = t.match(/dans\s+(\d+)\s*min/);
  const windowMinutes = m ? Number(m[1]) : null;

  const isGoal    = /but(?!eur)/.test(t) || /prochain but/.test(t);
  const isRed     = /carton\s+rouge/.test(t);
  const isYellow  = /carton\s+jaune/.test(t);
  const isPenalty = /penalty|penalité|pénalty|pénalité/.test(t);
  const isCorner  = /corner/.test(t);

  let eventType = null;
  if (isGoal)    eventType = 'goal';
  else if (isRed)    eventType = 'red_card';
  else if (isYellow) eventType = 'yellow_card';
  else if (isPenalty)eventType = 'penalty';
  else if (isCorner) eventType = 'corner';

  if (!windowMinutes || !eventType) return null;
  return { kind: 'window_event', eventType, windowMinutes };
};

// Fait correspondre un event API-Football à notre type demandé
const eventMatchesType = (ev, wanted) => {
  if (!ev) return false;
  const type = (ev.type || '').toLowerCase();
  const detail = (ev.detail || '').toLowerCase();
  switch (wanted) {
    case 'goal':
      return type === 'goal';
    case 'red_card':
      return type === 'card' && detail.includes('red');
    case 'yellow_card':
      return type === 'card' && detail.includes('yellow');
    case 'penalty':
      return type === 'penalty'
          || detail.includes('penalty')
          || (type === 'goal' && detail.includes('penalty'))
          || (type === 'var'  && detail.includes('penalty'));
    case 'corner':
      // seulement si l'API émet des events corner
      return type === 'corner' || detail.includes('corner');
    default:
      return false;
  }
};

// Détecte "prochain but" (+ fenêtre optionnelle)
const parseNextGoalQuestion = (text) => {
  if (!text) return null;
  const t = String(text).toLowerCase();
  const isNextGoal = /prochain\s+but/.test(t) || /\bqui va marquer\b/.test(t);
  if (!isNextGoal) return null;
  const m = t.match(/dans\s+(\d+)\s*min/); // optionnel
  const windowMinutes = m ? Number(m[1]) : null;
  return { kind: 'next_goal', windowMinutes };
};
// -----------------------------------------

export default function App() {
  // Initialiser screen en fonction de l'URL
  const [screen, setScreen] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const barFromUrl = urlParams.get('bar');
    // Vercel redirige toutes les routes vers /, donc on se base uniquement sur le paramètre bar
    if (barFromUrl) {
      return 'playJoin';
    }
    return 'home';
  });
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
  const [matchPlayers, setMatchPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle'); // 🔥 État de synchronisation
  const lastSyncRef = useRef(Date.now()); // 🔥 Timestamp dernière sync
  const [lastQuestionResult, setLastQuestionResult] = useState(null);
  const [answerHistory, setAnswerHistory] = useState([]);
  const usedQuestionsRef = useRef([]);
  const isProcessingRef = useRef(false);
  const nextQuestionTimer = useRef(null);
  const firstQuestionTimeoutRef = useRef(null);
  const cultureValidationTimeoutRef = useRef(null); // 🔥 Référence pour validation culture
  const wakeLockRef = useRef(null);
  const matchCheckInterval = useRef(null);
  const questionIntervalRef = useRef(null);
  const [playerName, setPlayerName] = useState('');
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [hasJoined, setHasJoined] = useState(false);

  const SIMULATION_MATCHES = {
    'psg-om': {
      id: 'sim-psg-om',
      homeTeam: 'Paris Saint Germain',
      awayTeam: 'Marseille',
      league: 'Ligue 1',
      finalScore: '3-0',
      events: [
        { elapsed: 7, type: 'Goal', team: 'home', player: 'Neymar' },
        { elapsed: 19, type: 'Card', detail: 'Yellow Card', team: 'away', player: 'Payet' },
        { elapsed: 23, type: 'Goal', team: 'home', player: 'Mbappé' },
        { elapsed: 56, type: 'Card', detail: 'Red Card', team: 'away', player: 'Balerdi' },
        { elapsed: 67, type: 'Goal', team: 'home', player: 'Mbappé' }
      ]
    },
    'liverpool-city': {
      id: 'sim-liverpool-city',
      homeTeam: 'Liverpool',
      awayTeam: 'Manchester City',
      league: 'Premier League',
      finalScore: '2-1',
      events: [
        { elapsed: 12, type: 'Goal', team: 'home', player: 'Salah' },
        { elapsed: 34, type: 'Goal', team: 'away', player: 'Haaland' },
        { elapsed: 78, type: 'Goal', team: 'home', player: 'Nunez' }
      ]
    },
    'real-barca': {
      id: 'sim-real-barca',
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      league: 'La Liga',
      finalScore: '4-0',
      events: [
        { elapsed: 15, type: 'Goal', team: 'home', player: 'Vinicius Jr' },
        { elapsed: 28, type: 'Card', detail: 'Yellow Card', team: 'away', player: 'Araujo' },
        { elapsed: 42, type: 'Goal', team: 'home', player: 'Benzema' },
        { elapsed: 58, type: 'Goal', team: 'home', player: 'Rodrygo' },
        { elapsed: 73, type: 'Card', detail: 'Yellow Card', team: 'away', player: 'Busquets' },
        { elapsed: 81, type: 'Goal', team: 'home', player: 'Benzema' }
      ]
    }
  };

  const [selectedSimulationMatch, setSelectedSimulationMatch] = useState(null);
  const [simulationActive, setSimulationActive] = useState(false);
  const [simulationElapsed, setSimulationElapsed] = useState(0);
  const [simulationScore, setSimulationScore] = useState({ home: 0, away: 0 });
  const [simulationHalf, setSimulationHalf] = useState('1H');
  const [simulationLog, setSimulationLog] = useState([]);
  const [simulationPlayers, setSimulationPlayers] = useState({});
  const simulationIntervalRef = useRef(null);
  const [simulationMatchId, setSimulationMatchId] = useState(null);
  const simulationMatchIdRef = useRef(null);
  const simulationQuestionSchedulerRef = useRef(null);
  // --- États spécifiques à l'UI DEMO (ancienne mise en page TV/Mobile) ---
  const [demoMatchInfo, setDemoMatchInfo] = useState(null);
  const [demoElapsed, setDemoElapsed] = useState(0);
  const [demoEvents, setDemoEvents] = useState([]);
  const [demoPlayers, setDemoPlayers] = useState([]);

  useEffect(() => {
    if (screen !== 'demo' || !simulationMatchId) return;

    const matchRef = ref(db, `matches/${simulationMatchId}`);
    const timerRef = ref(db, `matches/${simulationMatchId}/timer/elapsed`);
    const eventsRef = ref(db, `matches/${simulationMatchId}/events`);
    const playersRef = ref(db, `matches/${simulationMatchId}/players`);

    const unsubMatch = onValue(matchRef, snap => {
      const v = snap.val();
      if (!v) return;
      setDemoMatchInfo({
        homeTeam: v.homeTeam?.name || 'Paris Saint Germain',
        homeLogo: v.homeTeam?.logo || null,
        awayTeam: v.awayTeam?.name || 'Marseille',
        awayLogo: v.awayTeam?.logo || null,
      });
    });

    const unsubTimer = onValue(timerRef, snap => {
      setDemoElapsed(snap.val() || 0);
    });

    const unsubEvents = onValue(eventsRef, snap => {
      const v = snap.val() || {};
      const list = Object.values(v).sort((a, b) => (a.time?.elapsed || 0) - (b.time?.elapsed || 0));
      setDemoEvents(list);
    });

    const unsubPlayers = onValue(playersRef, snap => {
      const v = snap.val() || {};
      const list = Object.entries(v).map(([id, p]) => ({ id, pseudo: p.pseudo || id, score: p.score || 0 }));
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
      setDemoPlayers(list);
    });

    return () => {
      unsubMatch?.();
      unsubTimer?.();
      unsubEvents?.();
      unsubPlayers?.();
    };
  }, [screen, simulationMatchId]);

  const searchMatches = async () => {
    setLoadingMatches(true);

    try {
      // Utiliser le proxy Vercel pour contourner CORS
      const data = await fetchFootballAPI('fixtures', { live: 'all' });

      if (data.errors && Object.keys(data.errors).length > 0) {
        alert('❌ Erreur API: ' + JSON.stringify(data.errors));
        setLoadingMatches(false);
        return;
      }

      if (!data.response || data.response.length === 0) {
        const today = new Date().toISOString().split('T')[0];
        const dataToday = await fetchFootballAPI('fixtures', { date: today });

        if (dataToday.response && dataToday.response.length > 0) {
          const matches = dataToday.response
            .filter(fixture => {
              const status = fixture.fixture.status.short;
              // Exclure les matchs terminés (FT, AET, PEN, etc.)
              return !['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(status);
            })
            .slice(0, 100)
            .map(fixture => ({
              id: fixture.fixture.id,
              homeTeam: fixture.teams.home.name,
              awayTeam: fixture.teams.away.name,
              homeLogo: fixture.teams.home.logo,
              awayLogo: fixture.teams.away.logo,
              league: fixture.league.name,
              date: new Date(fixture.fixture.date).toLocaleString('fr-FR'),
              status: fixture.fixture.status.long,
              statusShort: fixture.fixture.status.short,
              timestamp: new Date(fixture.fixture.date).getTime(),
              score: fixture.fixture.status.short === 'NS' 
                ? 'vs' 
                : `${fixture.goals.home || 0}-${fixture.goals.away || 0}`,
              elapsed: fixture.fixture.status.elapsed || 0,
              half: fixture.fixture.status.short
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
          .slice(0, 100)
          .map(fixture => ({
            id: fixture.fixture.id,
            homeTeam: fixture.teams.home.name,
            awayTeam: fixture.teams.away.name,
            homeLogo: fixture.teams.home.logo,
            awayLogo: fixture.teams.away.logo,
            league: fixture.league.name,
            date: new Date(fixture.fixture.date).toLocaleString('fr-FR'),
            status: fixture.fixture.status.long,
            statusShort: fixture.fixture.status.short,
            timestamp: new Date(fixture.fixture.date).getTime(),
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
    setSelectedMatch(match);
    console.log('⚽ Match sélectionné:', match);
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
      
      // 🔥 CRITIQUE : Lancer la surveillance
      console.log('🚀 Lancement startMatchMonitoring pour fixture:', match.id);
      startMatchMonitoring(match.id);
      console.log('✅ startMatchMonitoring lancé');
      
    } catch (e) {
      alert('❌ Erreur: ' + e.message);
    }
    
    await loadMatchLineups(match.id);
  };

  const loadMatchLineups = async (fixtureId) => {
    setLoadingPlayers(true);
    
    try {
      // Utiliser le proxy Vercel pour contourner CORS
      const data = await fetchFootballAPI('fixtures/lineups', { fixture: fixtureId });

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
    const urlParams = new URLSearchParams(window.location.search);
    const barFromUrl = urlParams.get('bar');
    
    // Détecter si on vient du QR code (paramètre bar présent)
    // Vercel redirige toutes les routes vers /, donc on se base uniquement sur le paramètre bar
    if (barFromUrl) {
      // Si on a un barId depuis l'URL, le définir
      if (!barId || barId !== barFromUrl) {
      setBarId(barFromUrl);
    }
      if (screen !== 'playJoin' && screen !== 'auth' && screen !== 'mobile') {
      setScreen('playJoin');
      }
    }

    // Nettoyage à la fermeture
    return () => {
      stopMatchMonitoring();
    };
  }, []);

  // Récupérer barId depuis l'URL si manquant (pour les écrans playJoin, auth, mobile)
  useEffect(() => {
    if (!barId && (screen === 'playJoin' || screen === 'auth' || screen === 'mobile')) {
      const urlParams = new URLSearchParams(window.location.search);
      const barFromUrl = urlParams.get('bar');
      if (barFromUrl) {
        setBarId(barFromUrl);
      }
    }
  }, [screen, barId]);

  // Charger les infos du bar quand barId est disponible
  useEffect(() => {
    if (barId && !barInfo) {
      loadBarInfo(barId);
    }
  }, [barId, barInfo]);

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
      
      // Mettre à jour le score depuis matchInfo si disponible
      if (state?.matchInfo?.score && !selectedMatch?.score) {
        // Le score sera mis à jour via selectedMatch, mais on peut aussi le mettre ici en fallback
      }
    });
    
    return () => unsub();
  }, [barId]);

  useEffect(() => {
    if (!barId) return;
    
    const selectedMatchRef = ref(db, `bars/${barId}/selectedMatch`);
    
    const unsub = onValue(selectedMatchRef, (snap) => {
      if (snap.exists()) {
        const match = snap.val();
        console.log('🔄 selectedMatch mis à jour depuis Firebase:', match);
        
        setSelectedMatch(match);
      }
    });
    
    return () => unsub();
  }, [barId]);

  useEffect(() => {
    if (!barId || screen !== 'mobile') return;
    
    try {
      const lastResultRef = ref(db, `bars/${barId}/lastQuestionResult`);
      
      const unsub = onValue(lastResultRef, (snap) => {
        try {
          if (snap.exists()) {
            const result = snap.val();
            console.log('Mobile: résultat reçu', result);
            setLastQuestionResult(result);
            setPlayerAnswer(null); // Réinitialiser la réponse du joueur
            
            // Effacer le résultat après 5 secondes
            setTimeout(() => {
              try {
                setLastQuestionResult(null);
              } catch (e) {
                console.error('Erreur lors de l\'effacement du résultat:', e);
              }
            }, 5000);
          }
        } catch (e) {
          console.error('Erreur dans onValue lastResultRef:', e);
        }
      });
      
      return () => {
        try {
          unsub();
        } catch (e) {
          console.error('Erreur lors du cleanup lastResultRef:', e);
        }
      };
    } catch (e) {
      console.error('Erreur dans useEffect lastQuestionResult:', e);
    }
  }, [barId, screen]);

  // Show correction/feedback on mobile when a result is published
  useEffect(() => {
    if (!barId || !currentQuestion?.id || screen !== 'mobile') return;

    const qid = String(currentQuestion.id);
    const resultRef = ref(db, `bars/${barId}/results/${qid}`);
    const unsub = onValue(resultRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();
      // If no correctAnswer (null) => nobody answered / no resolution
      if (typeof data.correctAnswer === 'undefined') return;

      const isCorrect = playerAnswer != null && data.correctAnswer != null && playerAnswer === data.correctAnswer;
      const msg = (data.correctAnswer == null)
        ? '⏱️ Pas de bonne réponse déterminée pour cette question.'
        : (isCorrect
            ? '✅ Bonne réponse ! +10 pts'
            : `❌ Mauvaise réponse.\nBonne réponse : ${data.correctAnswer}`);

      // basic UX: alert. (you can later replace by a nicer toast)
      alert(msg);
    });

    return () => unsub();
  }, [barId, currentQuestion?.id, playerAnswer, screen]);

  // 🔥 ÉCOUTER L'HISTORIQUE DES RÉPONSES
  useEffect(() => {
    if (!barId || !user || screen !== 'mobile') return;
    
    try {
      const historyRef = ref(db, `bars/${barId}/playerHistory/${user.uid}`);
      
      const unsub = onValue(historyRef, (snap) => {
        try {
          if (snap.exists()) {
            const historyData = snap.val();
            if (historyData && typeof historyData === 'object') {
              // Convertir l'objet en tableau trié par timestamp (plus récent en premier)
              const historyArray = Object.entries(historyData)
                .map(([id, item]) => ({
                  id,
                  ...item
                }))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
              
              setAnswerHistory(historyArray);
              console.log('📝 Historique chargé:', historyArray.length, 'réponses');
            } else {
              setAnswerHistory([]);
            }
          } else {
            setAnswerHistory([]);
          }
        } catch (e) {
          console.error('Erreur dans onValue historyRef:', e);
        }
      });
      
      return () => {
        try {
          unsub();
        } catch (e) {
          console.error('Erreur lors du cleanup historyRef:', e);
        }
      };
    } catch (e) {
      console.error('Erreur dans useEffect answerHistory:', e);
    }
  }, [barId, user, screen]);

  useEffect(() => {
    if (!barId || !currentMatchId) {
      setPlayers([]);
      return;
    }
    
    try {
    const playersRef = ref(db, `bars/${barId}/matches/${currentMatchId}/players`);
    
    const unsub = onValue(playersRef, (snap) => {
        try {
      if (snap.exists()) {
        const data = snap.val();
            if (data && typeof data === 'object') {
        const list = Object.entries(data).map(([id, p]) => ({ id, ...p }));
              setPlayers(list.sort((a, b) => (b.score || 0) - (a.score || 0)));
      } else {
        setPlayers([]);
            }
          } else {
            setPlayers([]);
          }
        } catch (e) {
          console.error('Erreur dans onValue playersRef:', e);
        }
      });
      
      return () => {
        try {
          unsub();
        } catch (e) {
          console.error('Erreur lors du cleanup playersRef:', e);
        }
      };
    } catch (e) {
      console.error('Erreur dans useEffect players:', e);
    }
  }, [barId, currentMatchId]);

  useEffect(() => {
    if (!barId) return;
    
    try {
    const unsub = onValue(ref(db, `bars/${barId}/currentQuestion`), (snap) => {
        try {
      const data = snap.val();
      if (data && data.text && data.options && Array.isArray(data.options)) {
        setCurrentQuestion(data);
        setTimeLeft(data.timeLeft || 15);
        
        if (screen === 'mobile' && 'Notification' in window && Notification.permission === 'granted') {
              try {
          new Notification('⚽ Nouvelle question !', {
            body: data.text,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200],
            tag: 'quiz-question',
            requireInteraction: true
          });
              } catch (e) {
                console.error('Erreur lors de la création de la notification:', e);
              }
        }
      } else {
        setCurrentQuestion(null);
        setPlayerAnswer(null);
          }
        } catch (e) {
          console.error('Erreur dans onValue currentQuestion:', e);
        }
      });
      
      return () => {
        try {
          unsub();
        } catch (e) {
          console.error('Erreur lors du cleanup currentQuestion:', e);
        }
      };
    } catch (e) {
      console.error('Erreur dans useEffect currentQuestion:', e);
    }
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
      if (!user || !barId || !currentMatchId || !userProfile) return;
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
          const notifRef = push(ref(db, `bars/${barId}/notifications`));
          await set(notifRef, {
            type: 'playerJoined',
            pseudo: userProfile.pseudo,
            timestamp: Date.now()
          });
        }

        const barPlayersRef = ref(db, `bars/${barId}/players/${user.uid}`);
        await set(barPlayersRef, {
          id: user.uid,
          name: userProfile.pseudo,
          pseudo: userProfile.pseudo,
          score: playerSnap.exists() ? (playerSnap.val()?.score || 0) : 0,
          joinedAt: Date.now()
        });
        console.log('✅ Joueur enregistré globalement:', userProfile.pseudo, `bars/${barId}/players/${user.uid}`);
      } catch (e) {
        console.error('Erreur ajout joueur:', e);
      }
    };
    addPlayerToMatch();
  }, [user, barId, currentMatchId, userProfile]);

  useEffect(() => {
    if (!currentQuestion?.createdAt) return;

    // 🔥 Les questions CULTURE sont validées automatiquement après 15 secondes via setTimeout
    // Ne pas les valider ici pour éviter la double validation
    if (currentQuestion.type === 'culture') {
      const createdAtMs =
        typeof currentQuestion.createdAt === 'number'
          ? currentQuestion.createdAt
          : Date.now();
      
      const tick = () => {
        const remaining = 15 - Math.floor((serverNow() - createdAtMs) / 1000);
        const safe = Math.max(0, remaining);
        setTimeLeft(safe);
      };

      tick();
      const id = setInterval(tick, 250);
      return () => clearInterval(id);
    }

    // Pour les questions PRÉDICTIVES, validation normale après 15 secondes
    const createdAtMs =
      typeof currentQuestion.createdAt === 'number'
        ? currentQuestion.createdAt
        : Date.now(); // fallback in case timestamp not yet resolved

    const tick = async () => {
      const remaining = 15 - Math.floor((serverNow() - createdAtMs) / 1000);
      const safe = Math.max(0, remaining);
      setTimeLeft(safe);
      if (safe === 0 && !isProcessingRef.current) {
        isProcessingRef.current = true;
        await autoValidate();
        isProcessingRef.current = false;
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [currentQuestion?.createdAt, currentQuestion?.type]);

  useEffect(() => {
    if (!matchState?.nextQuestionTime) {
      setCountdown('');
      return;
    }
    const updateCountdown = () => {
      const diff = matchState.nextQuestionTime - serverNow();
      if (diff <= 0) {
        setCountdown('Bientôt...');
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setCountdown(`${mins}m ${secs < 10 ? '0' : ''}${secs}s`);
      }
    };
    updateCountdown();
    const id = setInterval(updateCountdown, 500);
    return () => clearInterval(id);
  }, [matchState?.nextQuestionTime]);

  useEffect(() => {
    console.log('🔍 [QUESTIONS AUTO] useEffect déclenché');
    console.log('🔍 [QUESTIONS AUTO] barId:', barId);
    console.log('🔍 [QUESTIONS AUTO] matchState?.active:', matchState?.active);
    console.log('🔍 [QUESTIONS AUTO] matchState?.nextQuestionTime:', matchState?.nextQuestionTime);
    console.log('🔍 [QUESTIONS AUTO] currentQuestion:', !!currentQuestion);
    
    if (!barId || !matchState?.active) {
      console.log('⚠️ [QUESTIONS AUTO] Conditions non remplies - arrêt du timer');
      console.log('⚠️ [QUESTIONS AUTO] barId présent:', !!barId);
      console.log('⚠️ [QUESTIONS AUTO] matchState?.active:', matchState?.active);
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
        nextQuestionTimer.current = null;
        console.log('🛑 [QUESTIONS AUTO] Timer arrêté');
      }
      if (firstQuestionTimeoutRef.current) {
        clearTimeout(firstQuestionTimeoutRef.current);
        firstQuestionTimeoutRef.current = null;
        console.log('🛑 [QUESTIONS AUTO] First question timeout annulé');
      }
      return;
    }

    console.log('✅ [QUESTIONS AUTO] Conditions OK - démarrage du timer');
    if (nextQuestionTimer.current) {
      clearInterval(nextQuestionTimer.current);
      console.log('🧹 [QUESTIONS AUTO] Ancien timer nettoyé');
    }

    nextQuestionTimer.current = setInterval(async () => {
      const now = Date.now();
      const nextTime = matchState.nextQuestionTime || 0;
      const questionCount = matchState?.questionCount || 0;
      
      console.log('⏰ [QUESTIONS AUTO] Vérification timer questions');
      console.log('⏰ [QUESTIONS AUTO] Maintenant:', now);
      console.log('⏰ [QUESTIONS AUTO] nextQuestionTime:', nextTime);
      console.log('⏰ [QUESTIONS AUTO] Différence:', nextTime - now, 'ms');
      console.log('⏰ [QUESTIONS AUTO] Création de question dans:', Math.max(0, nextTime - now) / 1000, 'secondes');
      console.log('⏰ [QUESTIONS AUTO] questionCount:', questionCount);
      console.log('⏰ [QUESTIONS AUTO] currentQuestion présente:', !!currentQuestion);
      console.log('⏰ [QUESTIONS AUTO] matchState.active:', matchState?.active);
      
      if (currentQuestion) {
        console.log('⏸️ [QUESTIONS AUTO] Question en cours, on attend...');
        return;
      }
      
      if (questionCount === 0) {
        console.log('🎯 [QUESTIONS AUTO] Première question - utilisation du timeout');
        if (!firstQuestionTimeoutRef.current) {
          console.log('⏰ [QUESTIONS AUTO] Création timeout première question (2 minutes)');
          firstQuestionTimeoutRef.current = setTimeout(async () => {
            console.log('🚀 [QUESTIONS AUTO] Timeout première question déclenché !');
            firstQuestionTimeoutRef.current = null;
            await createRandomQuestion();
          }, 2 * 60 * 1000);
        } else {
          console.log('⏸️ [QUESTIONS AUTO] Timeout première question déjà en cours');
        }
        return;
      }

      if (now >= nextTime) {
        console.log('✅ [QUESTIONS AUTO] TEMPS ÉCOULÉ - Création de question maintenant !');
        await createRandomQuestion();
      } else {
        console.log('⏳ [QUESTIONS AUTO] Pas encore le moment, on attend...');
      }
    }, 10000);
    
    console.log('✅ [QUESTIONS AUTO] Timer créé et démarré (vérification toutes les 10s)');

    return () => {
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
      }
      if (firstQuestionTimeoutRef.current) {
        clearTimeout(firstQuestionTimeoutRef.current);
        firstQuestionTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barId, matchState, currentQuestion]);

  // 🔥 VÉRIFIER LES QUESTIONS EN ATTENTE PÉRIODIQUEMENT
  useEffect(() => {
    if (!barId || !matchState?.active || !selectedMatch) return;
    
    // Vérifier les questions en attente toutes les 10 secondes
    const interval = setInterval(() => {
      validatePendingQuestions();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [barId, matchState?.active, selectedMatch, currentMatchId]);

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
      if (firstQuestionTimeoutRef.current) {
        clearTimeout(firstQuestionTimeoutRef.current);
        firstQuestionTimeoutRef.current = null;
      }
      // 🔥 SYNCHRONISATION AVEC L'API EN TEMPS RÉEL
      console.log('🔄 Synchronisation avec l\'API...');
      let realTimeElapsed = selectedMatch?.elapsed || 0;
      let realTimeHalf = selectedMatch?.half || '1H';
      let realTimeScore = selectedMatch?.score || 'vs';
      
      if (selectedMatch?.id) {
        try {
          // Utiliser le proxy Vercel pour contourner CORS
          const data = await fetchFootballAPI('fixtures', { id: selectedMatch.id });
          
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
      
      const matchClockSyncAt = serverNow();
      const newMatchState = {
        active: true,
        startTime: now,
        nextQuestionTime: serverNow() + 2 * 60 * 1000,
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
          apiElapsed: realTimeElapsed,
          lastSyncAt: matchClockSyncAt,
          half: realTimeHalf,
          isPaused: PAUSE_STATUSES.has(realTimeHalf)
        }
      };
      
      // ==================== VALIDATION DIFFÉRÉE ====================
      const validatePendingQuestions = async () => {
        if (!barId || !selectedMatch || !currentMatchId) return;
        
        try {
          const pendingQuestionsRef = ref(db, `bars/${barId}/pendingQuestions`);
          const snap = await get(pendingQuestionsRef);
          
          if (!snap.exists()) return;
          
          const questions = snap.val();
          const now = Date.now();
          
          for (const [questionId, question] of Object.entries(questions)) {
            if (now >= question.validationTime) {
              console.log('⏰ Validation question:', question.text);
              await remove(ref(db, `bars/${barId}/pendingQuestions/${questionId}`));
            }
          }
        } catch (e) {
          console.error('Erreur validation:', e);
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
        
        // 🔥 RELANCER la surveillance quand on démarre le match
        if (selectedMatch?.id) {
          console.log('🚀 Relance startMatchMonitoring lors du démarrage');
          startMatchMonitoring(selectedMatch.id);
        }

        // 🔥 SYSTÈME DE QUESTIONS AUTOMATIQUES
        // Créer la première question immédiatement
        console.log('🚀 [START MATCH] Création première question dans 3 secondes...');
        setTimeout(async () => {
          console.log('🚀 [START MATCH] Timeout 3s déclenché - création première question');
          await createRandomQuestion();
        }, 3000); // 3 secondes après le démarrage

        // Puis créer une question toutes les 2 minutes automatiquement
        console.log('⏰ [START MATCH] Création interval questions automatiques (toutes les 2 minutes)');
        const questionInterval = setInterval(async () => {
          console.log('⏰ [START MATCH] Interval déclenché - vérification matchState.active:', matchState?.active);
          if (matchState?.active) {
            console.log('✅ [START MATCH] Génération automatique de question...');
            await createRandomQuestion();
          } else {
            console.log('⚠️ [START MATCH] Match non actif, question non créée');
          }
        }, 120000); // 2 minutes = 120000ms

        // Stocker l'interval pour pouvoir l'arrêter plus tard
        questionIntervalRef.current = questionInterval;
        console.log('✅ [START MATCH] Système de questions automatiques activé (toutes les 2 minutes)');
        console.log('✅ [START MATCH] questionIntervalRef stocké:', !!questionIntervalRef.current);
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
      await remove(ref(db, `bars/${barId}/lastQuestionResult`));
      await remove(ref(db, `bars/${barId}/pendingQuestions`));
      console.log('🗑️ Toutes les questions supprimées');
      
      // Nettoyer tous les timeouts
      if (cultureValidationTimeoutRef.current) {
        clearTimeout(cultureValidationTimeoutRef.current);
        cultureValidationTimeoutRef.current = null;
        console.log('🧹 Timeout validation culture annulé');
      }
      
      usedQuestionsRef.current = [];
      isProcessingRef.current = false;
      if (nextQuestionTimer.current) {
        clearInterval(nextQuestionTimer.current);
        nextQuestionTimer.current = null;
      }
      if (firstQuestionTimeoutRef.current) {
        clearTimeout(firstQuestionTimeoutRef.current);
        firstQuestionTimeoutRef.current = null;
      }
      if (questionIntervalRef.current) {
        clearInterval(questionIntervalRef.current);
        questionIntervalRef.current = null;
        console.log('🛑 Système de questions automatiques arrêté');
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

  const updateSimulationQuestionTimer = async (elapsedValue, halfValue, runningValue = true) => {
    const matchId = simulationMatchIdRef.current;
    if (!matchId) return;

    try {
      await update(ref(db, `matches/${matchId}/timer`), {
        elapsed: elapsedValue,
        half: halfValue,
        running: runningValue,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('❌ Erreur mise à jour timer questions simulation:', error);
    }
  };

  const recordSimulationQuestionEvent = async (eventData) => {
    const matchId = simulationMatchIdRef.current;
    if (!matchId) return;

    try {
      await set(ref(db, `matches/${matchId}/events/${eventData.id}`), eventData);
    } catch (error) {
      console.error('❌ Erreur enregistrement événement simulation:', error);
    }
  };

  const cleanupSimulationQuestionSystem = async () => {
    if (simulationQuestionSchedulerRef.current) {
      simulationQuestionSchedulerRef.current();
      simulationQuestionSchedulerRef.current = null;
    }
    const simBarId = barId || (typeof window !== 'undefined' ? window.simulationBarId : null);
    if (simBarId) {
      try {
        await update(ref(db, `bars/${simBarId}/matchState`), {
          questionMatchId: null
        });
      } catch (err) {
        console.error('❌ Erreur réinitialisation questionMatchId:', err);
      }
    }
    simulationMatchIdRef.current = null;
    setSimulationMatchId(null);
  };

  const startSimulation = async () => {
    try {
      const matchData = SIMULATION_MATCHES[selectedSimulationMatch];
      if (!matchData) {
        alert('❌ Aucun match sélectionné');
        return;
      }

      let simulationQuestionMatchId = null;
      try {
        simulationQuestionMatchId = await createSimulationMatch();
        setSimulationMatchId(simulationQuestionMatchId);
        simulationMatchIdRef.current = simulationQuestionMatchId;
        if (simulationQuestionSchedulerRef.current) {
          simulationQuestionSchedulerRef.current();
        }
        simulationQuestionSchedulerRef.current = startQuestionScheduler(simulationQuestionMatchId);
        await set(ref(db, `matches/${simulationQuestionMatchId}/timer`), {
          elapsed: 0,
          half: '1H',
          running: true,
          startedAt: Date.now()
        });
        await updateSimulationQuestionTimer(0, '1H', true);
      } catch (err) {
        console.error('❌ Erreur préparation des questions de simulation:', err);
        alert('❌ Impossible de préparer les questions du match de simulation');
        await cleanupSimulationQuestionSystem();
        return;
      }

      let simulationBarId = barId;

      if (!simulationBarId) {
        if (typeof window !== 'undefined' && window.simulationBarId) {
          simulationBarId = window.simulationBarId;
        } else {
          const newBarId = 'BAR-SIM-' + Date.now().toString(36).toUpperCase();

          await set(ref(db, `bars/${newBarId}`), {
            name: `Simulation ${matchData.homeTeam} vs ${matchData.awayTeam}`,
            createdAt: Date.now(),
            isSimulation: true
          });

          if (typeof window !== 'undefined') {
            window.simulationBarId = newBarId;
          }
          setBarId(newBarId);
          simulationBarId = newBarId;
          console.log('✅ Bar de simulation créé:', newBarId);
        }
      }

      simulationBarId = simulationBarId || (typeof window !== 'undefined' ? window.simulationBarId : null) || 'BAR-SIMULATION-TEST';

      console.log('🎬 Démarrage simulation:', {
        selectedMatch: selectedSimulationMatch,
        matchData,
        barId: simulationBarId
      });
      
      setSimulationActive(true);
      setSimulationElapsed(0);
      setSimulationScore({ home: 0, away: 0 });
      setSimulationHalf('1H');
      setSimulationLog([`🟢 0' - Coup d'envoi !`]);
      
      await set(ref(db, `bars/${simulationBarId}/simulation`), {
        active: true,
        match: matchData,
        elapsed: 0,
        score: '0-0',
        half: '1H',
        startedAt: Date.now()
      });
      
      console.log('✅ Firebase initialisé');

      await set(ref(db, `bars/${simulationBarId}/matchState`), {
        active: true,
        startedAt: Date.now(),
        questionCount: 0,
        nextQuestionTime: Date.now() + 120000,
        questionMatchId: simulationQuestionMatchId,
        matchInfo: {
          homeTeam: matchData.homeTeam,
          awayTeam: matchData.awayTeam,
          league: matchData.league,
          score: '0-0'
        },
        matchClock: {
          apiElapsed: 0,
          half: '1H',
          isPaused: false,
          lastSyncAt: Date.now()
        }
      });

      await set(ref(db, `bars/${simulationBarId}/selectedMatch`), {
        id: matchData.id,
        homeTeam: matchData.homeTeam,
        awayTeam: matchData.awayTeam,
        league: matchData.league,
        score: '0-0',
        elapsed: 0,
        half: '1H',
        status: 'LIVE'
      });

      console.log('✅ Système de questions activé');
      
      let elapsed = 0;
      let score = { home: 0, away: 0 };
      let half = '1H';
      let isPaused = false;
      
    simulationIntervalRef.current = setInterval(async () => {
        if (isPaused) return;
        
        elapsed++;
        console.log(`⏱️ ${elapsed}'`);
        
        await updateSimulationQuestionTimer(elapsed, half, true);

        if (elapsed === 45) {
          half = 'HT';
          setSimulationHalf('HT');
          setSimulationLog(prev => [...prev, `⏸️ 45' - Mi-temps`]);
          isPaused = true;
          
          await update(ref(db, `bars/${simulationBarId}/simulation`), {
            half: 'HT',
            elapsed: 45
          });
          await updateSimulationQuestionTimer(elapsed, half, false);
          
        setTimeout(() => {
          half = '2H';
          elapsed = 46;
          isPaused = false;
          setSimulationHalf('2H');
          setSimulationElapsed(46);
          setSimulationLog(prev => [...prev, `🟢 46' - Reprise 2ème mi-temps`]);
          updateSimulationQuestionTimer(46, half, true);
          console.log('🟢 Reprise 2ème mi-temps');
        }, 5000);
          
          return;
        }
        
        if (elapsed >= 90) {
          half = 'FT';
          setSimulationHalf('FT');
          setSimulationLog(prev => [...prev, `🏁 90' - Fin du match (${score.home}-${score.away})`]);
          clearInterval(simulationIntervalRef.current);
          simulationIntervalRef.current = null;
          setSimulationActive(false);
          
          await update(ref(db, `bars/${simulationBarId}/simulation`), {
            active: false,
            half: 'FT',
            elapsed: 90
          });
          await updateSimulationQuestionTimer(90, half, false);
          await cleanupSimulationQuestionSystem();
          
          console.log('🏁 Match terminé');
          return;
        }
        
      const currentEvents = matchData.events.filter(e => e.elapsed === elapsed);
      if (currentEvents.length > 0) {
        for (const event of currentEvents) {
          if (event.type === 'Goal') {
            if (event.team === 'home') score.home++;
            else score.away++;
            setSimulationScore({ ...score });
            const teamName = event.team === 'home' ? matchData.homeTeam : matchData.awayTeam;
            setSimulationLog(prev => [...prev, 
              `⚽ ${elapsed}' - BUT ! ${event.player} marque pour ${teamName} (${score.home}-${score.away})`
            ]);
            console.log(`⚽ ${elapsed}' - BUT de ${event.player}`);
          }
          if (event.type === 'Card') {
            const cardEmoji = event.detail === 'Red Card' ? '🟥' : '🟨';
            setSimulationLog(prev => [...prev, 
              `${cardEmoji} ${elapsed}' - ${event.detail} ${event.player ? 'pour ' + event.player : ''}`
            ]);
            console.log(`${cardEmoji} ${elapsed}' - ${event.detail}`);
          }
          await recordSimulationQuestionEvent({
            id: `sim_evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            type: event.type,
            detail: event.detail || (event.type === 'Goal' ? 'Goal' : null),
            team: {
              name: event.team === 'home' ? matchData.homeTeam : matchData.awayTeam,
              side: event.team
            },
            player: event.player ? { name: event.player } : null,
            time: { elapsed, extra: 0 },
            timestamp: Date.now()
          });
        }
        }
        
        setSimulationElapsed(elapsed);
        
        await update(ref(db, `bars/${simulationBarId}/simulation`), {
          elapsed,
          score: `${score.home}-${score.away}`,
          half
        });
        
    }, SIMULATION_MINUTE_MS);
      
      console.log('✅ Intervalle démarré (1 min = 60 secondes)');
      
    } catch (error) {
      console.error('❌ Erreur démarrage simulation:', error);
      alert('❌ Erreur lors du démarrage de la simulation : ' + error.message);
      await cleanupSimulationQuestionSystem();
      setSimulationActive(false);
    }
  };

  const stopSimulation = async () => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    const finalElapsed = simulationElapsed;
    const finalHalf = simulationHalf;

    if (simulationMatchIdRef.current) {
      await updateSimulationQuestionTimer(finalElapsed, finalHalf, false);
      await cleanupSimulationQuestionSystem();
    }

    setSimulationActive(false);
    setSimulationElapsed(0);
    setSimulationScore({ home: 0, away: 0 });
    setSimulationHalf('1H');
    setSimulationLog([]);
    setSelectedSimulationMatch(null);
    setSimulationPlayers({});
  };

  const handleJoinBar = async () => {
    console.log('📱 Mobile - barId:', barId);
    console.log('📱 Mobile - playerName:', playerName);

    const trimmedName = playerName.trim();
    if (!trimmedName) {
      alert('❌ Entre ton nom');
      return;
    }

    const effectiveBarId = barId || (typeof window !== 'undefined' ? window.simulationBarId : null);
    if (!effectiveBarId) {
      alert('❌ Code bar manquant');
      return;
    }

    try {
      const playerId = 'player-' + Date.now();
      const playerData = {
        id: playerId,
        name: trimmedName,
        score: 0,
        joinedAt: Date.now()
      };

      await set(ref(db, `bars/${effectiveBarId}/players/${playerId}`), playerData);
      console.log('✅ Joueur enregistré:', playerData, 'Path:', `bars/${effectiveBarId}/players/${playerId}`);

      setMyPlayerId(playerId);
      setHasJoined(true);
    } catch (error) {
      console.error('❌ Erreur enregistrement joueur:', error);
      alert('❌ Erreur: ' + error.message);
    }
  };

  useEffect(() => {
    if (!simulationActive) {
      setSimulationPlayers({});
      return;
    }
    const simMatch = SIMULATION_MATCHES[selectedSimulationMatch];
    if (!simMatch) return;

    const simulationBarId = barId || (typeof window !== 'undefined' ? window.simulationBarId : null) || 'BAR-SIMULATION-TEST';
    const playersPath = `bars/${simulationBarId}/players`;
    const playersRef = ref(db, playersPath);

    console.log('🎧 Écoute des joueurs sur:', playersPath);

    const unsubscribe = onValue(playersRef, (snapshot) => {
      console.log('📡 Snapshot joueurs reçu:', snapshot.exists(), snapshot.val());
      if (snapshot.exists()) {
        const players = snapshot.val();
        console.log('👥 Joueurs détectés:', Object.keys(players).length, players);
        setSimulationPlayers(players);
      } else {
        console.log('❌ Aucun joueur trouvé');
        setSimulationPlayers({});
      }
    });

    return () => {
      console.log('🔇 Arrêt écoute joueurs');
      unsubscribe();
    };
  }, [simulationActive, barId, selectedSimulationMatch]);

  const createRandomQuestion = async () => {
    console.log('🎲 [CREATE QUESTION] ========== DÉBUT CRÉATION QUESTION ==========');
    console.log('🎲 [CREATE QUESTION] barId:', barId);
    console.log('🎲 [CREATE QUESTION] currentMatchId:', currentMatchId);
    console.log('🎲 [CREATE QUESTION] matchState?.active:', matchState?.active);
    console.log('🎲 [CREATE QUESTION] matchState:', matchState);
    
    if (!barId || !currentMatchId || !matchState?.active) {
      console.warn('⚠️ [CREATE QUESTION] Conditions non remplies - arrêt');
      console.warn('⚠️ [CREATE QUESTION] barId:', !!barId);
      console.warn('⚠️ [CREATE QUESTION] currentMatchId:', !!currentMatchId);
      console.warn('⚠️ [CREATE QUESTION] matchState?.active:', matchState?.active);
      if (!matchState?.active) {
        alert('❌ Le match n\'est pas actif');
      }
      return;
    }
    
    console.log('✅ [CREATE QUESTION] Conditions OK - poursuite de la création');
    if (firstQuestionTimeoutRef.current) {
      clearTimeout(firstQuestionTimeoutRef.current);
      firstQuestionTimeoutRef.current = null;
    }
    
    try {
      const questionCount = matchState?.questionCount || 0;
      const now = Date.now();
      
      // 🔥 ALTERNANCE : pair = culture, impair = prédiction
      const shouldUseCulture = questionCount % 2 === 0;
      let questionData;
      
      // Vérifier le quota Claude
      const canGenerate = await checkClaudeQuota(db, ref, get, set, 200);
      const apiKey = import.meta.env.VITE_ANTHROPIC_KEY;
      console.log('🔑 API Key présente :', !!apiKey);
      console.log('✅ Quota OK :', canGenerate);
      
      // Contexte du match pour Claude AI
      const matchContext = {
        homeTeam: selectedMatch?.homeTeam || matchState?.matchInfo?.homeTeam || 'Équipe A',
        awayTeam: selectedMatch?.awayTeam || matchState?.matchInfo?.awayTeam || 'Équipe B',
        league: selectedMatch?.league || matchState?.matchInfo?.league || 'Football',
        score: selectedMatch?.score || matchState?.matchInfo?.score || 'vs',
        elapsed: matchState?.matchClock?.apiElapsed || 0,
        players: matchPlayers.map(p => p.name) || []
      };
      
      // 🔥 TOUJOURS ESSAYER CLAUDE AI D'ABORD si possible
      if (canGenerate && apiKey) {
        try {
          if (shouldUseCulture) {
            // 🧠 QUESTION CULTURE via Claude AI
            console.log('🧠 Génération question CULTURE avec Claude AI...');
            const claudeQuestion = await generateCultureQuestion(matchContext, apiKey);
            questionData = {
              text: claudeQuestion.question,
              options: claudeQuestion.options,
              correctAnswer: claudeQuestion.correctAnswer,
              explanation: claudeQuestion.explanation,
              id: now,
              createdAt: now,
              timeLeft: 15,
              type: 'culture',
              isFallback: claudeQuestion.isFallback || false
            };
            console.log('✅ Question culture créée:', claudeQuestion.question);
          } else {
            // 🔮 QUESTION PRÉDICTION via Claude AI
            console.log('🔮 Génération question PRÉDICTION avec Claude AI...');
            const claudeQuestion = await generatePredictionQuestion(matchContext, apiKey);
            questionData = {
              text: claudeQuestion.question,
              options: claudeQuestion.options,
              id: now,
              createdAt: now,
              timeLeft: 15,
              type: 'predictive',
              isFallback: claudeQuestion.isFallback || false
            };
            console.log('✅ Question prédiction créée:', claudeQuestion.question);
          }
        } catch (claudeError) {
          console.error('❌ Erreur génération Claude AI:', claudeError);
          console.warn('⚠️ Fallback sur questions prédéfinies');
          // Fallback sur questions prédéfinies en cas d'erreur
          let pool = QUESTIONS.filter(q => !usedQuestionsRef.current.includes(q.text));
          if (pool.length === 0) {
            usedQuestionsRef.current = [];
            pool = QUESTIONS.slice();
          }
          const question = pool[Math.floor(Math.random() * pool.length)];
          usedQuestionsRef.current.push(question.text);
          questionData = {
            ...question,
            id: now,
            createdAt: now,
            timeLeft: 15,
            type: 'predictive'
          };
        }
      } else {
        // Fallback si quota atteint ou clé API manquante
        console.warn('⚠️ Quota atteint ou clé API manquante, fallback sur QUESTIONS');
        let pool = QUESTIONS.filter(q => !usedQuestionsRef.current.includes(q.text));
        if (pool.length === 0) {
          usedQuestionsRef.current = [];
          pool = QUESTIONS.slice();
        }
        const question = pool[Math.floor(Math.random() * pool.length)];
        usedQuestionsRef.current.push(question.text);
        questionData = {
          ...question,
          id: now,
          createdAt: now,
          timeLeft: 15,
          type: 'predictive'
        };
      }
      
      await set(ref(db, `bars/${barId}/currentQuestion`), questionData);
      const nextTime = now + QUESTION_INTERVAL;
      await update(ref(db, `bars/${barId}/matchState`), {
        nextQuestionTime: nextTime,
        questionCount: questionCount + 1
      });
      console.log(`✅ Question ${questionData.type} publiée`);
      
      // 🔥 VALIDATION IMMÉDIATE pour les questions CULTURE (après 15 secondes)
      if (questionData.type === 'culture' && questionData.correctAnswer) {
        console.log('⏰ [CULTURE] Validation automatique programmée dans 15 secondes...');
        console.log('⏰ [CULTURE] Question ID:', questionData.id);
        console.log('⏰ [CULTURE] Bonne réponse:', questionData.correctAnswer);
        
        // Nettoyer le timeout précédent s'il existe
        if (cultureValidationTimeoutRef.current) {
          clearTimeout(cultureValidationTimeoutRef.current);
          console.log('🧹 [CULTURE] Ancien timeout annulé');
        }
        
        // Capturer les valeurs actuelles pour éviter les problèmes de closure
        const capturedBarId = barId;
        const capturedMatchId = currentMatchId;
        const capturedQuestionData = { ...questionData };
        
        console.log('📦 [CULTURE] Valeurs capturées - barId:', capturedBarId, 'matchId:', capturedMatchId);
        console.log('📦 [CULTURE] Question capturée:', capturedQuestionData.text);
        
        // Créer le nouveau timeout et stocker la référence
        cultureValidationTimeoutRef.current = setTimeout(async () => {
          console.log('✅ [CULTURE] VALIDATION MAINTENANT ! (15 secondes écoulées)');
          console.log('✅ [CULTURE] BarId capturé:', capturedBarId);
          console.log('✅ [CULTURE] MatchId capturé:', capturedMatchId);
          console.log('✅ [CULTURE] Question à valider:', capturedQuestionData.text);
          
          try {
            await autoValidateCultureQuestionWithParams(capturedQuestionData, capturedBarId, capturedMatchId);
            console.log('✅ [CULTURE] Validation terminée avec succès');
          } catch (error) {
            console.error('❌ [CULTURE] Erreur lors de la validation:', error);
          }
          cultureValidationTimeoutRef.current = null;
        }, 15000); // 15 secondes = temps de réponse
        
        console.log('✅ [CULTURE] Timeout créé et stocké:', cultureValidationTimeoutRef.current);
      }
    } catch (e) {
      console.error('❌ Erreur création question:', e);
      alert('❌ Erreur: ' + e.message);
    }
  };

  // 🔥 VALIDATION IMMÉDIATE pour les questions PRÉDICTIVES (quand l'événement arrive)
  const autoValidatePredictiveQuestion = async (questionData, correctAnswer) => {
    if (!questionData || !barId || !currentMatchId || !correctAnswer) {
      console.warn('⚠️ [PREDICTIVE] Données manquantes pour validation prédictive');
      return;
    }
    
    if (isProcessingRef.current) {
      console.warn('⚠️ [PREDICTIVE] Validation déjà en cours');
      return;
    }
    
    isProcessingRef.current = true;
    
    try {
      const qid = String(questionData.id);
      const answersPath = `bars/${barId}/answers/${qid}`;
      const playersPath = `bars/${barId}/matches/${currentMatchId}/players`;
      
      console.log('🔮 [PREDICTIVE] Validation immédiate question:', questionData.text);
      console.log('✅ [PREDICTIVE] Bonne réponse:', correctAnswer);
      
      // Récupérer toutes les réponses
      const answersSnap = await get(ref(db, answersPath));
      const counts = {};
      const byPlayer = {};
      
      if (answersSnap.exists()) {
        const raw = answersSnap.val();
        for (const [pid, a] of Object.entries(raw)) {
          counts[a.answer] = (counts[a.answer] || 0) + 1;
          byPlayer[pid] = a.answer;
        }
      }
      
      // Attribuer les points aux joueurs qui ont bien répondu
      const playersSnap = await get(ref(db, playersPath));
      if (playersSnap.exists()) {
        const playersData = playersSnap.val();
        const updates = {};
        const winners = [];
        
        for (const [pid, p] of Object.entries(playersData)) {
          const ans = byPlayer[pid];
          if (ans != null && ans === correctAnswer) {
            const newScore = (p.score || 0) + 10;
            updates[`${pid}/score`] = newScore;
            winners.push({
              userId: pid,
              pseudo: p.pseudo || pid,
              points: 10,
              newScore: newScore
            });
            console.log(`✅ [PREDICTIVE] ${p.pseudo || pid} a gagné 10 points (réponse: ${ans})`);
          }
        }
        
        if (Object.keys(updates).length) {
          await update(ref(db, playersPath), updates);
          console.log(`🎉 [PREDICTIVE] ${winners.length} joueur(s) ont gagné des points`);
        } else {
          console.log('😔 [PREDICTIVE] Aucun joueur n\'a trouvé la bonne réponse');
        }
      }
      
      // Enregistrer les résultats dans Firebase
      const resultData = {
        correctAnswer: correctAnswer,
        validatedAt: Date.now(),
        totals: counts,
        questionText: questionData.text,
        type: 'predictive',
        winners: winners
      };
      
      await set(ref(db, `bars/${barId}/results/${qid}`), resultData);
      
      // Publier le résultat pour les joueurs (lastQuestionResult)
      await set(ref(db, `bars/${barId}/lastQuestionResult`), {
        questionText: questionData.text,
        correctAnswer: correctAnswer,
        winners: winners,
        validatedAt: Date.now()
      });
      
      // Supprimer la question en cours et les réponses
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, answersPath));
      
      console.log('✅ [PREDICTIVE] Question prédictive validée et résultats publiés');
      
    } catch (err) {
      console.error('❌ [PREDICTIVE] Erreur validation prédictive:', err);
    } finally {
      isProcessingRef.current = false;
    }
  };

  // 🔥 VALIDATION IMMÉDIATE pour les questions CULTURE (avec paramètres capturés)
  const autoValidateCultureQuestionWithParams = async (questionData, capturedBarId, capturedMatchId) => {
    console.log('🧠 [CULTURE] Début validation avec params...');
    console.log('🧠 [CULTURE] questionData:', questionData);
    console.log('🧠 [CULTURE] barId:', capturedBarId);
    console.log('🧠 [CULTURE] matchId:', capturedMatchId);
    
    if (!questionData || !capturedBarId || !capturedMatchId) {
      console.warn('⚠️ [CULTURE] Données manquantes');
      return;
    }
    
    if (isProcessingRef.current) {
      console.warn('⚠️ [CULTURE] Validation déjà en cours');
      return;
    }
    
    isProcessingRef.current = true;
    console.log('🔒 [CULTURE] isProcessingRef verrouillé');
    
    try {
      const qid = String(questionData.id);
      const answersPath = `bars/${capturedBarId}/answers/${qid}`;
      const playersPath = `bars/${capturedBarId}/matches/${capturedMatchId}/players`;
      const correctAnswer = questionData.correctAnswer;
      
      console.log('🔍 [CULTURE] Question ID:', qid);
      console.log('🔍 [CULTURE] Answers path:', answersPath);
      console.log('🔍 [CULTURE] Players path:', playersPath);
      
      if (!correctAnswer) {
        console.error('❌ [CULTURE] Pas de correctAnswer pour la question culture');
        isProcessingRef.current = false;
        return;
      }
      
      console.log('🧠 [CULTURE] Validation immédiate question culture:', questionData.text);
      console.log('✅ [CULTURE] Bonne réponse:', correctAnswer);
      
      // Récupérer toutes les réponses
      console.log('📥 [CULTURE] Récupération des réponses...');
      const answersSnap = await get(ref(db, answersPath));
      const counts = {};
      const byPlayer = {};
      
      if (answersSnap.exists()) {
        const raw = answersSnap.val();
        console.log('📥 [CULTURE] Réponses trouvées:', Object.keys(raw).length);
        for (const [pid, a] of Object.entries(raw)) {
          counts[a.answer] = (counts[a.answer] || 0) + 1;
          byPlayer[pid] = a.answer;
        }
        console.log('📊 [CULTURE] Répartition des réponses:', counts);
      } else {
        console.log('⚠️ [CULTURE] Aucune réponse trouvée');
      }
      
      // Attribuer les points aux joueurs qui ont bien répondu
      console.log('👥 [CULTURE] Récupération des joueurs...');
      const playersSnap = await get(ref(db, playersPath));
      if (playersSnap.exists()) {
        const playersData = playersSnap.val();
        console.log('👥 [CULTURE] Joueurs trouvés:', Object.keys(playersData).length);
        const updates = {};
        const winners = [];
        
        for (const [pid, p] of Object.entries(playersData)) {
          const ans = byPlayer[pid];
          if (ans != null && ans === correctAnswer) {
            const newScore = (p.score || 0) + 10;
            updates[`${pid}/score`] = newScore;
            winners.push({
              userId: pid,
              pseudo: p.pseudo || pid,
              points: 10,
              newScore: newScore
            });
            console.log(`✅ [CULTURE] ${p.pseudo || pid} a gagné 10 points (réponse: ${ans})`);
          }
        }
        
        if (Object.keys(updates).length) {
          console.log('💾 [CULTURE] Mise à jour des scores...');
          await update(ref(db, playersPath), updates);
          console.log(`🎉 [CULTURE] ${winners.length} joueur(s) ont gagné des points`);
        } else {
          console.log('😔 [CULTURE] Aucun joueur n\'a trouvé la bonne réponse');
        }
      } else {
        console.log('⚠️ [CULTURE] Aucun joueur trouvé');
      }
      
      // Enregistrer les résultats dans Firebase
      const resultData = {
        correctAnswer: correctAnswer,
        validatedAt: Date.now(),
        totals: counts,
        questionText: questionData.text,
        type: 'culture',
        explanation: questionData.explanation || null,
        winners: winners
      };
      
      // Enregistrer les résultats dans Firebase
      console.log('💾 [CULTURE] Enregistrement des résultats...');
      await set(ref(db, `bars/${capturedBarId}/results/${qid}`), resultData);
      console.log('✅ [CULTURE] Résultats enregistrés dans Firebase');
      
      // Publier le résultat pour les joueurs (lastQuestionResult)
      console.log('📢 [CULTURE] Publication du résultat pour les joueurs...');
      await set(ref(db, `bars/${capturedBarId}/lastQuestionResult`), {
        questionText: questionData.text,
        correctAnswer: correctAnswer,
        explanation: questionData.explanation || null,
        winners: winners,
        validatedAt: Date.now()
      });
      console.log('✅ [CULTURE] Résultat publié pour les joueurs');
      
      // Supprimer la question en cours et les réponses
      console.log('🗑️ [CULTURE] Suppression de la question et des réponses...');
      await remove(ref(db, `bars/${capturedBarId}/currentQuestion`));
      await remove(ref(db, answersPath));
      console.log('✅ [CULTURE] Question et réponses supprimées');
      
      console.log('✅ [CULTURE] Question culture validée et résultats publiés avec succès !');
      
    } catch (err) {
      console.error('❌ [CULTURE] Erreur validation culture:', err);
    } finally {
      isProcessingRef.current = false;
      console.log('🔓 [CULTURE] isProcessingRef déverrouillé');
    }
  };

  // 🔥 VALIDATION IMMÉDIATE pour les questions CULTURE
  const autoValidateCultureQuestion = async (questionData) => {
    console.log('🧠 [CULTURE] Début validation culture...');
    console.log('🧠 [CULTURE] questionData:', questionData);
    console.log('🧠 [CULTURE] barId:', barId);
    console.log('🧠 [CULTURE] currentMatchId:', currentMatchId);
    
    if (!questionData || !barId || !currentMatchId) {
      console.warn('⚠️ [CULTURE] Données manquantes pour validation culture');
      return;
    }
    
    if (isProcessingRef.current) {
      console.warn('⚠️ [CULTURE] Validation déjà en cours');
      return;
    }
    
    isProcessingRef.current = true;
    console.log('🔒 [CULTURE] isProcessingRef verrouillé');
    
    try {
      const qid = String(questionData.id);
      const answersPath = `bars/${barId}/answers/${qid}`;
      const playersPath = `bars/${barId}/matches/${currentMatchId}/players`;
      const correctAnswer = questionData.correctAnswer;
      
      console.log('🔍 [CULTURE] Question ID:', qid);
      console.log('🔍 [CULTURE] Answers path:', answersPath);
      console.log('🔍 [CULTURE] Players path:', playersPath);
      
      if (!correctAnswer) {
        console.error('❌ [CULTURE] Pas de correctAnswer pour la question culture');
        isProcessingRef.current = false;
        return;
      }
      
      console.log('🧠 [CULTURE] Validation immédiate question culture:', questionData.text);
      console.log('✅ [CULTURE] Bonne réponse:', correctAnswer);
      
      // Récupérer toutes les réponses
      console.log('📥 [CULTURE] Récupération des réponses...');
      const answersSnap = await get(ref(db, answersPath));
      const counts = {};
      const byPlayer = {};
      
      if (answersSnap.exists()) {
        const raw = answersSnap.val();
        console.log('📥 [CULTURE] Réponses trouvées:', Object.keys(raw).length);
        for (const [pid, a] of Object.entries(raw)) {
          counts[a.answer] = (counts[a.answer] || 0) + 1;
          byPlayer[pid] = a.answer;
        }
        console.log('📊 [CULTURE] Répartition des réponses:', counts);
      } else {
        console.log('⚠️ [CULTURE] Aucune réponse trouvée');
      }
      
      // Attribuer les points aux joueurs qui ont bien répondu
      console.log('👥 [CULTURE] Récupération des joueurs...');
      const playersSnap = await get(ref(db, playersPath));
      if (playersSnap.exists()) {
        const playersData = playersSnap.val();
        console.log('👥 [CULTURE] Joueurs trouvés:', Object.keys(playersData).length);
        const updates = {};
        const winners = [];
        
        for (const [pid, p] of Object.entries(playersData)) {
          const ans = byPlayer[pid];
          if (ans != null && ans === correctAnswer) {
            const newScore = (p.score || 0) + 10;
            updates[`${pid}/score`] = newScore;
            winners.push({
              userId: pid,
              pseudo: p.pseudo || pid,
              points: 10,
              newScore: newScore
            });
            console.log(`✅ [CULTURE] ${p.pseudo || pid} a gagné 10 points (réponse: ${ans})`);
          }
        }
        
        if (Object.keys(updates).length) {
          console.log('💾 [CULTURE] Mise à jour des scores...');
          await update(ref(db, playersPath), updates);
          console.log(`🎉 [CULTURE] ${winners.length} joueur(s) ont gagné des points`);
        } else {
          console.log('😔 [CULTURE] Aucun joueur n\'a trouvé la bonne réponse');
        }
      } else {
        console.log('⚠️ [CULTURE] Aucun joueur trouvé');
      }
      
      // Enregistrer les résultats dans Firebase
      const resultData = {
        correctAnswer: correctAnswer,
        validatedAt: Date.now(),
        totals: counts,
        questionText: questionData.text,
        type: 'culture',
        explanation: questionData.explanation || null,
        winners: winners
      };
      
      // Enregistrer les résultats dans Firebase
      console.log('💾 [CULTURE] Enregistrement des résultats...');
      await set(ref(db, `bars/${barId}/results/${qid}`), resultData);
      console.log('✅ [CULTURE] Résultats enregistrés dans Firebase');
      
      // Publier le résultat pour les joueurs (lastQuestionResult)
      console.log('📢 [CULTURE] Publication du résultat pour les joueurs...');
      await set(ref(db, `bars/${barId}/lastQuestionResult`), {
        questionText: questionData.text,
        correctAnswer: correctAnswer,
        explanation: questionData.explanation || null,
        winners: winners,
        validatedAt: Date.now()
      });
      console.log('✅ [CULTURE] Résultat publié pour les joueurs');
      
      // Supprimer la question en cours et les réponses
      console.log('🗑️ [CULTURE] Suppression de la question et des réponses...');
      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, answersPath));
      console.log('✅ [CULTURE] Question et réponses supprimées');
      
      console.log('✅ [CULTURE] Question culture validée et résultats publiés avec succès !');
      
    } catch (err) {
      console.error('❌ Erreur validation culture:', err);
    } finally {
      isProcessingRef.current = false;
    }
  };

  const autoValidate = async () => {
    if (!currentQuestion || !barId) return;
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const qid = String(currentQuestion.id);
      const answersPath = `bars/${barId}/answers/${qid}`;
      const playersPath = `bars/${barId}/matches/${currentMatchId}/players`;

      const answersSnap = await get(ref(db, answersPath));
      const counts = {};
      const byPlayer = {};
      if (answersSnap.exists()) {
        const raw = answersSnap.val();
        for (const [pid, a] of Object.entries(raw)) {
          counts[a.answer] = (counts[a.answer] || 0) + 1;
          byPlayer[pid] = a.answer;
        }
      }

      let correctAnswer = null;

      if (currentQuestion.type === 'culture') {
        correctAnswer = currentQuestion.correctAnswer;
        console.log('🧠 Validation immédiate:', correctAnswer);
      } else {
        const majorityAnswer = Object.keys(counts).reduce((best, k) => {
          if (best == null) return k;
          return counts[k] > counts[best] ? k : best;
        }, null);
        
        const qType = detectQuestionType(currentQuestion.text);
        const winMin = parsePredictionWindowMinutes(currentQuestion.text);

        let simulationHandled = false;

        try {
          const simulationBarPath = barId || (typeof window !== 'undefined' ? window.simulationBarId : null);
          if (simulationBarPath) {
            const simulationRef = ref(db, `bars/${simulationBarPath}/simulation`);
            const simulationSnap = await get(simulationRef);

            if (simulationSnap.exists() && simulationSnap.val().active) {
              console.log('🎬 Validation en mode simulation');

              const simData = simulationSnap.val();
              const simEvents = simData.match?.events || [];
              const deltaMinutes = Math.floor((Date.now() - (currentQuestion.createdAt || Date.now())) / 60000);
              const startMin = Math.max(0, (simData.elapsed || 0) - deltaMinutes);
              const endMin = startMin + winMin;

              console.log(`🔍 Recherche events entre ${startMin}' et ${endMin}'`);

              const inWindow = (ev) => ev.elapsed >= startMin && ev.elapsed <= endMin;

              if (qType === 'goal') {
                const goals = simEvents.filter(ev => ev.type === 'Goal' && inWindow(ev));
                correctAnswer = goals.length > 0 ? 'Oui' : 'Non';
                console.log(`⚽ ${goals.length} buts trouvés → ${correctAnswer}`);
              } else if (qType === 'card') {
                const cards = simEvents.filter(ev => ev.type === 'Card' && ev.detail === 'Yellow Card' && inWindow(ev));
                correctAnswer = cards.length > 0 ? 'Oui' : 'Non';
                console.log(`🟨 ${cards.length} cartons jaunes trouvés → ${correctAnswer}`);
              } else if (qType === 'own_goal') {
                const ownGoals = simEvents.filter(ev => ev.type === 'Goal' && ev.detail === 'Own Goal' && inWindow(ev));
                correctAnswer = ownGoals.length > 0 ? 'Oui' : 'Non';
              }

              simulationHandled = true;
            }
          }
        } catch (simErr) {
          console.error('Simulation validation error:', simErr);
        }
        
        if (!simulationHandled) {
          try {
            const apiKey = import.meta.env.VITE_API_FOOTBALL_KEY;
            if (apiKey && selectedMatch?.id) {
              const { events, elapsedNow } = await fetchFixtureNow(selectedMatch.id, apiKey);
              const deltaMinutes = Math.floor((Date.now() - (currentQuestion.createdAt || Date.now())) / 60000);
              const startMin = Math.max(0, (elapsedNow ?? 0) - deltaMinutes);
              const endMin = startMin + winMin;
              const inWindow = (ev) => isInMinuteWindow(ev, startMin, endMin);
              
              if (qType === 'card') {
                const cards = events.filter(ev => ev?.type === 'Card' && inWindow(ev));
                correctAnswer = cards.length > 0 ? 'Oui' : 'Non';
              } else if (qType === 'own_goal') {
                const og = events.filter(ev => ev?.type === 'Goal' && ev?.detail === 'Own Goal' && inWindow(ev));
                correctAnswer = og.length > 0 ? 'Oui' : 'Non';
              } else if (qType === 'goal') {
                const goals = events.filter(ev => ev?.type === 'Goal' && inWindow(ev));
                correctAnswer = goals.length > 0 ? 'Oui' : 'Non';
              } else if (qType === 'corner') {
                const corners = events.filter(ev => ev?.detail === 'Corner' && inWindow(ev));
                if (corners.length > 0) correctAnswer = 'Oui';
              }
            }
          } catch (err) {
            console.error('Validation API error:', err);
          }
        }
        
        if (correctAnswer == null && majorityAnswer != null) {
          correctAnswer = majorityAnswer;
        }
      }

      const playersSnap = await get(ref(db, playersPath));
      if (playersSnap.exists()) {
        const playersData = playersSnap.val();
        const updates = {};
        for (const [pid, p] of Object.entries(playersData)) {
          const ans = byPlayer[pid];
          if (ans != null && correctAnswer != null && ans === correctAnswer) {
            updates[`${pid}/score`] = (p.score || 0) + 10;
          }
        }
        if (Object.keys(updates).length) {
          await update(ref(db, playersPath), updates);
        }
      }

      const resultData = {
        correctAnswer: correctAnswer ?? null,
        validatedAt: Date.now(),
        totals: counts,
        questionText: currentQuestion.text,
        type: currentQuestion.type
      };
      
      if (currentQuestion.type === 'culture' && currentQuestion.explanation) {
        resultData.explanation = currentQuestion.explanation;
      }
      
      await set(ref(db, `bars/${barId}/results/${qid}`), resultData);

      await remove(ref(db, `bars/${barId}/currentQuestion`));
      await remove(ref(db, answersPath));
    } catch (err) {
      console.error('autoValidate fatal error', err);
    } finally {
      isProcessingRef.current = false;
    }
  };
// === END PATCH ===

  // ==================== VALIDATION DIFFÉRÉE ====================
  const validatePendingQuestions = async () => {
    if (!barId || !selectedMatch || !currentMatchId) return;
    
    try {
      const pendingQuestionsRef = ref(db, `bars/${barId}/pendingQuestions`);
      const snap = await get(pendingQuestionsRef);
      
      if (!snap.exists()) return;
      
      const questions = snap.val();
      const now = Date.now();
      
      for (const [questionId, question] of Object.entries(questions)) {
        if (now >= question.validationTime) {
          console.log('⏰ Validation question:', question.text);
          await remove(ref(db, `bars/${barId}/pendingQuestions/${questionId}`));
        }
      }
    } catch (e) {
      console.error('Erreur validation:', e);
    }
  };

  const handleAnswer = async (answer) => {
    if (!barId || !currentQuestion || playerAnswer || !user) return;
    
    try {
      console.log('Mobile: réponse enregistrée', answer);
      console.log('Mobile: timeLeft =', timeLeft);
      console.log('Mobile: currentQuestion =', currentQuestion);
      
      setPlayerAnswer(answer);
      await set(ref(db, `bars/${barId}/answers/${currentQuestion.id}/${user.uid}`), {
        answer,
        timestamp: Date.now(),
        timeLeft
      });
      
      console.log('Mobile: réponse sauvegardée avec succès');
    } catch (e) {
      console.error('Erreur handleAnswer:', e);
      alert('Erreur lors de l\'enregistrement de la réponse: ' + e.message);
      setPlayerAnswer(null); // Réinitialiser en cas d'erreur
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

  const syncMatchData = async (fixtureId) => {
      try {
        console.log('🔄 Synchronisation API pour fixture:', fixtureId);
        
        // Utiliser le proxy Vercel pour contourner CORS
        const data = await fetchFootballAPI('fixtures', { id: fixtureId });
        
        if (data.response && data.response.length > 0) {
          const fixture = data.response[0];
        const matchData = {
          status: fixture.fixture.status.short,
          statusLong: fixture.fixture.status.long,
          elapsed: fixture.fixture.status.elapsed || 0,
          score: `${fixture.goals.home || 0}-${fixture.goals.away || 0}`,
          homeGoals: fixture.goals.home || 0,
          awayGoals: fixture.goals.away || 0,
          statusFull: fixture.fixture.status,
          rawFixture: fixture
        };
        
        console.log('📡 Données récupérées:', matchData);
        return matchData;
      }
      
      return null;
    } catch (e) {
      console.error('❌ Erreur sync API:', e);
      return null;
    }
  };

  const startMatchMonitoring = (fixtureId) => {
    console.log('🚀 START MONITORING - fixture:', fixtureId);
    
    if (matchCheckInterval.current) {
            clearInterval(matchCheckInterval.current);
            matchCheckInterval.current = null;
          }

    const performSync = async () => {
      try {
        console.log('⏰ CHECK à', new Date().toLocaleTimeString());
        
        const matchData = await syncMatchData(fixtureId);
        
        if (!matchData) {
          console.warn('⚠️ Pas de données reçues');
          return;
        }
        
        console.log('📡 Status API:', matchData.status);
        
        // 🔥 DÉTECTER LA FIN DU MATCH
        const matchFinished = ['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(matchData.status);
        
        if (matchFinished) {
          console.log('🏁 MATCH TERMINÉ ! Arrêt du quiz...');
          
          const finalScore = matchData.score;
          
          // Arrêter le match
          if (barId) {
            await update(ref(db, `bars/${barId}/matchState`), {
              active: false,
              endTime: Date.now(),
              finalStatus: matchData.status,
              matchClock: {
                apiElapsed: 90,
                half: 'FT',
                isPaused: true,
                lastSyncAt: serverNow()
              },
              matchInfo: {
                score: finalScore
              }
            });
            
            // Mettre à jour selectedMatch
            await update(ref(db, `bars/${barId}/selectedMatch`), {
              half: 'FT',
              score: finalScore
            });
            
            // Supprimer la question en cours
            await remove(ref(db, `bars/${barId}/currentQuestion`));
            
            // Notifier les joueurs
            const notifRef = push(ref(db, `bars/${barId}/notifications`));
            await set(notifRef, {
              type: 'matchEnd',
              message: '🏁 Match terminé ! Merci d\'avoir joué !',
              timestamp: Date.now()
            });
            
            console.log('✅ Firebase mis à jour - Match arrêté');
          }
          
          // Arrêter la surveillance
          stopMatchMonitoring();
          
          return;
        }
        
        const fixture = matchData.rawFixture;
        if (fixture) {
          const statusShort = fixture.fixture.status.short;
          const apiElapsed = fixture.fixture.status.elapsed || 0;
          const isPaused = PAUSE_STATUSES.has(statusShort);
          
          // 🔥 VALIDATION IMMÉDIATE des questions PRÉDICTIVES si l'événement arrive
          try {
            if (barId) {
              // Récupérer la question en cours depuis Firebase (plus fiable que currentQuestion state)
              const currentQuestionSnap = await get(ref(db, `bars/${barId}/currentQuestion`));
              
              if (currentQuestionSnap.exists()) {
                const currentQuestionData = currentQuestionSnap.val();
                
                if (currentQuestionData && currentQuestionData.type === 'predictive') {
                  const events = Array.isArray(fixture.events) ? fixture.events : [];
                  console.log('🎯 [PREDICTIVE] Vérification événements pour validation immédiate');
                  console.log('❓ [PREDICTIVE] Question en cours:', currentQuestionData.text);
                  console.log('📊 [PREDICTIVE] Nombre d\'événements:', events.length);
                  
                  // Détecter si un événement correspond à la question prédictive
                  const questionText = (currentQuestionData.text || '').toLowerCase();
                  const qType = detectQuestionType(questionText);
                  const winMin = parsePredictionWindowMinutes(questionText);
                  const questionCreatedAt = currentQuestionData.createdAt || Date.now();
                  const deltaMinutes = Math.floor((Date.now() - questionCreatedAt) / 60000);
                  const startMin = Math.max(0, apiElapsed - deltaMinutes);
                  const endMin = startMin + winMin;
                  
                  console.log('🔍 [PREDICTIVE] Fenêtre de validation:', `${startMin}' - ${endMin}'`);
                  console.log('🔍 [PREDICTIVE] Type recherché:', qType);
                  
                  let eventFound = false;
                  let correctAnswer = null;
                  
                  for (const ev of events) {
                    const evMin = (ev?.time?.elapsed || 0) + ((ev?.time?.extra || 0) / 1);
                    
                    if (evMin >= startMin && evMin <= endMin) {
                      console.log('🎯 [PREDICTIVE] Événement détecté:', ev.type, 'à', evMin, 'minutes');
                      
                      if (qType === 'goal' && ev.type === 'Goal') {
                        eventFound = true;
                        correctAnswer = 'Oui';
                        console.log('✅ [PREDICTIVE] VALIDATION IMMÉDIATE - But détecté !');
                        break;
                      } else if (qType === 'card' && ev.type === 'Card') {
                        const detail = (ev.detail || '').toLowerCase();
                        if (questionText.includes('jaune') && detail.includes('yellow')) {
                          eventFound = true;
                          correctAnswer = 'Oui';
                          console.log('✅ [PREDICTIVE] VALIDATION IMMÉDIATE - Carton jaune détecté !');
                          break;
                        } else if (questionText.includes('rouge') && detail.includes('red')) {
                          eventFound = true;
                          correctAnswer = 'Oui';
                          console.log('✅ [PREDICTIVE] VALIDATION IMMÉDIATE - Carton rouge détecté !');
                          break;
                        }
                      } else if (qType === 'corner' && (ev.type === 'Corner' || (ev.detail || '').toLowerCase().includes('corner'))) {
                        eventFound = true;
                        correctAnswer = 'Oui';
                        console.log('✅ [PREDICTIVE] VALIDATION IMMÉDIATE - Corner détecté !');
                        break;
                      } else if (qType === 'penalty' && (ev.type === 'Penalty' || (ev.detail || '').toLowerCase().includes('penalty'))) {
                        eventFound = true;
                        correctAnswer = 'Oui';
                        console.log('✅ [PREDICTIVE] VALIDATION IMMÉDIATE - Penalty détecté !');
                        break;
                      }
                    }
                  }
                  
                  if (eventFound && correctAnswer) {
                    console.log('🚀 [PREDICTIVE] LANCEMENT VALIDATION IMMÉDIATE...');
                    // Valider immédiatement la question prédictive
                    await autoValidatePredictiveQuestion(currentQuestionData, correctAnswer);
                  } else if (!eventFound && qType !== 'unknown') {
                    console.log('⏳ [PREDICTIVE] Aucun événement correspondant pour l\'instant');
                  }
                }
              }
            }
          } catch (predError) {
            console.error('❌ [PREDICTIVE] Erreur validation immédiate:', predError);
          }

          if (currentMatchId && barId) {
            await update(ref(db, `bars/${barId}/matchState`), {
              matchClock: {
                apiElapsed,
                lastSyncAt: serverNow(),
                half: statusShort,
                isPaused
              }
            });

            // Pause / Resume scheduler + Stop on finished
            if (currentMatchId && barId) {
              // 1) If finished -> stop match & cleanup
              if (FINISHED_STATUSES.has(statusShort)) {
                await update(ref(db, `bars/${barId}/matchState`), {
                  active: false,
                  endTime: serverNow(),
                  nextQuestionTime: null
                });
                await remove(ref(db, `bars/${barId}/currentQuestion`));
                // optional: clear answers bucket of last question if any
                // (safe if nothing there)
                // NOTE: we don't know the last question id here; we just keep as-is.
              }
              // 2) If paused (e.g., HT) -> freeze scheduler
              else if (PAUSE_STATUSES.has(statusShort)) {
                await update(ref(db, `bars/${barId}/matchState`), { nextQuestionTime: null });
              }
              // 3) If live -> ensure a next question is scheduled (unless one is already running)
              else if (LIVE_STATUSES.has(statusShort)) {
                const cqSnap = await get(ref(db, `bars/${barId}/currentQuestion`));
                const nxtSnap = await get(ref(db, `bars/${barId}/matchState/nextQuestionTime`));
                const hasQuestion = cqSnap.exists();
                const hasNext = nxtSnap.exists() && !!nxtSnap.val();
                if (!hasQuestion && !hasNext) {
                  await set(ref(db, `bars/${barId}/matchState/nextQuestionTime`), serverNow() + 30000);
                }
              }
            }

            // --- Resolve pending WINDOW_EVENT / NEXT_GOAL predictions ---
            try {
              if (barId && currentMatchId) {
                const pendSnap = await get(ref(db, `bars/${barId}/matches/${currentMatchId}/pendingQuestions`));
                if (pendSnap.exists()) {
                  const pend = pendSnap.val();
                  const pendIds = Object.keys(pend);
                  const events = Array.isArray(fixture.events) ? fixture.events : [];

                  for (const qid of pendIds) {
                    const pq = pend[qid];

                    // -------- window_event --------
                    if (pq.kind === 'window_event') {
                      const startM = Number(pq.startedAtElapsed) || 0;
                      const endM   = Number(pq.resolveAtElapsed) || (startM + Number(pq.windowMinutes || 0));

                      if (apiElapsed >= endM) {
                        let happened = false;
                        for (const ev of events) {
                          const evMin = Number(ev?.time?.elapsed) || 0;
                          if (evMin >= startM && evMin <= endM) {
                            if (eventMatchesType(ev, pq.eventType)) { happened = true; break; }
                          }
                        }
                        const correctAnswer = happened ? 'Oui' : 'Non';

                        // scoring Oui/Non
                        const answersSnap = await get(ref(db, `bars/${barId}/answers/${qid}`));
                        if (answersSnap.exists()) {
                          const answersData = answersSnap.val();
                          const playersRef = ref(db, `bars/${barId}/matches/${currentMatchId}/players`);
                          const playersSnap = await get(playersRef);
                          if (playersSnap.exists()) {
                            const playersData = playersSnap.val();
                            const updates = {};
                            Object.entries(answersData).forEach(([uid, a]) => {
                              const ans = (a && a.answer !== undefined) ? a.answer : a;
                              if (ans === correctAnswer && playersData[uid]) {
                                updates[`${uid}/score`] = (playersData[uid].score || 0) + 1;
                              }
                            });
                            if (Object.keys(updates).length) await update(playersRef, updates);
                          }
                        }

                        await set(ref(db, `bars/${barId}/matches/${currentMatchId}/resolved/${qid}`), {
                          ...pq, resolvedAt: serverNow(), correctAnswer
                        });
                        await remove(ref(db, `bars/${barId}/matches/${currentMatchId}/pendingQuestions/${qid}`));
                        await remove(ref(db, `bars/${barId}/answers/${qid}`));
                      }
                    }

                    // -------- next_goal --------
                    if (pq.kind === 'next_goal') {
                      const startM = Number(pq.startedAtElapsed) || 0;
                      const endM   = (pq.resolveAtElapsed != null) ? Number(pq.resolveAtElapsed) : null;
                      const options = Array.isArray(pq.options) ? pq.options : [];

                      const goalEvents = events
                        .filter(ev => (ev.type || '').toLowerCase() === 'goal')
                        .map(ev => ({
                          minute: Number(ev?.time?.elapsed) || 0,
                          player: ev?.player?.name || '',
                          team: ev?.team?.name || ''
                        }))
                        .sort((a,b) => a.minute - b.minute);

                      let firstGoal = null;
                      for (const g of goalEvents) {
                        if (g.minute > startM && (endM == null || g.minute <= endM)) { firstGoal = g; break; }
                      }

                      const shouldResolve = (endM == null) ? !!firstGoal : (firstGoal || apiElapsed >= endM);

                      if (shouldResolve) {
                        let correctOption = null;
                        if (firstGoal) {
                          correctOption = findMatchingOption(options, firstGoal.player, firstGoal.team);
                        } else if (hasAucune(options)) {
                          correctOption = options.find(o => {
                            const n = norm(o); return n === 'aucune' || n === 'aucun';
                          });
                        }

                        if (correctOption) {
                          const answersSnap = await get(ref(db, `bars/${barId}/answers/${qid}`));
                          if (answersSnap.exists()) {
                            const answersData = answersSnap.val();
                            const playersRef  = ref(db, `bars/${barId}/matches/${currentMatchId}/players`);
                            const playersSnap = await get(playersRef);
                            if (playersSnap.exists()) {
                              const playersData = playersSnap.val();
                              const updates = {};
                              Object.entries(answersData).forEach(([uid, a]) => {
                                const ans = (a && a.answer !== undefined) ? a.answer : a;
                                if (ans && norm(ans) === norm(correctOption) && playersData[uid]) {
                                  updates[`${uid}/score`] = (playersData[uid].score || 0) + 1;
                                }
                              });
                              if (Object.keys(updates).length) await update(playersRef, updates);
                            }
                          }
                        }

                        await set(ref(db, `bars/${barId}/matches/${currentMatchId}/resolved/${qid}`), {
                          ...pq, resolvedAt: serverNow(), correctAnswer: correctOption || null
                        });
                        await remove(ref(db, `bars/${barId}/matches/${currentMatchId}/pendingQuestions/${qid}`));
                        await remove(ref(db, `bars/${barId}/answers/${qid}`));
                      }
                    }
                  }
                }
              }
            } catch (err) {
              console.error('prediction resolver error:', err);
            }
          }
        }
      } catch (error) {
        console.error('❌ ERREUR CRITIQUE dans performSync:', error);
        console.error('Stack trace:', error.stack);
        // Ne pas stopper l'interval, continuer à essayer
      }
    };

    // Synchroniser immédiatement
    performSync(); // Immédiat
    
    // Puis toutes les 10 secondes
    matchCheckInterval.current = setInterval(performSync, 10000); // Toutes les 10s
    
    console.log('✅ Interval créé:', matchCheckInterval.current);
  };

  const stopMatchMonitoring = () => {
    if (matchCheckInterval.current) {
      clearInterval(matchCheckInterval.current);
      matchCheckInterval.current = null;
    }
  };

  const MatchClock = () => {
    const [time, setTime] = useState('0:00');
    const [phase, setPhase] = useState('1ère MT');

    useEffect(() => {
      const updateTime = () => {
        const apiElapsed = matchState?.matchClock?.apiElapsed ?? 0;
        const currentHalf = matchState?.matchClock?.half ?? 'NS';
        const isPaused = matchState?.matchClock?.isPaused ?? false;
        const lastSyncAt = matchState?.matchClock?.lastSyncAt ?? Date.now();

        if (!matchState?.matchClock) {
          setTime('0:00');
          setPhase('En attente');
          return;
        }

        let mins = apiElapsed;
        let secs = 0;

        if (LIVE_STATUSES.has(currentHalf) && !isPaused) {
          const driftMs = Date.now() - lastSyncAt;
          const driftMins = Math.floor(driftMs / 60000);
          const driftSecs = Math.floor((driftMs % 60000) / 1000);
          mins = apiElapsed + driftMins;
          secs = driftSecs;
        }

        let displayTime;
        let displayPhase;

        if (FINISHED_STATUSES.has(currentHalf)) {
          displayTime = '90:00';
          displayPhase = '🏁 TERMINÉ';
        } else if (currentHalf === 'HT') {
          displayTime = '45:00';
          displayPhase = '⏸️ MI-TEMPS';
        } else if (currentHalf === '1H') {
          if (mins < 45) {
            displayTime = `${mins}:${secs.toString().padStart(2, '0')}`;
            displayPhase = '1ère MT';
          } else {
            displayTime = `45+${mins - 45}`;
            displayPhase = '1ère MT';
          }
        } else if (currentHalf === '2H') {
          if (mins < 90) {
            displayTime = `${mins}:${secs.toString().padStart(2, '0')}`;
            displayPhase = '2ème MT';
          } else {
            displayTime = `90+${mins - 90}`;
            displayPhase = '2ème MT';
          }
        } else {
          displayTime = `${mins}:${secs.toString().padStart(2, '0')}`;
          displayPhase = currentHalf || 'EN COURS';
        }

        setTime(displayTime);
        setPhase(displayPhase);
      };

      updateTime();
      const interval = setInterval(updateTime, 1000);
      return () => clearInterval(interval);
    }, [matchState?.matchClock]);

    return (
      <div className="bg-black rounded-xl px-6 py-3 border-2 border-green-500 shadow-lg">
        <div className="text-6xl font-mono font-black text-green-400 text-center">
          {time}
        </div>
        <div className="text-sm font-bold text-green-300 text-center mt-1">
          {phase}
        </div>
      </div>
    );
  };

  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">⚽</div>
          <h1 className="text-6xl font-black text-white mb-4">QUIZ BUTEUR</h1>
          <p className="text-2xl text-green-200">Pronostics en temps réel</p>
        </div>
        
        <div className="flex gap-6 flex-wrap justify-center">
          <button 
            onClick={() => setScreen('adminLogin')}
            className="bg-green-700 text-white px-12 py-8 rounded-2xl text-3xl font-bold hover:bg-green-600 transition-all shadow-2xl border-4 border-white"
          >
            🎮 ADMIN BAR
          </button>
          <button 
            onClick={() => setScreen('superAdminLogin')}
            className="bg-red-600 text-white px-12 py-8 rounded-2xl text-3xl font-black hover:bg-red-500 transition-all shadow-2xl shadow-red-700/40 border-4 border-red-500"
          >
            👑 GESTIONNAIRE
          </button>
          <button 
            onClick={() => setScreen('demo')}
            className="bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 rounded-3xl p-12 text-white shadow-2xl transform hover:scale-105 transition-all"
          >
            <div className="text-6xl mb-4">🎬</div>
            <div className="text-4xl font-black mb-2">DEMO</div>
            <div className="text-lg opacity-90">Mode test sans API réelle</div>
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
    if (!barId) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex flex-col items-center justify-center p-8">
          <div className="bg-white rounded-3xl p-10 max-w-md w-full shadow-2xl text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-3xl font-black text-red-900 mb-4">CODE BAR MANQUANT</h2>
            <p className="text-gray-600 mb-6 text-xl">
              Le code bar est requis pour rejoindre le quiz.
            </p>
            <button 
              onClick={() => window.location.href = '/'}
              className="bg-green-900 text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-green-800"
            >
              ← Retour à l'accueil
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">⚽</div>
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
    if (!barId) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-3xl font-black text-red-900 mb-4">CODE BAR MANQUANT</h2>
            <p className="text-gray-600 mb-6">
              Le code bar est requis pour se connecter.
            </p>
            <button 
              onClick={() => setScreen('playJoin')}
              className="bg-green-900 text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-green-800 mb-4"
            >
              ← Retour
            </button>
            <button 
              onClick={() => window.location.href = '/'}
              className="w-full text-gray-600 py-2 text-sm underline"
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      );
    }

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

  if (!user && screen === 'mobile') {
    setScreen('auth');
    return null;
  }

  if (screen === 'mobile' && user) {
    if (!barId) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-3xl font-black text-red-900 mb-4">CODE BAR MANQUANT</h2>
            <p className="text-gray-600 mb-6">
              Le code bar est requis pour jouer.
            </p>
            <button 
              onClick={() => window.location.href = '/'}
              className="bg-green-900 text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-green-800"
            >
              ← Retour à l'accueil
            </button>
          </div>
        </div>
      );
    }

    if (!hasJoined) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-black text-green-900 mb-2">{barInfo?.name || 'Quiz Buteur'}</h2>
            <p className="text-gray-600 mb-6">Entre ton nom pour rejoindre le quiz</p>

            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Ton nom ou pseudo"
              className="w-full px-6 py-4 text-xl border-4 border-green-900 rounded-xl mb-4 focus:outline-none focus:border-green-600"
            />

            <button
              onClick={handleJoinBar}
              className="bg-green-600 hover:bg-green-700 px-8 py-4 rounded-xl text-white font-bold text-xl w-full"
            >
              ✅ Rejoindre le quiz
            </button>
          </div>
        </div>
      );
    }

    try {
      const myScore = players.find(p => p.id === user?.uid);
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

            {/* 🔥 NOUVEAU : Toujours afficher le match en cours */}
            {(selectedMatch || matchState?.matchInfo) && (
              <div className="bg-gradient-to-r from-blue-900 to-green-900 rounded-xl p-4 shadow-lg mb-4">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    {(selectedMatch?.homeLogo || matchState?.matchInfo?.homeLogo) && (
                      <img 
                        src={selectedMatch?.homeLogo || matchState?.matchInfo?.homeLogo} 
                        alt="Home"
                        className="w-8 h-8 object-contain bg-white rounded"
                      />
                    )}
                    <div className="text-white text-xl font-bold">
                      {selectedMatch?.homeTeam || matchState?.matchInfo?.homeTeam}
                    </div>
                    <div className="text-yellow-400 text-2xl font-black mx-2">
                      {selectedMatch?.score || matchState?.matchInfo?.score || 'vs'}
                    </div>
                    <div className="text-white text-xl font-bold">
                      {selectedMatch?.awayTeam || matchState?.matchInfo?.awayTeam}
                    </div>
                    {(selectedMatch?.awayLogo || matchState?.matchInfo?.awayLogo) && (
                      <img 
                        src={selectedMatch?.awayLogo || matchState?.matchInfo?.awayLogo} 
                        alt="Away"
                        className="w-8 h-8 object-contain bg-white rounded"
                      />
                    )}
                  </div>
                  <div className="text-xs text-green-200">{selectedMatch?.league || matchState?.matchInfo?.league}</div>
                  {matchState?.active ? (
                    <div className="text-red-400 font-bold mt-1 text-sm">🔴 MATCH EN COURS</div>
                  ) : (
                    <div className="text-gray-300 font-bold mt-1 text-sm">⏸️ Match terminé</div>
                  )}
                </div>
              </div>
            )}

          {currentQuestion?.text && currentQuestion?.options ? (
            <div className="bg-white rounded-3xl p-8 shadow-2xl">
              <div className="flex items-center justify-center gap-2 mb-4">
                {currentQuestion.type === 'culture' ? (
                  <div className="bg-purple-100 px-4 py-2 rounded-full flex items-center gap-2">
                    <span className="text-2xl">🧠</span>
                    <span className="text-sm font-bold text-purple-900">CULTURE FOOT</span>
                  </div>
                ) : (
                  <div className="bg-blue-100 px-4 py-2 rounded-full flex items-center gap-2">
                    <span className="text-2xl">🔮</span>
                    <span className="text-sm font-bold text-blue-900">PRÉDICTION</span>
                  </div>
                )}
              </div>

              {/* Le reste du code (timer, question, options) reste inchangé */}
              <div className="text-center mb-6">
                  <div className="text-6xl font-black text-green-900 mb-2">{timeLeft || 0}s</div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-600 transition-all" style={{ width: `${((timeLeft || 0) / 15) * 100}%` }} />
                    </div>
                  </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">{currentQuestion.text}</h3>
              <div className="space-y-3">
                {currentQuestion.options.map((opt, i) => (
                  <button
                    key={i}
                      onClick={async () => {
                        if (!playerAnswer && user && barId && currentQuestion) {
                          try {
                            setPlayerAnswer(opt);
                            const timestamp = Date.now();
                            
                            // Enregistrer la réponse
                            await set(ref(db, `bars/${barId}/answers/${currentQuestion.id}/${user.uid}`), {
                              answer: opt,
                              timestamp: timestamp,
                              timeLeft: timeLeft || 0
                            });
                            
                            // Sauvegarder dans l'historique personnel
                            await set(ref(db, `bars/${barId}/playerHistory/${user.uid}/${currentQuestion.id}`), {
                              question: currentQuestion.text,
                              myAnswer: opt,
                              allOptions: currentQuestion.options,
                              timestamp: timestamp,
                              correctAnswer: null,
                              isCorrect: null,
                              validationDelay: currentQuestion.validationDelay || 0
                            });
                            
                            // 🔥 NOUVEAU : Supprimer la question du state local immédiatement
                            setCurrentQuestion(null);
                            setPlayerAnswer(null);
                            
                            console.log('✅ Réponse enregistrée:', opt);
                          } catch (e) {
                            console.error('❌ Erreur enregistrement réponse:', e);
                            alert('Erreur: ' + e.message);
                            setPlayerAnswer(null);
                          }
                        }
                      }}
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
            ) : lastQuestionResult ? (
              <div className="bg-white rounded-3xl p-8 shadow-2xl">
                <div className="text-center mb-6">
                  {/* 🔥 FEEDBACK VISUEL pour bonne réponse */}
                  {lastQuestionResult.winners && Array.isArray(lastQuestionResult.winners) && lastQuestionResult.winners.some(w => w.userId === user?.uid) ? (
                    <div className="mb-6 animate-bounce">
                      <div className="text-6xl mb-2">💚</div>
                      <div className="text-6xl mb-3">👍</div>
                      <div className="text-2xl text-green-500 font-bold">Bonne réponse !</div>
                    </div>
                  ) : (
                    <div className="text-5xl mb-4">❌</div>
                  )}
                  <h3 className="text-2xl font-bold text-gray-800 mb-4">{lastQuestionResult.questionText || ''}</h3>
                  <div className="bg-green-100 rounded-xl p-4 mb-4">
                    <p className="text-lg font-semibold text-green-800">
                      ✅ Bonne réponse : <span className="font-black">{lastQuestionResult.correctAnswer || ''}</span>
                    </p>
                  </div>
                  {lastQuestionResult.winners && Array.isArray(lastQuestionResult.winners) && lastQuestionResult.winners.length > 0 ? (
                    <div className="bg-blue-50 rounded-xl p-4 mb-4">
                      <p className="text-sm font-semibold text-blue-800 mb-2">🏆 Gagnants :</p>
                      <div className="space-y-2">
                        {lastQuestionResult.winners.map((winner, i) => (
                          <div key={i} className={`flex justify-between items-center p-2 rounded ${
                            winner.userId === user?.uid ? 'bg-yellow-200 font-bold' : 'bg-white'
                          }`}>
                            <span className={winner.userId === user?.uid ? 'text-yellow-900' : 'text-gray-700'}>
                              {winner.pseudo || 'Joueur'}
                            </span>
                            <span className={`font-bold ${winner.userId === user?.uid ? 'text-yellow-900' : 'text-green-600'}`}>
                              +{winner.points || 0} pts
                            </span>
                          </div>
                        ))}
                      </div>
              </div>
            ) : (
                    <div className="bg-gray-100 rounded-xl p-4 mb-4">
                      <p className="text-gray-600">Personne n'a trouvé la bonne réponse</p>
                    </div>
                  )}
                  {lastQuestionResult.winners && Array.isArray(lastQuestionResult.winners) && lastQuestionResult.winners.some(w => w.userId === user?.uid) && (
                    <div className="bg-yellow-100 rounded-xl p-4">
                      <p className="text-lg font-bold text-yellow-900">
                        🎊 Bravo ! Vous avez gagné {lastQuestionResult.winners.find(w => w.userId === user?.uid)?.points || 0} points !
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-3xl p-12 text-center shadow-2xl mb-4">
              <div className="text-6xl mb-4">⚽</div>
              <p className="text-2xl text-gray-600 font-semibold mb-4">Match en cours...</p>
              {matchState?.active && countdown && (
                <p className="text-lg text-gray-500">Prochaine question dans {countdown}</p>
              )}
              {(!matchState || !matchState.active) && (
                <p className="text-lg text-gray-500">En attente du démarrage</p>
            )}
                </div>

                {/* 🔥 HISTORIQUE DES RÉPONSES */}
                <div className="bg-white rounded-2xl p-6 shadow-xl mb-4">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">📝 Mes réponses</h2>
                  
                  {answerHistory.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <div className="text-5xl mb-3">📋</div>
                      <p className="text-lg">Aucune réponse pour le moment</p>
                      <p className="text-sm mt-2">Répondez aux questions pour voir votre historique ici</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {answerHistory.slice(0, 10).map((item) => (
                        <div 
                          key={item.id} 
                          className={`p-4 rounded-xl border-2 ${
                            item.isCorrect === true 
                              ? 'bg-green-50 border-green-400' 
                              : item.isCorrect === false 
                              ? 'bg-red-50 border-red-400'
                              : 'bg-blue-50 border-blue-300'
                          }`}
                        >
                          {/* Question */}
                          <div className="text-sm font-bold text-gray-900 mb-3">
                            {item.question}
                          </div>
                          
                          {/* Ma réponse */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600">Ma réponse:</span>
                              <span className={`font-bold text-base ${
                                item.isCorrect === true 
                                  ? 'text-green-600' 
                                  : item.isCorrect === false 
                                  ? 'text-red-600'
                                  : 'text-blue-600'
                              }`}>
                                {item.myAnswer}
                              </span>
                            </div>
                            <div className="text-2xl">
                              {item.isCorrect === true && '✅'}
                              {item.isCorrect === false && '❌'}
                              {item.isCorrect === null && '⏳'}
                            </div>
                          </div>
                          
                          {/* 🔥 NOUVEAU : Afficher si en attente de validation */}
                          {item.isCorrect === null && item.validationDelay > 0 && (
                            <div className="bg-blue-100 border border-blue-300 rounded-lg p-2 mt-2">
                              <span className="text-xs text-blue-700">
                                ⏰ En attente de validation ({Math.floor(item.validationDelay / 60000)} minutes)
                              </span>
          </div>
          )}
                          
                          {/* Bonne réponse si incorrecte */}
                          {item.isCorrect === false && item.correctAnswer && (
                            <div className="bg-green-100 border border-green-300 rounded-lg p-2 mt-2">
                              <span className="text-xs text-green-700">Bonne réponse:</span>
                              <span className="text-sm font-bold text-green-800 ml-2">
                                {item.correctAnswer}
                              </span>
                            </div>
                          )}
                          
                          {/* Timestamp */}
                          <div className="text-xs text-gray-400 mt-2">
                            {new Date(item.timestamp).toLocaleTimeString('fr-FR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      );
    } catch (e) {
      console.error('Erreur dans le rendu de l\'écran mobile:', e);
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-3xl font-black text-red-900 mb-4">ERREUR</h2>
            <p className="text-gray-600 mb-6">
              Une erreur est survenue. Veuillez recharger la page.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-green-900 text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-green-800"
            >
              Recharger
            </button>
        </div>
      </div>
    );
    }
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

    // Utiliser simplement ?bar= au lieu de /play?bar= car Vercel redirige tout vers /
    const qrUrl = `${window.location.origin}/?bar=${barId}`;
    const matchInfo = selectedMatch || matchState?.matchInfo;
    const hasMatchInfo = matchInfo?.homeTeam && matchInfo?.awayTeam;
    
    const isMatchFinished = matchState?.matchClock?.half === 'FT' || 
                           selectedMatch?.half === 'FT' ||
                           ['FT', 'AET', 'PEN'].includes(matchState?.matchClock?.half) ||
                           ['FT', 'AET', 'PEN'].includes(selectedMatch?.half);
    
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
              <div className={`mb-3 p-4 rounded-xl border-2 ${
                isMatchFinished 
                  ? 'bg-gradient-to-r from-red-900/50 to-orange-900/50 border-red-500'
                  : 'bg-gradient-to-r from-blue-900/50 to-purple-900/50 border-blue-500'
              }`}>
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
                    {(() => {
                      const clockData = matchState?.matchClock;
                      const shortStatus = clockData?.half ?? selectedMatch?.half ?? 'NS';
                      let elapsedMinutes = clockData?.apiElapsed ?? selectedMatch?.elapsed ?? 0;

                      if (clockData?.lastSyncAt && LIVE_STATUSES.has(shortStatus) && !clockData?.isPaused) {
                        const drift = Math.floor((Date.now() - clockData.lastSyncAt) / 60000);
                        if (drift > 0) elapsedMinutes += drift;
                      }

                      const clockText = formatMatchTime(shortStatus, elapsedMinutes);
                      const phaseText = formatHalfLabel(shortStatus);

                      return (
                        <div className="text-2xl font-bold mt-2">
                          {clockText} {phaseText && `- ${phaseText}`}
                        </div>
                      );
                    })()}
                    {!matchState?.matchClock?.isPaused && !FINISHED_STATUSES.has(matchState?.matchClock?.half) && matchState?.active && (
                      <div className="text-red-400 font-bold mt-2">🔴 MATCH EN COURS</div>
                    )}
                    {isMatchFinished && (
                      <p className="text-3xl font-black text-red-400 mt-2 animate-pulse">
                        🏁 MATCH TERMINÉ
                      </p>
                    )}
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

            {currentQuestion && (
              <div className={`p-4 rounded-xl mt-4 ${
                currentQuestion.type === 'culture' 
                  ? 'bg-purple-900/30 border-2 border-purple-500' 
                  : 'bg-blue-900/30 border-2 border-blue-500'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{currentQuestion.type === 'culture' ? '🧠' : '🔮'}</span>
                  <div>
                    <span className="text-lg font-bold text-white block">
                      {currentQuestion.type === 'culture' ? 'CULTURE FOOT' : 'PRÉDICTION'}
                    </span>
                    <span className="text-sm text-gray-300">{currentQuestion.text}</span>
                  </div>
                </div>
              </div>
            )}
            
            {matchState?.matchClock?.isPaused && matchState?.active && (
              <div className="bg-yellow-900/50 p-4 rounded-xl border-2 border-yellow-500 mt-3">
                <p className="text-2xl text-yellow-300 font-bold text-center animate-pulse">
                  ⏸️ MATCH EN PAUSE
                </p>
              </div>
            )}

            {matchState?.active && countdown && !isMatchFinished && (
              <div className="space-y-2">
                <p className="text-xl text-yellow-400">⏱️ Prochaine: {countdown}</p>
                <MatchClock />
          </div>
            )}
            {isMatchFinished && (
              <div className="bg-red-900/50 p-4 rounded-xl border-2 border-red-500 mt-3">
                <p className="text-3xl text-red-300 font-black text-center">🏁 QUIZ TERMINÉ</p>
              </div>
            )}
            {(!matchState || !matchState.active) && !isMatchFinished && (
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

  if (screen === 'demo') {
    const windowSimId = typeof window !== 'undefined' ? window.simulationBarId : null;
    const displayedCode = barId || windowSimId || 'BAR-SIM-TEST';
    const isProdVercel = typeof window !== 'undefined' && /\.vercel\.app$/.test(window.location.hostname);
    const baseUrl = isProdVercel ? 'https://quiz-buteur-2.vercel.app' : window.location.origin;
    const joinUrl = `${baseUrl}/?bar=${displayedCode}`;
    const simulationUserId = user?.uid || 'sim-user';
    console.log('🎬 Mode simulation - barId:', barId, 'window.simulationBarId:', windowSimId);
    if (!simulationActive) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-purple-900 to-pink-900 p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-white flex items-center gap-4">
              <span className="text-5xl">🎬</span>
              Mode Simulation
            </h1>
            <button 
              onClick={async () => {
                await stopSimulation();
                setScreen('home');
              }}
              className="bg-white hover:bg-gray-100 px-6 py-3 rounded-xl font-bold text-purple-900 transition-all"
            >
              ← Retour Accueil
            </button>
          </div>

          <div className="bg-white rounded-3xl p-8 max-w-5xl mx-auto mb-6">
            <h2 className="text-3xl font-bold mb-4 text-purple-900">📋 Matchs disponibles</h2>
            <p className="text-gray-600 mb-6">Sélectionne un match à rejouer en temps réel</p>
            <p className="text-purple-600 text-sm mb-6">
              ⚡ Mode accéléré : 20 minutes réelles = 90 minutes de match (ratio x4.5)
              <br />
              🎯 Questions toutes les 2 minutes réelles (~10 questions au total)
            </p>
            
            <div className="grid grid-cols-1 gap-4">
              {['psg-om', 'liverpool-city', 'real-barca'].map((key) => {
                const matchInfoSim = SIMULATION_MATCHES[key];
                return (
                  <div
                    key={key}
                    onClick={() => {
                      if (!simulationActive) {
                        setSelectedSimulationMatch(key);
                        setSimulationLog([]);
                      }
                    }}
                    className={`border-4 rounded-xl p-6 cursor-pointer transition-all ${
                      simulationActive ? 'opacity-50 cursor-not-allowed' :
                      selectedSimulationMatch === key 
                        ? 'border-purple-600 bg-purple-50' 
                        : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="text-5xl">⚽</div>
                        <div>
                          <div className="text-2xl font-bold">{matchInfoSim.homeTeam} vs {matchInfoSim.awayTeam}</div>
                          <div className="text-gray-600">{matchInfoSim.league} • Score final: {matchInfoSim.finalScore}</div>
                          <div className="text-sm text-purple-600 mt-1">
                            {matchInfoSim.events.length} events • {matchInfoSim.events.filter(e => e.type === 'Goal').length} buts
                          </div>
                        </div>
                      </div>
                      {selectedSimulationMatch === key && !simulationActive && (
                        <div className="text-3xl">✅</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedSimulationMatch && (
            <div className="bg-white rounded-3xl p-8 max-w-5xl mx-auto">
              <h3 className="text-2xl font-bold mb-6 text-purple-900">
                {SIMULATION_MATCHES[selectedSimulationMatch].homeTeam} vs{' '}
                {SIMULATION_MATCHES[selectedSimulationMatch].awayTeam}
              </h3>
              
              <button
                onClick={startSimulation}
                className="bg-green-600 hover:bg-green-700 px-12 py-6 rounded-xl text-white text-2xl font-bold w-full shadow-xl transition-all"
              >
                ▶️ LANCER LA SIMULATION (20 min réelles = 90 min match)
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-pink-900 p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-white flex items-center gap-4">
            <span className="text-5xl">🎬</span>
            Mode Démo
          </h1>
          <button 
            onClick={async () => {
              await stopSimulation();
              setScreen('home');
            }}
            className="bg-white hover:bg-gray-100 px-6 py-3 rounded-xl font-bold text-purple-900 transition-all"
          >
            ← Retour Accueil
          </button>
        </div>

        <div className="grid lg:grid-cols-1 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center justify-center gap-4 mb-4">
                {demoMatchInfo?.homeLogo && <img src={demoMatchInfo.homeLogo} alt={demoMatchInfo.homeTeam} className="w-10 h-10 object-contain" />}
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-900">
                    {demoMatchInfo?.homeTeam || 'PSG'} <span className="mx-2 text-gray-700">0 - 0</span> {demoMatchInfo?.awayTeam || 'OM'}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">⏱️ {demoElapsed}'</div>
                </div>
                {demoMatchInfo?.awayLogo && <img src={demoMatchInfo.awayLogo} alt={demoMatchInfo.awayTeam} className="w-10 h-10 object-contain" />}
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-bold text-purple-900 mb-2">📢 Événements</h3>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {demoEvents.length === 0 ? (
                    <p className="text-gray-500 text-sm">Aucun événement pour l’instant</p>
                  ) : (
                    demoEvents.filter(evt => (evt.time?.elapsed || 0) <= demoElapsed).map(evt => (
                      <div key={evt.id} className="text-sm text-gray-800 flex items-center gap-2">
                        <span className="font-bold text-gray-600">{evt.time?.elapsed || 0}'</span>
                        <span className="text-gray-900">
                          {evt.type === 'Card' ? (evt.detail === 'Red Card' ? '🟥' : '🟨') :
                           evt.type?.toLowerCase() === 'var' ? '🖥️ VAR' :
                           evt.type?.toLowerCase() === 'subst' ? '🔁 Changement' : '⚽ Événement'}
                        </span>
                        <span className="truncate">{evt.team?.name}</span>
                        {evt.player?.name && <span className="truncate">- {evt.player?.name}</span>}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-6 text-center">
                <div className="flex justify-center mb-3">
                  <QRCodeSVG value={joinUrl} size={160} level="H" />
                </div>
                <p className="text-gray-500 text-sm">
                  Scanne ce QR code pour rejoindre depuis un mobile
                </p>
              </div>
            </div>

            <div className="bg-white/95 rounded-3xl p-6 shadow-2xl">
              <div className="grid grid-cols-12 gap-3 text-xs font-bold text-gray-600 mb-3 px-3">
                <div className="col-span-1">#</div>
                <div className="col-span-7">JOUEUR</div>
                <div className="col-span-4 text-right">SCORE</div>
              </div>
              <div className="space-y-1">
                {demoPlayers.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-4">👥</div>
                    <p className="text-xl">En attente de joueurs...</p>
                  </div>
                ) : (
                  demoPlayers.slice(0, 16).map((p, i) => (
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

            {simulationMatchId && (
              <div className="bg-white/90 rounded-3xl p-6 shadow-xl text-center">
                <p className="text-sm uppercase text-purple-500 font-bold mb-1">Match de test</p>
                <p className="text-xl font-black text-gray-900">{simulationMatchId}</p>
              </div>
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
                  const now = Date.now();
                  const matchTime = match.timestamp || 0;
                  const status = match.statusShort || match.half || 'NS';
                  
                  const isFinished = ['FT', 'AET', 'PEN'].includes(status) || (matchTime < now - 7200000);
                  const isLive = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status);
                  const isUpcoming = status === 'NS' && matchTime > now;
                  
                  return (
                    <div
                      key={match.id}
                      onClick={() => !isUpcoming && !isFinished && selectMatch(match)}
                      className={`p-4 rounded-lg transition-all ${
                        isUpcoming || isFinished
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
                                🔴 LIVE {match.elapsed || 0}'
                              </span>
                            )}
                            {isUpcoming && (
                              <span className="text-xs bg-yellow-600 px-2 py-1 rounded font-bold">
                                ⏰ À VENIR
                              </span>
                            )}
                            {isFinished && (
                              <span className="text-xs bg-gray-600 px-2 py-1 rounded font-bold">
                                ✅ TERMINÉ
                              </span>
                            )}
                          </div>
                          <div className="text-lg font-bold">
                            {match.homeTeam} {match.score} {match.awayTeam}
                          </div>
                          <div className="text-sm text-gray-400">{match.date}</div>
                        </div>
                        {match.awayLogo && <img src={match.awayLogo} alt="" className="w-8 h-8" />}
                        {(isUpcoming || isFinished) && <div className="text-2xl ml-4">🔒</div>}
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
                    ⚽ Démarrer
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
                      if (!window.confirm('⚠️ Arrêter le match manuellement ?')) return;
                      
                      await update(ref(db, `bars/${barId}/matchState`), {
                        active: false,
                        matchClock: {
                          half: 'FT'
                        }
                      });
                      
                      await remove(ref(db, `bars/${barId}/currentQuestion`));
                      
                      stopMatchMonitoring();
                      
                      alert('✅ Match arrêté');
                    }}
                    className="bg-orange-600 px-8 py-4 rounded-lg text-xl font-bold hover:bg-orange-700"
                  >
                    🛑 Arrêter manuellement
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
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Update
