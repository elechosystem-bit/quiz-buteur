import React, { useState, useEffect } from 'react';

// Banque de questions possibles
const QUESTION_BANK = [
  {
    id: 'goal_1',
    type: 'next_goal',
    question: '⚽ Qui va marquer le prochain but ?',
    options: ['Mbappé', 'Haaland', 'Lewandowski', 'Autre joueur'],
    points: 200,
    timer: 60
  },
  {
    id: 'corner_1',
    type: 'next_corner',
    question: '⛳ Quelle équipe aura le prochain corner ?',
    options: ['Équipe A', 'Équipe B'],
    points: 100,
    timer: 45
  },
  {
    id: 'card_1',
    type: 'next_card',
    question: '🟨 Quelle équipe recevra le prochain carton ?',
    options: ['Équipe A', 'Équipe B', 'Aucun carton'],
    points: 150,
    timer: 60
  },
  {
    id: 'sub_1',
    type: 'next_sub',
    question: '🔄 Quelle équipe fera le prochain changement ?',
    options: ['Équipe A', 'Équipe B'],
    points: 120,
    timer: 45
  }
];

export default function App() {
  const [view, setView] = useState('home');
  const [name, setName] = useState('');
  const [players, setPlayers] = useState([
    { id: '1', name: 'Thomas', score: 450 },
    { id: '2', name: 'Marie', score: 380 },
    { id: '3', name: 'Alex', score: 320 },
    { id: '4', name: 'Lucas', score: 310 },
    { id: '5', name: 'Sophie', score: 290 },
    { id: '6', name: 'Hugo', score: 275 },
    { id: '7', name: 'Emma', score: 260 },
    { id: '8', name: 'Nathan', score: 245 },
    { id: '9', name: 'Léa', score: 230 },
    { id: '10', name: 'Louis', score: 215 },
    { id: '11', name: 'Chloé', score: 200 },
    { id: '12', name: 'Arthur', score: 190 },
    { id: '13', name: 'Camille', score: 180 },
    { id: '14', name: 'Tom', score: 170 },
    { id: '15', name: 'Julie', score: 160 },
    { id: '16', name: 'Gabriel', score: 155 },
    { id: '17', name: 'Zoé', score: 150 },
    { id: '18', name: 'Raphaël', score: 145 },
    { id: '19', name: 'Laura', score: 140 },
    { id: '20', name: 'Adam', score: 135 },
    { id: '21', name: 'Manon', score: 130 },
    { id: '22', name: 'Enzo', score: 125 },
    { id: '23', name: 'Alice', score: 120 },
    { id: '24', name: 'Victor', score: 115 },
    { id: '25', name: 'Inès', score: 110 },
    { id: '26', name: 'Paul', score: 105 },
    { id: '27', name: 'Charlotte', score: 100 },
    { id: '28', name: 'Jules', score: 95 },
    { id: '29', name: 'Lola', score: 90 },
    { id: '30', name: 'Mathis', score: 85 },
    { id: '31', name: 'Jade', score: 80 },
    { id: '32', name: 'Timéo', score: 75 },
    { id: '33', name: 'Lily', score: 70 },
    { id: '34', name: 'Maxime', score: 65 },
    { id: '35', name: 'Nina', score: 60 },
    { id: '36', name: 'Ethan', score: 55 },
    { id: '37', name: 'Rose', score: 50 },
    { id: '38', name: 'Nolan', score: 45 },
    { id: '39', name: 'Anna', score: 40 },
    { id: '40', name: 'Antoine', score: 35 },
    { id: '41', name: 'Eva', score: 30 },
    { id: '42', name: 'Sacha', score: 25 },
    { id: '43', name: 'Mila', score: 20 },
    { id: '44', name: 'Théo', score: 15 },
    { id: '45', name: 'Léna', score: 10 },
    { id: '46', name: 'Clément', score: 8 },
    { id: '47', name: 'Lisa', score: 6 },
    { id: '48', name: 'Dylan', score: 4 },
    { id: '49', name: 'Sarah', score: 2 },
    { id: '50', name: 'Léo', score: 0 }
  ]);
  
  // État du match
  const [matchTime, setMatchTime] = useState(0);
  const [matchStatus, setMatchStatus] = useState('live');
  const [currentPlayer, setCurrentPlayer] = useState(null);
  
  // État des questions PUSH
  const [activeQuestion, setActiveQuestion] = useState(null); // UNE SEULE question active
  const [questionTimer, setQuestionTimer] = useState(0);
  const [answers, setAnswers] = useState([]); // Toutes les réponses de tous les joueurs
  const [myAnswer, setMyAnswer] = useState(null); // Ma réponse à la question active
  const [lastEvent, setLastEvent] = useState(null);
  const [showEventPopup, setShowEventPopup] = useState(false);
  const [showNewQuestionAlert, setShowNewQuestionAlert] = useState(false);

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

  // Timer de la question active
  useEffect(() => {
    if (activeQuestion && questionTimer > 0) {
      const timer = setTimeout(() => {
        setQuestionTimer(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (activeQuestion && questionTimer === 0) {
      // Temps écoulé, fermer la question
      setTimeout(() => {
        setActiveQuestion(prev => ({...prev, status: 'closed'}));
      }, 1000);
    }
  }, [questionTimer, activeQuestion]);

  // Simulateur: Envoyer une nouvelle question aléatoirement
  useEffect(() => {
    if (matchStatus === 'live' && matchTime > 0 && !activeQuestion) {
      const chance = Math.random();
      
      // 8% de chance d'envoyer une question à chaque minute
      if (chance < 0.08) {
        setTimeout(() => {
          pushNewQuestion();
        }, Math.random() * 3000);
      }
    }
  }, [matchTime, activeQuestion]);

  // Fonction pour PUSH une nouvelle question
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
  };

  // Fonction pour déclencher un événement (simulé)
  const triggerEvent = (answer) => {
    if (!activeQuestion || activeQuestion.status === 'validated') return;

    // Marquer la question comme validée
    setActiveQuestion(prev => ({...prev, status: 'validated', correctAnswer: answer}));

    // Calculer les gagnants
    const winners = answers.filter(a => 
      a.questionId === activeQuestion.id && 
      a.answer === answer
    );

    // Attribuer les points
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

    // Afficher l'événement
    setLastEvent({
      question: activeQuestion.question,
      answer: answer,
      winnersCount: winners.length,
      time: matchTime
    });
    setShowEventPopup(true);
    setTimeout(() => setShowEventPopup(false), 5000);

    // Fermer la question après 3 secondes
    setTimeout(() => {
      setActiveQuestion(null);
    }, 3000);
  };

  // Simuler des événements aléatoires après fermeture de question
  useEffect(() => {
    if (activeQuestion && activeQuestion.status === 'closed' && activeQuestion.status !== 'validated') {
      // Après 2-5 secondes, déclencher un événement
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
        score: 0
      };
      setPlayers([...players, newPlayer]);
      setCurrentPlayer(newPlayer);
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

  // URL de l'app pour le QR code
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
            ⚽ Match en cours : {matchTime}'
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
        {/* Alert nouvelle question */}
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
            animation: 'slideDown 0.5s ease-out',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '5px' }}>🔔</div>
            <div style={{ color: 'white', fontSize: '20px', fontWeight: 'bold' }}>
              Nouvelle question !
            </div>
          </div>
        )}

        {/* Header */}
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
              ⚽ {matchTime}' • {matchStatus === 'live' ? '🔴 EN DIRECT' : '⏸️ PAUSE'}
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
          {/* Question active */}
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
              {/* Timer */}
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

              {/* Question */}
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

              {/* Options ou statut */}
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

              {/* Info points */}
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
            // Attente de la prochaine question
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

        {/* Bouton retour */}
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

  // ========== ÉCRAN TV ==========
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      padding: '30px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative',
      overflow: 'hidden'
    }}>
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

      {/* Header */}
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
            ⚽ {matchTime}'
          </div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>
            {matchStatus === 'live' ? '🔴 EN DIRECT' : '⏸️ PAUSE'} • {players.length} joueurs
          </div>
        </div>
      </div>

      {/* Classement compact */}
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
                background: idx < 3 ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255,255,255,0.03)',
                borderLeft: idx < 3 ? '3px solid #fbbf24' : '3px solid transparent',
                borderRadius: '6px',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ 
                fontSize: idx < 3 ? '16px' : '14px',
                fontWeight: '600',
                color: idx < 3 ? '#fbbf24' : 'rgba(255,255,255,0.5)'
              }}>
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
              </div>

              <div style={{ 
                color: 'white', 
                fontSize: idx < 3 ? '15px' : '14px',
                fontWeight: idx < 3 ? '700' : '500'
              }}>
                {player.name}
              </div>

              <div style={{ 
                color: idx < 3 ? '#fbbf24' : 'white',
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

      {/* QR Code REEL avec API */}
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
