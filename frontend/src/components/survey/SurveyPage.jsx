import { useState, useEffect, useRef } from 'react';
import SurveyPlayer from './SurveyPlayer';
import { fetchSurvey, fetchVisibleQuestions } from '../../services/surveyApi';

const SURVEY_ID = 'bilkent_feedback';

// ─── SurveyPage ───────────────────────────────────────────
// Smart container responsible for:
//   - loading the survey definition on mount
//   - holding the answers state
//   - re-computing visible questions after every answer change
//   - detecting survey version changes (groundwork for conflict handling)
//   - delegating all rendering to SurveyPlayer

const SurveyPage = ({ onBack }) => {
    const [survey, setSurvey]                   = useState(null);
    const [answers, setAnswers]                 = useState({});
    const [visibleQuestions, setVisibleQuestions] = useState([]);
    const [isComplete, setIsComplete]           = useState(false);
    const [loading, setLoading]                 = useState(true);
    const [error, setError]                     = useState(null);
    const [submitted, setSubmitted]             = useState(false);

    // Track the version the session started on without triggering re-renders.
    // Used later for version-conflict detection (Project 2 versioning step).
    const sessionVersionRef = useRef(null);

    // ── Load survey once on mount ──
    useEffect(() => {
        fetchSurvey(SURVEY_ID)
            .then(s => {
                setSurvey(s);
                sessionVersionRef.current = s.version;
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    // ── Re-compute visible questions whenever answers change ──
    useEffect(() => {
        if (!survey) return;

        fetchVisibleQuestions(SURVEY_ID, answers)
            .then(({ visibleQuestions: vq, isComplete: ic, surveyVersion: sv }) => {
                setVisibleQuestions(vq);
                setIsComplete(ic);

                // Version mismatch detection — no action yet, just a console warning.
                // This will be expanded into rollback/recovery logic in a later step.
                if (sessionVersionRef.current !== null && sv !== sessionVersionRef.current) {
                    console.warn(
                        `[SurveyPage] Survey version changed mid-session: ` +
                        `${sessionVersionRef.current} → ${sv}`
                    );
                    sessionVersionRef.current = sv;
                }
            })
            .catch(err => setError(err.message));
    }, [answers, survey]);

    // ── Answer change handler ──
    const handleAnswerChange = (questionId, value) => {
        setAnswers(prev => ({ ...prev, [questionId]: value }));
    };

    // ── Submit handler ──
    // Submission endpoint is added in a later step.
    // For now, log the completed answers and show a confirmation screen.
    const handleSubmit = () => {
        console.log('[SurveyPage] Survey submitted:', JSON.stringify(answers, null, 2));
        setSubmitted(true);
    };

    // ── Render states ──

    if (loading) {
        return (
            <div className="survey-loading" data-testid="survey-loading">
                Loading survey…
            </div>
        );
    }

    if (error) {
        return (
            <div className="survey-error" data-testid="survey-error">
                <p>Something went wrong: {error}</p>
                <button onClick={onBack}>Back to Dashboard</button>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="survey-submitted" data-testid="survey-submitted">
                <h2>Thank you for your feedback!</h2>
                <p>Your responses have been recorded.</p>
                <button onClick={onBack}>Back to Dashboard</button>
            </div>
        );
    }

    return (
        <SurveyPlayer
            survey={survey}
            visibleQuestions={visibleQuestions}
            answers={answers}
            isComplete={isComplete}
            onAnswerChange={handleAnswerChange}
            onSubmit={handleSubmit}
            onBack={onBack}
        />
    );
};

export default SurveyPage;
