const startMatch = async () => {
    if (!barId) return;
    try {
      // Nettoyer complètement l'ancien match et ses joueurs
      if (currentMatchId) {
        await remove(ref(db, `bars/${barId}/matches/${currentMatchId}`));
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
      
      // Attendre un peu pour être sûr que tout est nettoyé
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const now = Date.now();
      const matchId = `match_${now}`;
      
      // Créer le nouveau match avec toute la structure
      await set(ref(db, `bars/${barId}/matchState`), {
        active: true,
        startTime: now,
        nextQuestionTime: now + 60000,
        questionCount: 0,
        currentMatchId: matchId
      });
      
      // Créer la structure matches/[matchId] avec un placeholder pour players
      await set(ref(db, `bars/${barId}/matches/${matchId}`), {
        info: {
          startedAt: now,
          status: 'active'
        },
        players: {}
      });
      
      console.log('✅ Match démarré:', matchId);
      alert('✅ Match démarré ! Les joueurs peuvent maintenant rejoindre.');
    } catch (e) {
      console.error('Erreur:', e);
      alert('Erreur: ' + e.message);
    }
  };
