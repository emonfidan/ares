import { useState, useEffect, useRef, useCallback } from 'react';
import SurveyPlayer from './SurveyPlayer';
import { fetchSurvey, fetchVisibleQuestions, resolveConflict, submitSurvey } from '../../services/surveyApi';
import './SurveyPage.css';

// ─── SurveyPage ───────────────────────────────────────────
// Smart container responsible for:
//   - loading the survey definition on mount
//   - holding the answers state
//   - re-computing visible questions after every answer change
//   - detecting and resolving survey version conflicts (RCLR)
//   - persisting submissions via the API
//   - delegating all rendering to SurveyPlayer
//
// Props:
//   surveyId — the survey to load; provided by the caller, never hardcoded here
//   user     — the logged-in user object ({ email, name, ... })
//   onBack   — navigate back to wherever the user came from

const SurveyPage = ({ surveyId, user, onBack }) => {
    const [survey, setSurvey] = useState(null);
    const [answers, setAnswers] = useState({});
    const [visibleQuestions, setVisibleQuestions] = useState([]);
    const [isComplete, setIsComplete] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // ── Conflict resolution state ──
    const [conflictInfo, setConflictInfo] = useState(null);
    const [recovering, setRecovering] = useState(false);

    // Track the version the session started on without triggering re-renders.
    const sessionVersionRef = useRef(null);

    // ── Guard: surveyId must be present ──
    useEffect(() => {
        if (!surveyId) {
            setError('No survey selected. Please go back and choose a survey.');
            setLoading(false);
        }
    }, [surveyId]);

    // ── Load survey once on mount ──
    useEffect(() => {
        if (!surveyId) return;
        fetchSurvey(surveyId)
            .then(s => {
                setSurvey(s);
                sessionVersionRef.current = s.version;
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [surveyId]);

    // ── Re-compute visible questions whenever answers change ──
    useEffect(() => {
        if (!survey || !surveyId) return;

        fetchVisibleQuestions(surveyId, answers)
            .then(({ visibleQuestions: vq, isComplete: ic, surveyVersion: sv }) => {
                setVisibleQuestions(vq);
                setIsComplete(ic);

                // ── Version mismatch → trigger conflict resolution ──
                if (sessionVersionRef.current !== null && sv !== sessionVersionRef.current) {
                    handleVersionConflict(sv);
                }
            })
            .catch(err => setError(err.message));
    }, [answers, survey]);

    // ── Conflict resolution handler ──
    const handleVersionConflict = useCallback(async (newServerVersion) => {
        setRecovering(true);
        try {
            const result = await resolveConflict(
                surveyId,
                answers,
                sessionVersionRef.current
            );

            if (!result.hasConflict) {
                // Version changed but no conflict — just update the ref
                sessionVersionRef.current = result.surveyVersion;
                setRecovering(false);
                return;
            }

            // Real conflict detected — apply recovery
            const { recovery } = result;
            setConflictInfo({
                droppedAnswers: recovery.droppedAnswers,
                stableNode: recovery.stableNode,
                newVersion: result.surveyVersion,
                oldVersion: sessionVersionRef.current,
            });

            // Apply recovered answers (atomic state recovery)
            setAnswers(recovery.recoveredAnswers);
            setVisibleQuestions(recovery.newVisibleQuestions);

            // Update version ref to the new version
            sessionVersionRef.current = result.surveyVersion;

            // Re-fetch the survey definition to stay current
            const updatedSurvey = await fetchSurvey(surveyId);
            setSurvey(updatedSurvey);
        } catch (err) {
            setError(`Conflict resolution failed: ${err.message}`);
        } finally {
            setRecovering(false);
        }
    }, [surveyId, answers]);

    // ── Dismiss conflict notification ──
    const handleDismissConflict = () => setConflictInfo(null);

    // ── Answer change handler ──
    const handleAnswerChange = (questionId, value) => {
        setAnswers(prev => ({ ...prev, [questionId]: value }));
    };

    // ── Submit handler ──
    // Before submitting, we check for a version conflict.  If the admin
    // modified the survey while the user was answering, the submission would
    // fail ("not complete") — instead, we detect + resolve the conflict so the
    // user sees the recovery banner and can finish the new required fields.
    const handleSubmit = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            // ── Pre-flight conflict check ──
            const conflictResult = await resolveConflict(
                surveyId,
                answers,
                sessionVersionRef.current
            );

            if (conflictResult.hasConflict) {
                // Conflict found — apply recovery instead of submitting
                const { recovery } = conflictResult;
                setConflictInfo({
                    droppedAnswers: recovery.droppedAnswers,
                    stableNode: recovery.stableNode,
                    newVersion: conflictResult.surveyVersion,
                    oldVersion: sessionVersionRef.current,
                });
                setAnswers(recovery.recoveredAnswers);
                setVisibleQuestions(recovery.newVisibleQuestions);
                sessionVersionRef.current = conflictResult.surveyVersion;

                // Re-fetch the updated survey definition
                const updatedSurvey = await fetchSurvey(surveyId);
                setSurvey(updatedSurvey);
                setIsComplete(false); // force re-evaluation
                setSubmitting(false);
                return; // don't submit — let user review + fill new fields
            }

            // No conflict — update version ref silently and submit
            sessionVersionRef.current = conflictResult.surveyVersion;

            const userId = user?.email || 'anonymous';
            await submitSurvey(surveyId, answers, userId);
            setSubmitted(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
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
        // Auto-redirect after 2 seconds so the user sees the message briefly
        // before being returned to the dashboard safely.
        setTimeout(onBack, 2000);
        return (
            <div className="survey-error" data-testid="survey-error">
                <p>{error}</p>
                <p>Returning to dashboard…</p>
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
        <div className="survey-page-wrapper" data-testid="survey-page">
            {/* ── Conflict resolution banner ── */}
            {/* Spec requirement: NOT a simple pop-up message */}
            {conflictInfo && (
                <div className="conflict-banner" data-testid="conflict-banner">
                    <div className="conflict-banner-inner">
                        <div className="conflict-icon">⚠️</div>
                        <div className="conflict-content">
                            <h3>Survey Updated While You Were Answering</h3>
                            <p>
                                The survey administrator modified this survey
                                (v{conflictInfo.oldVersion} → v{conflictInfo.newVersion}).
                            </p>
                            {conflictInfo.droppedAnswers.length > 0 && (
                                <div className="conflict-detail">
                                    <strong>Answers removed:</strong>{' '}
                                    {conflictInfo.droppedAnswers.length} answer(s) were
                                    invalidated by the schema change and have been cleared.
                                </div>
                            )}
                            {conflictInfo.stableNode && (
                                <div className="conflict-detail">
                                    <strong>Rollback point:</strong> Your progress has been
                                    preserved up to question "{conflictInfo.stableNode}".
                                    Please review and continue from there.
                                </div>
                            )}
                            <p className="conflict-note">
                                Your remaining valid answers have been automatically recovered.
                                Please review the survey and complete any new or missing fields.
                            </p>
                        </div>
                        <button
                            className="conflict-dismiss"
                            onClick={handleDismissConflict}
                            data-testid="conflict-dismiss"
                        >
                            Understood
                        </button>
                    </div>
                </div>
            )}

            {/* ── Recovery overlay ── */}
            {recovering && (
                <div className="recovery-overlay" data-testid="recovery-overlay">
                    <div className="recovery-spinner">
                        <div className="spinner" />
                        <p>Resolving schema conflict…</p>
                    </div>
                </div>
            )}

            <SurveyPlayer
                survey={survey}
                visibleQuestions={visibleQuestions}
                answers={answers}
                isComplete={isComplete && !recovering}
                onAnswerChange={handleAnswerChange}
                onSubmit={handleSubmit}
                onBack={onBack}
                submitting={submitting}
            />
        </div>
    );
};

export default SurveyPage;
