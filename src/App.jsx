import React, { useState } from 'react';

export default function App() {
  const [view, setView] = useState('home');
  const [name, setName] = useState('');
  const [players, setPlayers] = useState([
    { name: 'Thomas', score: 450 },
    { name: 'Marie', score: 380 },
    { name: 'Alex', score: 320 }
  ]);

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
            Multijoueur • Temps réel
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
            {players.length} joueurs connectés
          </div>
        </div>
      </div>
    );
  }

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
            marginBottom: '30px' 
          }}>
            Quiz Buteur
          </h1>
          
          <input
            type="text"
            placeholder="Ton prénom..."
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            onClick={() => {
              if (name.trim()) {
                setPlayers([...players, { name: name.trim(), score: 0 }]);
                alert(`Bienvenue ${name} ! 🎉`);
              }
            }}
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

  if (view === 'tv') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        padding: '40px',
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
            marginBottom: '30px'
          }}
        >
          ← Menu
        </button>
        
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '24px',
          padding: '40px',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '15px',
            marginBottom: '30px',
            paddingBottom: '20px',
            borderBottom: '2px solid rgba(255,255,255,0.2)'
          }}>
            <span style={{ fontSize: '32px' }}>🏆</span>
            <h2 style={{ 
              color: 'white', 
              fontSize: '32px', 
              fontWeight: 'bold',
              margin: 0
            }}>
              CLASSEMENT EN DIRECT
            </h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {players.sort((a, b) => b.score - a.score).map((player, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '20px 30px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid rgba(255,255,255,0.15)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ 
                    color: 'rgba(255,255,255,0.5)', 
                    fontSize: '24px',
                    fontWeight: 'bold',
                    minWidth: '40px',
                    textAlign: 'center'
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ 
                    color: 'white', 
                    fontSize: '28px',
                    fontWeight: '600'
                  }}>
                    {player.name}
                  </div>
                </div>
                <div style={{ 
                  color: '#fbbf24', 
                  fontSize: '32px',
                  fontWeight: 'bold'
                }}>
                  {player.score}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div style={{
          position: 'fixed',
          bottom: '40px',
          right: '40px',
          background: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '20px',
          border: '1px solid rgba(255,255,255,0.2)',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '15px',
            marginBottom: '10px'
          }}>
            <div style={{ fontSize: '80px' }}>📲</div>
          </div>
          <div style={{ color: 'white', fontSize: '14px', fontWeight: '600' }}>
            Scanne pour jouer
          </div>
        </div>
      </div>
    );
  }
}
