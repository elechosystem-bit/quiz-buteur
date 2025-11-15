import React, { useState, useEffect } from 'react';
import { submitAnswer } from '../answerValidator';
import './QuestionCard.css';

const QuestionCard = ({ question, matchId, userId, existingAnswer }) => {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);

  useEffect(() => {
    if (question.type === 'prediction' && question.deadline && !existingAnswer) {
      const interval = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, question.deadline - now);

        if (remaining === 0) {
          clearInterval(interval);
          setTimeRemaining('Expiré');
        } else {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [question, existingAnswer]);

  useEffect(() => {
    if (existingAnswer) {
      setSelectedAnswer(existingAnswer.answer);

      if (existingAnswer.validated) {
        setValidationResult({
          isCorrect: existingAnswer.isCorrect,
          points: existingAnswer.points,
          validated: true
        });
      }
    }
  }, [existingAnswer]);

  const handleSubmit = async () => {
    if (!selectedAnswer || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const result = await submitAnswer(userId, matchId, question.id, selectedAnswer, question);

      if (result.validated) {
        setValidationResult(result);
      } else {
        setValidationResult({
          validated: false,
          waitingForEvent: result.waitingForEvent
        });
      }
    } catch (error) {
      console.error('Erreur lors de la soumission:', error);
      alert('Erreur lors de la soumission de la réponse');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestionType = () => {
    if (question.type === 'culture') {
      return (
        <div className="question-type culture">
          <span className="icon">📚</span>
          <span className="label">Culture Générale</span>
        </div>
      );
    } else {
      return (
        <div className="question-type prediction">
          <span className="icon">🔮</span>
          <span className="label">Prédiction</span>
          {timeRemaining && (
            <span className="timer">{timeRemaining}</span>
          )}
        </div>
      );
    }
  };

  const renderAnswerOptions = () => {
    if (question.type === 'culture') {
      return (
        <div className="answer-options multiple">
          {question.options.map((option, index) => (
            <button
              key={index}
              className={`answer-option ${selectedAnswer === option ? 'selected' : ''} ${
                validationResult?.validated && option === question.correctAnswer ? 'correct' : ''
              } ${
                validationResult?.validated && selectedAnswer === option && !validationResult.isCorrect ? 'incorrect' : ''
              }`}
              onClick={() => !validationResult && setSelectedAnswer(option)}
              disabled={!!validationResult || isSubmitting}
            >
              {option}
            </button>
          ))}
        </div>
      );
    } else {
      return (
        <div className="answer-options binary">
          <button
            className={`answer-option ${selectedAnswer === 'Oui' ? 'selected' : ''}`}
            onClick={() => !validationResult && setSelectedAnswer('Oui')}
            disabled={!!existingAnswer || isSubmitting}
          >
            👍 Oui
          </button>
          <button
            className={`answer-option ${selectedAnswer === 'Non' ? 'selected' : ''}`}
            onClick={() => !validationResult && setSelectedAnswer('Non')}
            disabled={!!existingAnswer || isSubmitting}
          >
            👎 Non
          </button>
        </div>
      );
    }
  };

  const renderValidationStatus = () => {
    if (!validationResult && !existingAnswer) return null;

    const result = validationResult || existingAnswer;

    if (result.validated) {
      return (
        <div className={`validation-status ${result.isCorrect ? 'correct' : 'incorrect'}`}>
          <div className="icon">
            {result.isCorrect ? '✅' : '❌'}
          </div>
          <div className="message">
            {result.isCorrect ? (
              <>
                <strong>Bravo !</strong>
                <span>+{result.points} point{result.points > 1 ? 's' : ''}</span>
              </>
            ) : (
              <>
                <strong>Dommage !</strong>
                <span>0 point</span>
              </>
            )}
          </div>
          {question.type === 'culture' && question.explanation && (
            <div className="explanation">
              {question.explanation}
            </div>
          )}
        </div>
      );
    } else if (result.waitingForValidation) {
      return (
        <div className="validation-status waiting">
          <div className="icon">⏳</div>
          <div className="message">
            {result.waitingForEvent ? (
              <>
                <strong>En attente...</strong>
                <span>Validation dès que l'événement arrive</span>
              </>
            ) : (
              <>
                <strong>En attente...</strong>
                <span>Validation dans {question.timeWindow} minutes</span>
              </>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="question-card">
      {renderQuestionType()}

      <div className="question-content">
        <h3 className="question-text">{question.question}</h3>

        <div className="question-points">
          {question.points} point{question.points > 1 ? 's' : ''}
        </div>
      </div>

      {renderAnswerOptions()}

      {!existingAnswer && !validationResult && (
        <button
          className="submit-button"
          onClick={handleSubmit}
          disabled={!selectedAnswer || isSubmitting}
        >
          {isSubmitting ? 'Envoi...' : 'Valider ma réponse'}
        </button>
      )}

      {renderValidationStatus()}
    </div>
  );
};

export default QuestionCard;

