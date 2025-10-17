import React, { useState, useEffect } from 'react';

const QUESTION_BANK = [
  {
    id: 'goal',
    question: '⚽ Qui va marquer le prochain but ?',
    options: ['Mbappé', 'Haaland', 'Lewandowski', 'Autre joueur'],
    points: 200,
    timer: 60
  },
  {
    id: 'corner',
    question: '⛳ Quelle équipe aura le prochain corner ?',
    options: ['PSG', 'Bayern'],
    points: 100,
    timer: 45
  },
  {
    id: 'card',
    question: '🟨 Quelle équipe recevra le prochain carton ?',
    options: ['PSG', 'Bayern', 'Aucun'],
    points: 150,
    timer: 60
  },
  {
    id: 'sub',
    question: '🔄 Quelle équipe fera le prochain changement ?',
    options: ['PSG', 'Bayern'],
    points: 120,
    timer: 45
  }
];

const AI_PLAYERS = [
  { id: '1', name: 'Thomas', score: 450, isAI: true },
  { id: '2', name: 'Marie', score: 380, isAI: true },
  { id: '3', name: 'Alex', score: 320, isAI: true },
  { id: '4', name: 'Lucas', score: 310, isAI: true },
  { id: '5', name: 'Sophie', score: 290, isAI: true },
  { id: '6', name: 'Hugo', score: 275, isAI: true },
  { id: '7', name: 'Emma', score: 260, isAI: true },
  { id: '8', name: 'Nathan', score: 245, isAI: true },
  { id: '9', name: 'Léa', score: 230, isAI: true },
  { id: '10', name: 'Louis', score: 215, isAI: true },
  { id: '11', name: 'Chloé', score: 200, isAI: true },
  { id: '12', name: 'Arthur', score: 190, isAI: true },
  { id: '13', name: 'Camille', score: 180, isAI: true },
  { id: '14', name: 'Tom', score: 170, isAI: true },
  { id: '15', name: 'Julie', score: 160, isAI: true },
  { id: '16', name: 'Gabriel', score: 155, isAI: true },
  { id: '17', name: 'Zoé', score: 150, isAI: true },
  { id: '18', name: 'Raphaël', score: 145, isAI: true },
  { id: '19', name: 'Laura', score: 140, isAI: true },
  { id: '20', name: 'Adam', score: 135, isAI: true },
  { id: '21', name: 'Manon', score: 130, isAI: true },
  { id: '22', name: 'Enzo', score: 125, isAI: true },
  { id: '23', name: 'Alice', score: 120, isAI: true },
  { id: '24', name: 'Victor', score: 115, isAI: true },
  { id: '25', name: 'Inès', score: 110, isAI: true },
  { id: '26', name: 'Paul', score: 105, isAI: true },
  { id: '27', name: 'Charlotte', score: 100, isAI: true },
  { id: '28', name: 'Jules', score: 95, isAI: true },
  { id: '29', name: 'Lola', score: 90, isAI: true },
  { id: '30', name: 'Mathis', score: 85, isAI: true },
  { id: '31', name: 'Jade', score: 80, isAI: true },
  { id: '32', name: 'Timéo', score: 75, isAI: true },
  { id: '33', name: 'Lily', score: 70, isAI: true },
  { id: '34', name: 'Maxime', score: 65, isAI: true },
  { id: '35', name: 'Nina', score: 60, isAI: true },
  { id: '36', name: 'Ethan', score: 55, isAI: true },
  { id: '37', name: 'Rose', score: 50, isAI: true },
  { id: '38', name: 'Nolan', score: 45, isAI: true },
  { id: '39', name: 'Anna', score: 40, isAI: true },
  { id: '40', name: 'Antoine', score: 35, isAI: true },
  { id: '41', name: 'Eva', score: 30, isAI: true },
  { id: '42', name: 'Sacha', score: 25, isAI: true },
  { id: '43', name: 'Mila', score: 20, isAI: true },
  { id: '44', name: 'Théo', score: 15, isAI: true },
  { id: '45', name: 'Léna', score: 10, isAI: true },
  { id: '46', name: 'Clément', score: 8, isAI: true },
  { id: '47', name: 'Lisa', score: 6, isAI: true },
  { id: '48', name: 'Dylan', score: 4, isAI: true },
  { id: '49', name: 'Sarah', score: 2, isAI: true },
  { id: '50', name: 'Léo', score: 0, isAI: true }
];

