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

  // (Toutes les fonctions utilitaires et useEffect originaux sont inchangés — omitted here for brevity in reading)
  // Assurez-vous de conserver le reste du contenu original du fichier (les useEffect et fonctions existantes).

  // NOTE: ci-dessous seules les sections UI modifiées sont montrées intégralement (home + admin).
  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 flex flex-col items-center justify-center p-8">
        <div className="text-center mb-12">
          <div className="text-8xl mb-6">⚽</div>
          <h1 className="text-6xl font-black text-white mb-4">QUIZ BUTEUR</h1>
        <p className="text-2xl text-green-200">Pronostics en temps réel</p>
        </div>
        
        <div className="flex gap-4">
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

  // ... (toutes les autres vues non modifiées)

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

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setBarId(null);
                  setScreen('home');
                }}
                className="bg-red-600 px-6 py-3 rounded-lg hover:bg-red-700"
              >
                🚪 Changer de bar
              </button>

              {/* Nouveau : bouton ÉCRAN placé dans la section Admin (même action que l'ancien bouton d'accueil) */}
              <button
                onClick={() => setScreen('tv')}
                className="bg-white text-green-900 px-4 py-2 rounded-lg text-lg font-bold hover:bg-green-100"
                title="Voir l'écran"
              >
                📺 ÉCRAN
              </button>
            </div>
          </div>

          {/* Le reste du contenu Admin (recherche de match, contrôle, etc.) reste identique */}
          {/* ... */}
        </div>
      </div>
    );
  }

  return null;
}