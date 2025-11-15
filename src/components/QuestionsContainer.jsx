import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import QuestionCard from './QuestionCard';
import './QuestionsContainer.css';

const QuestionsContainer = ({ matchId, userId }) => {
  const [questions, setQuestions] = useState([]);
  const [playerAnswers, setPlayerAnswers] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!matchId) return;

    const questionsRef = ref(db, `matches/${matchId}/questions`);
    const unsubscribe = onValue(questionsRef, (snapshot) => {
      const questionsData = snapshot.val() || {};
      const questionsList = Object.values(questionsData);

      questionsList.sort((a, b) => a.order - b.order);

      setQuestions(questionsList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [matchId]);

  useEffect(() => {
    if (!matchId || !userId) return;

    const answersRef = ref(db, `matches/${matchId}/players/${userId}/answers`);
    const unsubscribe = onValue(answersRef, (snapshot) => {
      const answersData = snapshot.val() || {};
      setPlayerAnswers(answersData);
    });

    return () => unsubscribe();
  }, [matchId, userId]);

  const getQuestionsByStatus = () => {
    const grouped = {
      active: [],
      answered: [],
      pending: []
    };

    questions.forEach(question => {
      const answer = playerAnswers[question.id];

      if (answer) {
        grouped.answered.push({ question, answer });
      } else if (question.status === 'active') {
        grouped.active.push({ question, answer: null });
      } else if (question.status === 'pending') {
        grouped.pending.push({ question, answer: null });
      }
    });

    return grouped;
  };

  if (loading) {
    return (
      <div className="questions-container">
        <div className="loading">
          <div className="spinner"></div>
          <p>Chargement des questions...</p>
        </div>
      </div>
    );
  }

  const groupedQuestions = getQuestionsByStatus();

  return (
    <div className="questions-container">
      {groupedQuestions.active.length > 0 && (
        <section className="questions-section active">
          <div className="section-header">
            <h2>
              <span className="icon">🔥</span>
              Questions en cours
            </h2>
            <span className="badge">{groupedQuestions.active.length}</span>
          </div>
          <div className="questions-list">
            {groupedQuestions.active.map(({ question, answer }) => (
              <QuestionCard
                key={question.id}
                question={question}
                matchId={matchId}
                userId={userId}
                existingAnswer={answer}
              />
            ))}
          </div>
        </section>
      )}

      {groupedQuestions.answered.length > 0 && (
        <section className="questions-section answered">
          <div className="section-header">
            <h2>
              <span className="icon">📝</span>
              Mes réponses
            </h2>
            <span className="badge">{groupedQuestions.answered.length}</span>
          </div>
          <div className="questions-list">
            {groupedQuestions.answered.map(({ question, answer }) => (
              <QuestionCard
                key={question.id}
                question={question}
                matchId={matchId}
                userId={userId}
                existingAnswer={answer}
              />
            ))}
          </div>
        </section>
      )}

      {groupedQuestions.pending.length > 0 && (
        <section className="questions-section pending">
          <div className="section-header">
            <h2>
              <span className="icon">⏰</span>
              À venir
            </h2>
            <span className="badge">{groupedQuestions.pending.length}</span>
          </div>
          <div className="pending-info">
            <p>
              {groupedQuestions.pending.length} question{groupedQuestions.pending.length > 1 ? 's' : ''} à venir pendant le match
            </p>
          </div>
        </section>
      )}

      {questions.length === 0 && (
        <div className="no-questions">
          <span className="icon">🤔</span>
          <h3>Aucune question pour le moment</h3>
          <p>Les questions apparaîtront au fur et à mesure du match</p>
        </div>
      )}
    </div>
  );
};

export default QuestionsContainer;

