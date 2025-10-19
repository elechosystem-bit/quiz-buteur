// 🎯 FONCTION COMPLÈTE À REMPLACER DANS AdminPanel.jsx

const handleStartMatch = async () => {
  if (!matchId) {
    alert('❌ Erreur : Pas de matchId');
    return;
  }

  try {
    const matchRef = ref(database, `matches/${matchId}`);
    
    console.log('🎮 === DÉMARRAGE DU MATCH ===');
    console.log('📌 Match sélectionné:', selectedMatch);
    
    // ========================================
    // 1️⃣ CONSTRUCTION DES INFOS DU MATCH
    // ========================================
    
    let matchInfo = null;
    let matchClock = null;
    let realPlayers = [];
    
    if (selectedMatch) {
      // ✅ MATCH RÉEL DEPUIS API
      console.log('✅ Match réel détecté');
      
      // Infos de base
      matchInfo = {
        matchName: `${selectedMatch.teams.home.name} vs ${selectedMatch.teams.away.name}`,
        homeTeam: selectedMatch.teams.home.name,
        awayTeam: selectedMatch.teams.away.name,
        homeLogo: selectedMatch.teams.home.logo,
        awayLogo: selectedMatch.teams.away.logo,
        score: `${selectedMatch.goals.home ?? 0}-${selectedMatch.goals.away ?? 0}`,
        league: selectedMatch.league.name,
        leagueLogo: selectedMatch.league.logo,
        apiFixtureId: selectedMatch.fixture.id,
        status: selectedMatch.fixture.status.short
      };
      
      console.log('📝 matchInfo créé:', matchInfo);
      
      // ========================================
      // 2️⃣ HORLOGE DU MATCH
      // ========================================
      
      const elapsed = selectedMatch.fixture.status.elapsed || 0;
      const status = selectedMatch.fixture.status.short;
      
      let half = 1;
      if (status === 'HT') half = 'HT';
      else if (status === '2H' || elapsed > 45) half = 2;
      else if (status === 'FT') half = 'FT';
      
      matchClock = {
        startTime: Date.now(), // Timestamp de démarrage
        elapsed: elapsed,      // Minutes écoulées
        half: half,            // Période du match
        status: status
      };
      
      console.log('⏱️ matchClock créé:', matchClock);
      
      // ========================================
      // 3️⃣ RÉCUPÉRATION DES COMPOSITIONS (JOUEURS RÉELS)
      // ========================================
      
      try {
        console.log('🔄 Récupération des compositions...');
        
        const lineupResponse = await fetch(
          `https://v3.football.api-sports.io/fixtures/lineups?fixture=${selectedMatch.fixture.id}`,
          {
            method: 'GET',
            headers: {
              'x-rapidapi-host': 'v3.football.api-sports.io',
              'x-rapidapi-key': import.meta.env.VITE_API_FOOTBALL_KEY
            }
          }
        );
        
        const lineupData = await lineupResponse.json();
        console.log('📥 Réponse API lineups:', lineupData);
        
        if (lineupData.response && lineupData.response.length >= 2) {
          const homeLineup = lineupData.response[0];
          const awayLineup = lineupData.response[1];
          
          // Extraire tous les joueurs titulaires
          const homePlayers = homeLineup.startXI.map(p => p.player.name);
          const awayPlayers = awayLineup.startXI.map(p => p.player.name);
          
          realPlayers = [...homePlayers, ...awayPlayers];
          console.log(`✅ ${realPlayers.length} joueurs récupérés:`, realPlayers);
        } else {
          console.warn('⚠️ Compositions non disponibles, fallback sur joueurs par défaut');
        }
      } catch (error) {
        console.error('❌ Erreur récupération compositions:', error);
      }
      
    } else {
      // ⚙️ MATCH TEST PAR DÉFAUT
      console.log('⚙️ Match test (pas de match sélectionné)');
      
      matchInfo = {
        matchName: "Match Test",
        homeTeam: "Équipe Domicile",
        awayTeam: "Équipe Extérieur",
        score: "0-0",
        league: "Test League",
        status: "1H"
      };
      
      matchClock = {
        startTime: Date.now(),
        elapsed: 0,
        half: 1,
        status: "1H"
      };
      
      console.log('📝 Match test créé');
    }
    
    // ========================================
    // 4️⃣ ÉCRITURE DANS FIREBASE
    // ========================================
    
    console.log('💾 Écriture dans Firebase...');
    
    const updateData = {
      state: 'active',
      matchInfo: matchInfo,
      matchClock: matchClock,
      startedAt: Date.now(),
      lastUpdated: Date.now()
    };
    
    // Si on a des joueurs réels, les ajouter
    if (realPlayers.length > 0) {
      updateData.realPlayers = realPlayers;
    }
    
    console.log('📤 Données à écrire:', updateData);
    
    await update(matchRef, updateData);
    
    console.log('✅ Match démarré avec succès !');
    console.log('📊 Vérifiez Firebase Console:', `matches/${matchId}`);
    
    alert('✅ Match démarré !');
    
  } catch (error) {
    console.error('❌ ERREUR CRITIQUE:', error);
    alert(`❌ Erreur : ${error.message}`);
  }
};
