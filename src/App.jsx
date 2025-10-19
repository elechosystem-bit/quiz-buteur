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
            
            {/* 🎯 AFFICHAGE CONDITIONNEL AMÉLIORÉ */}
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
