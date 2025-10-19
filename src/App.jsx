if (screen === 'tv') {
    const qrUrl = `${window.location.origin}/play`;
    
    // 🔍 DEBUG COMPLET
    console.log('📺 === ÉCRAN TV - DEBUG COMPLET ===');
    console.log('📺 matchState:', matchState);
    console.log('📺 matchState?.matchInfo:', matchState?.matchInfo);
    console.log('📺 matchState?.active:', matchState?.active);
    
    // Infos du match depuis matchState
    const matchInfo = matchState?.matchInfo;
    const hasMatchInfo = matchInfo && matchInfo.homeTeam && matchInfo.awayTeam;
    
    console.log('📺 matchInfo final:', matchInfo);
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
          <div>
            <h1 className="text-5xl font-black text-white mb-2">🏆 CLASSEMENT LIVE</h1>
            
            {hasMatchInfo ? (
              <div className="mb-3 bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-4 rounded-xl border-2 border-blue-500">
                <p className="text-4xl font-bold text-yellow-400">
                  {matchInfo.homeTeam} 
                  <span className="text-white mx-3">{matchInfo.score}</span> 
                  {matchInfo.awayTeam}
                </p>
                <p className="text-xl text-green-300 mt-1">{matchInfo.league}</p>
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
              <p className="text-xl text-yellow-400 mt-2">⏱️ Prochaine question: {countdown}</p>
            )}
            {(!matchState || !matchState.active) && (
              <p className="text-gray-300 mt-2">Le match n'est pas démarré</p>
            )}
          </div>
          <div className="flex gap-6">
            <MatchClock />
            <div className="bg-white p-6 rounded-2xl">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} 
                alt="QR Code" 
                className="w-48 h-48" 
              />
              <p className="text-center mt-3 font-bold text-green-900">Scanne pour jouer !</p>
            </div>
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
