import React, { useState, useEffect } from 'react';
import { Trophy, Timer, Smartphone, Tv, Clock, AlertCircle, Play, Users } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://uezcsehqvruhndjxyadf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlemNzZWhxdnJ1aG5kanh5YWRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1NTYwNzksImV4cCI6MjA3NjEzMjA3OX0.Ub4edn7eHHotvUdFERqmzunyXIhDA9xmpLsGW2Fj6Bw'
);

export default function App() {
  const [viewMode, setViewMode] = useState('select');
  const [screen, setScreen] = useState('welcome');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [score, setScore] = useState(0);
  
  const [matchState, setMatchState] = useState({
    homeTeam: "PSG",
    awayTeam: "OM",
    homeScore: 1,
    awayScore: 1,
    matchMinute: 45,
    isActive: false
  });

  const [activeQuestion, setActiveQuestion] = useState(null);
  const [pendingBets, setPendingBets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [events, setEvents] = useState([]);

  const players = {
    PSG: ["Mbappé", "Neymar", "Messi"],
    OM: ["Alexis Sanchez", "Payet", "Guendouzi"]
  };

  const questionTemplates = [
    {
      question: "Qui va marquer le prochain but ?",
      choices: [
        { name: "Mbappé", team: "PSG", odds: "2.5" },
        { name: "Neymar", team: "PSG", odds: "3.0" },
        { name: "Messi", team: "PSG", odds: "2.8" }
      ],
      eventType: "goal"
    }
  ];

  useEffect(() => {
    const initSession = async () => {
      const { data: sessions } = await supabase
        .from('match_sessions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        setSessionId(sessions[0].id);
      } else {
        const { data: newSession } = await supabase
          .from('match_sessions')
          .insert([{
            home_team: 'PSG',
            away_team: 'OM',
            home_score: 1,
            away_score: 1,
            match_minute: 45,
            is_active: true
          }])
          .select()
          .single();
        
        if (newSession) {
          setSessionId(newSession.id);
        }
      }
    };

    initSession();
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel('quiz-updates')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'players', filter: `match_session_id=eq.${sessionId}` },
        async () => {
          await loadLeaderboard();
        }
      )
      .subscribe();

    loadLeaderboard();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId]);

  const loadLeaderboard = async () => {
    if (!sessionId) return;
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('match_session_id', sessionId)
      .order('score', { ascending: false });
    
    if (data) {
      setLeaderboard(data.map((p, idx) => ({
        ...p,
        trend: idx < 2 ? 'up' : idx > 4 ? 'down' : 'same'
      })));
    }
  };

  const startQuiz = async () => {
    if (!playerName.trim() || !sessionId) return;

    const { data: newPlayer } = await supabase
      .from('players')
      .insert([{
        match_session_id: sessionId,
        name: playerName,
        score: 0
      }])
      .select()
      .single();
    
    if (newPlayer) {
      setPlayerId(newPlayer.id);
      setScore(0);
    }

    setScreen('quiz');
  };

  const generateQuestion = () => {
    const template = questionTemplates[0];
    setActiveQuestion({ ...template, id: Date.now(), timeLeft: 30 });
  };

  const addNotification = (message) => {
    setNotifications(prev => [{ id: Date.now(), message }, ...prev.slice(0, 3)]);
  };

  if (viewMode === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 rounded-full mb-6">
              <Trophy className="w-12 h-12 text-yellow-300" />
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">Quiz Buteur Live</h1>
            <p className="text-white/80 text-xl">Multijoueur • Temps réel</p>
            {leaderboard.length > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 text-green-400">
                <Users className="w-5 h-5" />
                <span>{leaderboard.length} joueur{leaderboard.length > 1 ? 's' : ''} connecté{leaderboard.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <button onClick={() => setViewMode('mobile')} className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border-2 border-white/20 hover:border-yellow-300 transition-all">
              <Smartphone className="w-16 h-16 text-blue-300 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white">📱 Jouer</h2>
            </button>
            <button onClick={() => setViewMode('tv')} className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border-2 border-white/20 hover:border-yellow-300 transition-all">
              <Tv className="w-16 h-16 text-purple-300 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white">📺 Écran Bar</h2>
            </button>
          </div>
        </div>
      </div>
    );
    if (viewMode === 'tv') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
        <button onClick={() => setViewMode('select')} className="mb-4 px-4 py-2 bg-white/10 text-white rounded-lg">← Menu</button>
        
        <div className="bg-blue-600/10 rounded-xl p-3 mb-4 border border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-white font-semibold text-lg">{matchState.homeTeam}</div>
              <div className="text-yellow-300 font-bold text-2xl">{matchState.homeScore}-{matchState.awayScore}</div>
              <div className="text-white font-semibold text-lg">{matchState.awayTeam}</div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <Users className="w-4 h-4" />
                {leaderboard.length}
              </div>
              <div className="text-white/60 text-sm">{matchState.matchMinute}'</div>
            </div>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <h2 className="text-white text-sm font-semibold uppercase">Classement Live</h2>
          </div>
          <div className="space-y-1">
            {leaderboard.length === 0 ? (
              <div className="text-white/40 text-center py-8">En attente de joueurs...</div>
            ) : (
              leaderboard.map((player, idx) => (
                <div key={player.id} className="rounded-lg p-2.5 border bg-white/5 border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="text-white/50 text-sm w-8 text-center">{idx + 1}</div>
                      <div className="text-white text-base">{player.name}</div>
                    </div>
                    <div className="text-yellow-400 font-semibold text-base">{player.score}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="fixed bottom-4 right-4 bg-white/10 rounded-xl p-3 border border-white/10">
          <div className="bg-white rounded-lg p-2 mb-1.5">
            <div className="w-24 h-24 flex items-center justify-center text-4xl">📲</div>
          </div>
          <div className="text-white text-xs text-center">Scanne</div>
        </div>
      </div>
    );
  }

  if (screen === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 flex flex-col">
        <button onClick={() => setViewMode('select')} className="m-4 px-4 py-2 bg-white/10 text-white rounded-lg self-start">← Retour</button>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
            <div className="text-center mb-8">
              <Play className="w-16 h-16 text-yellow-300 mx-auto mb-4" />
              <h1 className="text-4xl font-bold text-white mb-2">Quiz Buteur</h1>
              <p className="text-green-100 text-lg">Multijoueur • Temps réel</p>
              {leaderboard.length > 0 && (
                <div className="mt-4 flex items-center justify-center gap-2 text-green-300">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">{leaderboard.length} joueur{leaderboard.length > 1 ? 's' : ''} en ligne</span>
                </div>
              )}
            </div>
            <input
              type="text"
              placeholder="Ton prénom..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && startQuiz()}
              className="w-full px-6 py-4 rounded-xl bg-white/20 border border-white/30 text-white placeholder-green-200 text-lg mb-6 focus:outline-none focus:ring-2 focus:ring-yellow-300"
            />
            <button onClick={startQuiz} disabled={!playerName.trim()} className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold py-4 rounded-xl text-xl disabled:opacity-50 flex items-center justify-center gap-2">
              <Play className="w-6 h-6" />
              Rejoindre
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900 p-4">
      <div className="flex gap-2 mb-4">
        <button onClick={() => setViewMode('select')} className="px-4 py-2 bg-white/10 text-white rounded-lg">← Menu</button>
        <button onClick={() => setViewMode('tv')} className="px-4 py-2 bg-purple-500/30 text-white rounded-lg">📺 Écran</button>
        <button onClick={generateQuestion} className="ml-auto px-4 py-2 bg-yellow-500/30 text-white rounded-lg">Question test</button>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="bg-white/10 rounded-2xl p-4 mb-4 border border-white/20">
          <div className="flex justify-between items-center">
            <div className="text-white">
              <div className="text-sm text-white/70">Joueur</div>
              <div className="font-bold text-lg">{playerName}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-white/70">Score</div>
              <div className="font-bold text-2xl text-yellow-300">{score}</div>
            </div>
          </div>
        </div>

        {notifications.length > 0 && (
          <div className="space-y-2 mb-4">
            {notifications.map(n => (
              <div key={n.id} className="bg-blue-500/20 rounded-xl p-3 text-white text-sm">{n.message}</div>
            ))}
          </div>
        )}

        {!activeQuestion ? (
          <div className="bg-white/10 rounded-xl p-8 border border-white/20 text-center">
            <AlertCircle className="w-12 h-12 text-blue-300 mx-auto mb-3" />
            <div className="text-white text-lg mb-4">En attente...</div>
            <button onClick={generateQuestion} className="px-6 py-3 bg-yellow-500 text-white font-bold rounded-lg">
              Générer question (test)
            </button>
          </div>
        ) : (
          <div className="bg-white/10 rounded-xl p-4 border border-white/20">
            <h3 className="text-white font-bold text-lg mb-3">{activeQuestion.question}</h3>
            <div className="grid gap-2">
              {activeQuestion.choices.map((choice, idx) => (
                <button key={idx} className="bg-white/10 hover:bg-white/20 rounded-lg p-3 text-left">
                  <div className="flex justify-between items-center">
                    <div className="text-white font-semibold">{choice.name}</div>
                    <div className="text-yellow-300 font-bold">×{choice.odds}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
  }
