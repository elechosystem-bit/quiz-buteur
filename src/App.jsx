import React, { useState, useEffect } from 'react';

// Types de pronostics disponibles
const PREDICTION_TYPES = [
  {
    id: 'next_goal',
    title: '⚽ Prochain buteur',
    options: ['Mbappé', 'Haaland', 'Lewandowski', 'Autre joueur'],
    points: 200,
    status: 'open'
  },
  {
    id: 'next_card',
    title: '🟨 Prochain carton',
    options: ['Équipe A', 'Équipe B', 'Aucun carton'],
    points: 150,
    status: 'open'
  },
  {
    id: 'corners_count',
    title: '⛳ Nombre de corners (Mi-temps)',
    options: ['0-2', '3-5', '6-8', '9+'],
    points: 120,
    status: 'open'
  },
  {
    id: 'final_score',
    title: '🏆 Score final',
    options: ['1-0', '2-1', '2-2', '3-1', '0-0'],
    points: 300,
    status: 'open'
  }
];

export default function App() {
  const [view, setView] = useState('home');
  const [name, setName] = useState('');
  const [players, setPlayers] = useState([
    { id: '1', name: 'Thomas', score: 450, avatar: '👨' },
    { id: '2', name: 'Marie', score: 380, avatar: '👩' },
    { id: '3', name: 'Alex', score: 320, avatar: '🧑' },
    { id: '4', name: 'Lucas', score: 310, avatar: '👨' },
    { id: '5', name: 'Sophie', score: 290, avatar: '👩' },
    { id: '6', name: 'Hugo', score: 275, avatar: '👨' },
    { id: '7', name: 'Emma', score: 260, avatar: '👩' },
    { id: '8', name: 'Nathan', score: 245, avatar: '👨' },
    { id: '9', name: 'Léa', score: 230, avatar: '👩' },
    { id: '10', name: 'Louis', score: 215, avatar: '👨' },
    { id: '11', name: 'Chloé', score: 200, avatar: '👩' },
    { id: '12', name: 'Arthur', score: 190, avatar: '👨' },
    { id: '13', name: 'Camille', score: 180, avatar: '👩' },
    { id: '14', name: 'Tom', score: 170, avatar: '👨' },
    { id: '15', name: 'Julie', score: 160, avatar: '👩' },
    { id: '16', name: 'Gabriel', score: 155, avatar: '👨' },
    { id: '17', name: 'Zoé', score: 150, avatar: '👩' },
    { id: '18', name: 'Raphaël', score: 145, avatar: '👨' },
    { id: '19', name: 'Laura', score: 140, avatar: '👩' },
    { id: '20', name: 'Adam', score: 135, avatar: '👨' },
    { id: '21', name: 'Manon', score: 130, avatar: '👩' },
    { id: '22', name: 'Enzo', score: 125, avatar: '👨' },
    { id: '23', name: 'Alice', score: 120, avatar: '👩' },
    { id: '24', name: 'Victor', score: 115, avatar: '👨' },
    { id: '25', name: 'Inès', score: 110, avatar: '👩' },
    { id: '26', name: 'Paul', score: 105, avatar: '👨' },
    { id: '27', name: 'Charlotte', score: 100, avatar: '👩' },
    { id: '28', name: 'Jules', score: 95, avatar: '👨' },
    { id: '29', name: 'Lola', score: 90, avatar: '👩' },
    { id: '30', name: 'Mathis', score: 85, avatar: '👨' },
    { id: '31', name: 'Jade', score: 80, avatar: '👩' },
    { id: '32', name: 'Timéo', score: 75, avatar: '👨' },
    { id: '33', name: 'Lily', score: 70, avatar: '👩' },
    { id: '34', name: 'Maxime', score: 65, avatar: '👨' },
    { id: '35', name: 'Nina', score: 60, avatar: '👩' },
    { id: '36', name: 'Ethan', score: 55, avatar: '👨' },
    { id: '37', name: 'Rose', score: 50, avatar: '👩' },
    { id: '38', name: 'Nolan', score: 45, avatar: '👨' },
    { id: '39', name: 'Anna', score: 40, avatar: '👩' },
    { id: '40', name: 'Antoine', score: 35, avatar: '👨' },
    { id: '41', name: 'Eva', score: 30, avatar: '👩' },
    { id: '42', name: 'Sacha', score: 25, avatar: '👨' },
    { id: '43', name: 'Mila', score: 20, avatar: '👩' },
    { id: '44', name: 'Théo', score: 15, avatar: '👨' },
    { id: '45', name: 'Léna', score: 10, avatar: '👩' },
    { id: '46', name: 'Clément', score: 8, avatar: '👨' },
    { id: '47', name: 'Lisa', score: 6, avatar: '👩' },
    { id: '48', name: 'Dylan', score: 4, avatar: '👨' },
    { id: '49', name: 'Sarah', score: 2, avatar: '👩' },
    { id: '50', name: 'Léo', score: 0, avatar: '👨' }
  ]);
  
  // État du match
  const [matchTime, setMatchTime] = useState(0);
  const [matchStatus, setMatchStatus] = useState('live');
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [predictionTypes, setPredictionTypes] = useState(PREDICTION_TYPES);
  const [lastEvent, setLastEvent] = useState(null);
  const [showEventPopup, setShowEventPopup] = useState(false);

  // Simulateur d'événements match
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

  // Simulateur d'événements aléatoires
  useEffect(() => {
    if (matchStatus === 'live' && matchTime > 0) {
      const eventChance = Math.random();
      
      if (eventChance < 0.05) {
        const eventTypes = ['next_goal', 'next_card'];
        const randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        
        setTimeout(() => {
          triggerEvent(randomEvent);
        }, Math.random() * 2000);
      }
    }
  }, [matchTime]);

  const triggerEvent = (eventType) => {
    const predType = predictionTypes.find(p => p.id === eventType);
    if (!predType || predType.status === 'closed') return;

    const winningAnswer = predType.options[Math.floor(Math.random() * predType.options.length)];
    
    setPredictionTypes(prev => 
      prev.map(p => p.id === eventType ? {...p, status: 'closed', winningAnswer} : p)
    );

    const winners = predictions.filter(pred => 
      pred.type === eventType && 
      pred.answer === winningAnswer &&
      pred.status === 'pending'
    );

    winners.forEach(winner => {
      const timeDiff = matchTime - winner.matchTime;
      const anticipationBonus = Math.max(0, Math.floor((10 - timeDiff) * 10));
      const totalPoints = predType.points + anticipationBonus;

      setPlayers(prev => 
        prev.map(p => 
          p.id === winner.playerId 
            ? {...p, score: p.score + totalPoints}
            : p
        )
      );

      setPredictions(prev =>
        prev.map(p => 
          p.id === winner.id 
            ? {...p, status: 'won', pointsWon: totalPoints}
            : p
        )
      );
    });

    setPredictions(prev =>
      prev.map(p => 
        p.type === eventType && p.answer !== winningAnswer && p.status === 'pending'
          ? {...p, status: 'lost'}
          : p
      )
    );

    setLastEvent({
      type: eventType,
      title: predType.title,
      answer: winningAnswer,
      winnersCount: winners.length,
      time: matchTime
    });
    setShowEventPopup(true);
    setTimeout(() => setShowEventPopup(false), 5000);
  };

  const handleJoinGame = () => {
    if (name.trim()) {
      const newPlayer = { 
        id: Date.now().toString(),
        name: name.trim(), 
        score: 0,
        avatar: ['👨', '👩', '🧑', '👤'][Math.floor(Math.random() * 4)]
      };
      setPlayers([...players, newPlayer]);
      setCurrentPlayer(newPlayer);
      setView('game');
    }
  };

  const handleMakePrediction = (predictionType, answer) => {
    if (!currentPlayer) return;

    const newPrediction = {
      id: Date.now().toString(),
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      type: predictionType.id,
      answer,
      matchTime,
      timestamp: new Date().toISOString(),
      status: 'pending',
      points: predictionType.points
    };

    setPredictions([...predictions, newPrediction]);
  };

  const getPlayerPredictions = () => {
    if (!currentPlayer) return [];
    return predictions.filter(p => p.playerId === currentPlayer.id);
  };

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
    const playerPredictions = getPlayerPredictions();

    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
        paddingBottom: '100px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
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
              {currentPlayer?.avatar} {currentPlayer?.name}
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
          <h2 style={{ 
            color: 'white', 
            fontSize: '24px', 
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            📊 Pronostics disponibles
          </h2>

          {predictionTypes.map(predType => {
            const myPrediction = playerPredictions.find(p => p.type === predType.id);
            const isLocked = predType.status === 'closed';

            return (
              <div
                key={predType.id}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(10px)',
                  borderRadius: '20px',
                  padding: '20px',
                  marginBottom: '20px',
                  border: `2px solid ${
                    myPrediction?.status === 'won' ? '#22c55e' :
                    myPrediction?.status === 'lost' ? '#ef4444' :
                    isLocked ? '#94a3b8' :
                    'rgba(255,255,255,0.2)'
                  }`
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '15px'
                }}>
                  <h3 style={{ 
                    color: 'white', 
                    fontSize: '20px',
                    margin: 0,
                    opacity: isLocked ? 0.6 : 1
                  }}>
                    {predType.title}
                  </h3>
                  <span style={{
                    background: isLocked ? '#94a3b8' : '#fbbf24',
                    color: 'white',
                    padding: '5px 12px',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}>
                    {isLocked ? '🔒 Fermé' : `${predType.points} pts`}
                  </span>
                </div>

                {myPrediction ? (
                  <div style={{
                    background: myPrediction.status === 'won' ? 'rgba(34, 197, 94, 0.2)' :
                               myPrediction.status === 'lost' ? 'rgba(239, 68, 68, 0.2)' :
                               'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '15px',
                    color: 'white'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '5px' }}>
                      Ton pronostic : {myPrediction.answer}
                    </div>
                    <div style={{ fontSize: '14px', opacity: 0.8 }}>
                      {myPrediction.status === 'pending' && `⏳ En attente (parié à ${myPrediction.matchTime}')`}
                      {myPrediction.status === 'won' && `✅ Gagné ! +${myPrediction.pointsWon} pts`}
                      {myPrediction.status === 'lost' && `❌ Perdu (réponse: ${predType.winningAnswer})`}
                    </div>
                  </div>
                ) : isLocked ? (
                  <div style={{
                    color: 'rgba(255,255,255,0.6)',
                    textAlign: 'center',
                    padding: '10px',
                    fontSize: '14px'
                  }}>
                    🔒 Trop tard ! Résultat : {predType.winningAnswer}
                  </div>
                ) : (
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: predType.options.length > 3 ? '1fr 1fr' : '1fr',
                    gap: '10px' 
                  }}>
                    {predType.options.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleMakePrediction(predType, option)}
                        style={{
                          background: 'rgba(255,255,255,0.2)',
                          border: '1px solid rgba(255,255,255,0.3)',
                          borderRadius: '12px',
                          padding: '12px',
                          color: 'white',
                          fontSize: '16px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
            {lastEvent.title}
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
            ⚽ {matchTime}'
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
        <div style={{
          fontSize: '70px',
          marginBottom: '8px'
        }}>
          📲
        </div>
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