export default function App() {
  const [view, setView] = useState('home');
  const [name, setName] = useState('');
  const [players, setPlayers] = useState(AI_PLAYERS);
  
  const [matchTime, setMatchTime] = useState(0);
  const [matchStatus, setMatchStatus] = useState('live');
  const [currentPlayer, setCurrentPlayer] = useState(null);
  
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [questionTimer, setQuestionTimer] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [myAnswer, setMyAnswer] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const [showEventPopup, setShowEventPopup] = useState(false);
  const [showNewQuestionAlert, setShowNewQuestionAlert] = useState(false);
  const [newPlayerAlert, setNewPlayerAlert] = useState(null);

  // Timer du match
  useEffect(() => {
    if (matchStatus === 'live') {
      const matchTimer = setInterval(() => {
        setMatchTime(prev => {
          if (prev >= 90) {
            setMatchStatus('finished');
            return 90;
          }
          return prev + 1;
        });
      }, 2000);
      return () => clearInterval(matchTimer);
    }
  }, [matchStatus]);

  // Timer de la question
  useEffect(() => {
    if (activeQuestion && questionTimer > 0) {
      const timer = setTimeout(() => {
        setQuestionTimer(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (activeQuestion && questionTimer === 0) {
      setTimeout(() => {
        setActiveQuestion(prev => ({...prev, status: 'closed'}));
      }, 1000);
    }
  }, [questionTimer, activeQuestion]);

  // Envoyer des questions aléatoirement
  useEffect(() => {
    if (matchStatus === 'live' && matchTime > 0 && !activeQuestion) {
      const chance = Math.random();
      
      if (chance < 0.1) {
        setTimeout(() => {
          pushNewQuestion();
        }, Math.random() * 3000);
      }
    }
  }, [matchTime, activeQuestion]);

  const pushNewQuestion = () => {
    const randomQuestion = QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)];
    const newQuestion = {
      ...randomQuestion,
      id: `${randomQuestion.id}_${Date.now()}`,
      pushedAt: matchTime,
      status: 'active'
    };
    
    setActiveQuestion(newQuestion);
    setQuestionTimer(newQuestion.timer);
    setMyAnswer(null);
    setShowNewQuestionAlert(true);
    setTimeout(() => setShowNewQuestionAlert(false), 3000);

    // Les joueurs IA répondent automatiquement
    setTimeout(() => {
      simulateAIAnswers(newQuestion);
    }, 2000);
  };

  // Simuler les réponses des IA
  const simulateAIAnswers = (question) => {
    const aiAnswers = players
      .filter(p => p.isAI)
      .map(player => {
        // 70% des IA répondent, 30% ne répondent pas
        if (Math.random() < 0.7) {
          return {
            id: `${player.id}_${Date.now()}`,
            playerId: player.id,
            playerName: player.name,
            questionId: question.id,
            answer: question.options[Math.floor(Math.random() * question.options.length)],
            timestamp: matchTime + Math.random() * 30 // Répondent dans les 30 premières secondes
          };
        }
        return null;
      })
      .filter(a => a !== null);

    setAnswers(prev => [...prev, ...aiAnswers]);
  };

  const triggerEvent = (answer) => {
    if (!activeQuestion || activeQuestion.status === 'validated') return;

    setActiveQuestion(prev => ({...prev, status: 'validated', correctAnswer: answer}));

    const winners = answers.filter(a => 
      a.questionId === activeQuestion.id && 
      a.answer === answer
    );

    winners.forEach(winner => {
      const responseTime = winner.timestamp - activeQuestion.pushedAt;
      const speedBonus = Math.max(0, Math.floor((30 - responseTime) * 5));
      const totalPoints = activeQuestion.points + speedBonus;

      setPlayers(prev => 
        prev.map(p => 
          p.id === winner.playerId 
            ? {...p, score: p.score + totalPoints}
            : p
        )
      );
    });

    setLastEvent({
      question: activeQuestion.question,
      answer: answer,
      winnersCount: winners.length,
      time: matchTime
    });
    setShowEventPopup(true);
    setTimeout(() => setShowEventPopup(false), 5000);

    setTimeout(() => {
      setActiveQuestion(null);
    }, 3000);
  };

  useEffect(() => {
    if (activeQuestion && activeQuestion.status === 'closed' && activeQuestion.status !== 'validated') {
      const delay = 2000 + Math.random() * 3000;
      const timer = setTimeout(() => {
        const randomAnswer = activeQuestion.options[Math.floor(Math.random() * activeQuestion.options.length)];
        triggerEvent(randomAnswer);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [activeQuestion?.status]);

  const handleJoinGame = () => {
    if (name.trim()) {
      const newPlayer = { 
        id: Date.now().toString(),
        name: name.trim(), 
        score: 0,
        isAI: false
      };
      setPlayers([...players, newPlayer]);
      setCurrentPlayer(newPlayer);
      
      // Afficher l'alerte sur l'écran TV
      setNewPlayerAlert(name.trim());
      setTimeout(() => setNewPlayerAlert(null), 5000);
      
      setView('game');
    }
  };

  const handleAnswer = (answer) => {
    if (!currentPlayer || !activeQuestion || myAnswer || activeQuestion.status !== 'active') return;

    const newAnswer = {
      id: Date.now().toString(),
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      questionId: activeQuestion.id,
      answer,
      timestamp: matchTime
    };

    setAnswers([...answers, newAnswer]);
    setMyAnswer(answer);
  };

  const appUrl = window.location.origin;

  // ========== ÉCRAN HOME ==========
  if (view === 'home') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '20px'
      }}>
        <div style={{ maxWidth: '800px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>🏆</div>
          <h1 style={{ 
            fontSize: '56px', 
            fontWeight: 'bold', 
            color: 'white', 
            marginBottom: '10px',
            textShadow: '0 2px 10px rgba(0,0,0,0.3)'
          }}>
            Quiz Buteur Live
          </h1>
          <p style={{ fontSize: '24px', color: 'rgba(255,255,255,0.9)', marginBottom: '60px' }}>
            Pronostics • Temps réel • Multijoueur
          </p>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: window.innerWidth > 600 ? '1fr 1fr' : '1fr',
            gap: '30px',
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            <button
              onClick={() => setView('mobile')}
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(10px)',
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: '24px',
                padding: '50px 30px',
                color: 'white',
                fontSize: '28px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
              }}
            >
              📱<br/>Jouer
            </button>
            
            <button
              onClick={() => setView('tv')}
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(10px)',
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: '24px',
                padding: '50px 30px',
                color: 'white',
                fontSize: '28px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.3s',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
              }}
            >
              📺<br/>Écran Bar
            </button>
          </div>
          
          <div style={{ 
            marginTop: '40px', 
            color: 'rgba(255,255,255,0.7)',
            fontSize: '16px'
          }}>
            🔴 Match en direct • {players.length} joueurs connectés
          </div>
        </div>
      </div>
    );
  }

  // ========== ÉCRAN MOBILE - CONNEXION ==========
  if (view === 'mobile') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <button
          onClick={() => setView('home')}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 24px',
            color: 'white',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '20px'
          }}
        >
          ← Retour
        </button>
        
        <div style={{
          maxWidth: '500px',
          margin: '40px auto',
          background: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(10px)',
          borderRadius: '32px',
          padding: '50px 30px',
          border: '1px solid rgba(255,255,255,0.3)',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '72px', marginBottom: '20px' }}>🎮</div>
          <h1 style={{ 
            fontSize: '42px', 
            fontWeight: 'bold', 
            color: 'white', 
            marginBottom: '10px' 
          }}>
            Quiz Buteur
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '18px', marginBottom: '30px' }}>
            ⚽ Match en cours : {matchTime}' • PSG vs Bayern
          </p>
          
          <input
            type="text"
            placeholder="Ton prénom..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoinGame()}
            style={{
              width: '100%',
              maxWidth: '300px',
              padding: '20px 24px',
              borderRadius: '16px',
              border: '2px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              fontSize: '20px',
              marginBottom: '30px',
              outline: 'none',
              fontWeight: '500'
            }}
          />
          
          <button
            onClick={handleJoinGame}
            disabled={!name.trim()}
            style={{
              background: name.trim() ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' : 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '16px',
              padding: '20px 50px',
              color: 'white',
              fontSize: '24px',
              fontWeight: 'bold',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              opacity: name.trim() ? 1 : 0.5,
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
            }}
          >
            Rejoindre 🚀
          </button>
        </div>
      </div>
    );
  }

  // ========== ÉCRAN DE JEU ==========
  if (view === 'game') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
        paddingBottom: '100px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        {showNewQuestionAlert && (
          <div style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            padding: '20px 40px',
            borderRadius: '16px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            zIndex: 1000,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '5px' }}>🔔</div>
            <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>
              Nouvelle question !
            </div>
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '15px 20px'
        }}>
          <div style={{ color: 'white' }}>
            <div style={{ fontSize: '18px', fontWeight: '600' }}>
              👤 {currentPlayer?.name}
            </div>
            <div style={{ fontSize: '14px', opacity: 0.8 }}>
              ⚽ {matchTime}' • PSG vs Bayern
            </div>
          </div>
          <div style={{ 
            color: '#fbbf24', 
            fontSize: '24px', 
            fontWeight: 'bold' 
          }}>
            {players.find(p => p.id === currentPlayer?.id)?.score || 0} pts
          </div>
        </div>

        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {activeQuestion ? (
            <div style={{
              background: activeQuestion.status === 'validated' 
                ? 'rgba(34, 197, 94, 0.2)' 
                : 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)',
              borderRadius: '24px',
              padding: '30px',
              marginBottom: '20px',
              border: `2px solid ${
                activeQuestion.status === 'validated' ? '#22c55e' : 'rgba(255,255,255,0.3)'
              }`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}>
              {activeQuestion.status === 'active' && (
                <div style={{
                  textAlign: 'center',
                  marginBottom: '20px'
                }}>
                  <div style={{
                    fontSize: '40px',
                    color: questionTimer <= 10 ? '#f87171' : 'white',
                    fontWeight: 'bold',
                    marginBottom: '10px'
                  }}>
                    {questionTimer}s
                  </div>
                  <div style={{
                    height: '6px',
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '10px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      background: questionTimer <= 10 ? '#f87171' : '#10b981',
                      width: `${(questionTimer / activeQuestion.timer) * 100}%`,
                      transition: 'width 1s linear',
                      borderRadius: '10px'
                    }} />
                  </div>
                </div>
              )}

              <h2 style={{
                color: 'white',
                fontSize: '26px',
                fontWeight: 'bold',
                textAlign: 'center',
                marginBottom: '25px',
                lineHeight: '1.4'
              }}>
                {activeQuestion.question}
              </h2>

              {activeQuestion.status === 'validated' ? (
                <div style={{
                  background: 'rgba(34, 197, 94, 0.3)',
                  borderRadius: '16px',
                  padding: '20px',
                  textAlign: 'center',
                  color: 'white'
                }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>✅</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>
                    Réponse : {activeQuestion.correctAnswer}
                  </div>
                  {myAnswer === activeQuestion.correctAnswer ? (
                    <div style={{ fontSize: '18px', color: '#22c55e' }}>
                      🎉 Tu as gagné des points !
                    </div>
                  ) : myAnswer ? (
                    <div style={{ fontSize: '18px', opacity: 0.8 }}>
                      ❌ Ta réponse : {myAnswer}
                    </div>
                  ) : (
                    <div style={{ fontSize: '16px', opacity: 0.7 }}>
                      Tu n'as pas répondu à temps
                    </div>
                  )}
                </div>
              ) : myAnswer ? (
                <div style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '16px',
                  padding: '20px',
                  textAlign: 'center',
                  color: 'white'
                }}>
                  <div style={{ fontSize: '20px', marginBottom: '10px' }}>
                    ✓ Réponse envoyée
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                    {myAnswer}
                  </div>
                  <div style={{ fontSize: '14px', opacity: 0.7, marginTop: '10px' }}>
                    ⏳ En attente du résultat...
                  </div>
                </div>
              ) : activeQuestion.status === 'closed' ? (
                <div style={{
                  background: 'rgba(148, 163, 184, 0.3)',
                  borderRadius: '16px',
                  padding: '20px',
                  textAlign: 'center',
                  color: 'white'
                }}>
                  <div style={{ fontSize: '20px', marginBottom: '5px' }}>⏱️ Temps écoulé</div>
                  <div style={{ fontSize: '14px', opacity: 0.7 }}>
                    En attente du résultat...
                  </div>
                </div>
              ) : (
                <div style={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {activeQuestion.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(option)}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderRadius: '16px',
                        padding: '18px',
                        color: 'white',
                        fontSize: '18px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              {activeQuestion.status === 'active' && !myAnswer && (
                <div style={{
                  textAlign: 'center',
                  marginTop: '20px',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '14px'
                }}>
                  💰 {activeQuestion.points} pts + bonus vitesse
                </div>
              )}
            </div>
          ) : (
            <div style={{
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '24px',
              padding: '50px 30px',
              textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>⏳</div>
              <h2 style={{ 
                color: 'white', 
                fontSize: '24px',
                marginBottom: '10px'
              }}>
                En attente...
              </h2>
              <p style={{ 
                color: 'rgba(255,255,255,0.7)', 
                fontSize: '16px',
                lineHeight: '1.6'
              }}>
                La prochaine question arrive bientôt !<br/>
                Reste connecté pendant le match 🔥
              </p>
            </div>
          )}
        </div>

        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          right: '20px',
          textAlign: 'center'
        }}>
          <button
            onClick={() => {
              setView('home');
              setCurrentPlayer(null);
            }}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '12px',
              padding: '15px 30px',
              color: 'white',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            🏠 Retour
          </button>
        </div>
      </div>
    );
  }

  // ========== ÉCRAN TV (SANS QUESTIONS) ==========
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      padding: '30px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Alerte nouveau joueur */}
      {newPlayerAlert && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          padding: '25px 50px',
          borderRadius: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          zIndex: 1000,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎉</div>
          <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>
            {newPlayerAlert} vient de rejoindre !
          </div>
        </div>
      )}

      {/* Popup événement */}
      {showEventPopup && lastEvent && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          padding: '25px 40px',
          borderRadius: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          zIndex: 1000,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎉</div>
          <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            {lastEvent.question}
          </div>
          <div style={{ color: 'white', fontSize: '18px', marginBottom: '5px' }}>
            Réponse : {lastEvent.answer}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '16px' }}>
            🏆 {lastEvent.winnersCount} joueur{lastEvent.winnersCount > 1 ? 's' : ''} ont gagné !
          </div>
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '15px',
        paddingBottom: '10px',
        borderBottom: '2px solid rgba(255,255,255,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '32px' }}>🏆</span>
          <h1 style={{ 
            color: 'white', 
            fontSize: '28px', 
            fontWeight: 'bold',
            margin: 0
          }}>
            QUIZ BUTEUR LIVE
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>
            ⚽ {matchTime}' • PSG vs Bayern
          </div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>
            {matchStatus === 'live' ? '🔴 EN DIRECT' : '⏸️ PAUSE'} • {players.length} joueurs
          </div>
        </div>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(10px)',
        borderRadius: '16px',
        padding: '15px 20px',
        border: '1px solid rgba(255,255,255,0.1)',
        height: 'calc(100vh - 180px)',
        overflowY: 'hidden'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '50px 1fr 100px',
          padding: '6px 15px',
          borderBottom: '2px solid rgba(255,255,255,0.2)',
          marginBottom: '8px'
        }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '600' }}>
            #
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '600' }}>
            JOUEUR
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '600', textAlign: 'right' }}>
            SCORE
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '2px'
        }}>
          {players.sort((a, b) => b.score - a.score).slice(0, 50).map((player, idx) => (
            <div
              key={player.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '50px 1fr 100px',
                alignItems: 'center',
                padding: '4px 15px',
                background: !player.isAI ? 'rgba(34, 197, 94, 0.3)' : idx < 3 ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.03)',
                borderLeft: !player.isAI ? '3px solid #22c55e' : idx < 3 ? '3px solid #fbbf24' : '3px solid transparent',
                borderRadius: '6px',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ 
                fontSize: idx < 3 ? '16px' : '14px',
                fontWeight: '600',
                color: !player.isAI ? '#22c55e' : idx < 3 ? '#fbbf24' : 'rgba(255,255,255,0.5)'
              }}>
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
              </div>

              <div style={{ 
                color: 'white', 
                fontSize: idx < 3 ? '15px' : '14px',
                fontWeight: !player.isAI ? '700' : idx < 3 ? '700' : '500'
              }}>
                {player.name} {!player.isAI && '👤'}
              </div>

              <div style={{ 
                color: !player.isAI ? '#22c55e' : idx < 3 ? '#fbbf24' : 'white',
                fontSize: idx < 3 ? '16px' : '15px',
                fontWeight: 'bold',
                textAlign: 'right'
              }}>
                {player.score}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: 'white',
        borderRadius: '16px',
        padding: '15px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        textAlign: 'center',
        border: '3px solid rgba(255,255,255,0.9)'
      }}>
        <img 
          src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(appUrl)}`}
          alt="QR Code"
          style={{
            width: '150px',
            height: '150px',
            marginBottom: '10px',
            borderRadius: '8px'
          }}
        />
        <div style={{ 
          color: '#1e3c72', 
          fontSize: '13px', 
          fontWeight: 'bold',
          marginBottom: '4px'
        }}>
          Scanne pour jouer
        </div>
        <div style={{ 
          color: '#667eea', 
          fontSize: '11px',
          fontWeight: '600'
        }}>
          Le Penalty - Paris 11e
        </div>
      </div>

      <button
        onClick={() => setView('home')}
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          borderRadius: '10px',
          padding: '10px 20px',
          color: 'white',
          fontSize: '14px',
          fontWeight: '600',
          cursor: 'pointer',
          opacity: 0.5
        }}
      >
        ← Menu
      </button>
    </div>
  );
}
