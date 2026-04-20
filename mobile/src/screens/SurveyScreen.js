/**
 * SurveyScreen.js — Survey player with DAG logic and conflict resolution
 *
 * Mirrors the web SurveyPage.jsx logic:
 *   - Loads the survey definition from the backend
 *   - Computes visible questions via POST /visible-questions on each answer change
 *   - Tracks session version for conflict detection
 *   - Pre-flight conflict check before submission
 *   - Atomic State Recovery when version mismatch is detected
 *   - ConflictBanner display (NOT a simple Alert — per project spec)
 *   - Submit only when isComplete === true
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, ActivityIndicator, StatusBar,
} from 'react-native';
import { fetchSurvey, fetchVisibleQuestions, resolveConflict, submitSurvey } from '../services/api';
import QuestionRenderer from '../components/QuestionRenderer';
import ConflictBanner from '../components/ConflictBanner';

const SurveyScreen = ({ route, navigation }) => {
    const { surveyId, user } = route.params;

    const [survey, setSurvey] = useState(null);
    const [answers, setAnswers] = useState({});
    const [visibleQuestions, setVisibleQuestions] = useState([]);
    const [isComplete, setIsComplete] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Conflict resolution state
    const [conflictInfo, setConflictInfo] = useState(null);
    const [recovering, setRecovering] = useState(false);

    // Track the version the session started on
    const sessionVersionRef = useRef(null);

    // ── Load survey once ──
    useEffect(() => {
        if (!surveyId) {
            setError('No survey selected.');
            setLoading(false);
            return;
        }
        fetchSurvey(surveyId)
            .then((s) => {
                setSurvey(s);
                sessionVersionRef.current = s.version;
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [surveyId]);

    // ── Re-compute visible questions on answer change ──
    useEffect(() => {
        if (!survey || !surveyId) return;

        fetchVisibleQuestions(surveyId, answers)
            .then(({ visibleQuestions: vq, isComplete: ic, surveyVersion: sv }) => {
                setVisibleQuestions(vq);
                setIsComplete(ic);

                // Version mismatch → trigger conflict resolution
                if (sessionVersionRef.current !== null && sv !== sessionVersionRef.current) {
                    handleVersionConflict(sv);
                }
            })
            .catch((err) => setError(err.message));
    }, [answers, survey]);

    // ── Conflict resolution handler ──
    const handleVersionConflict = useCallback(async (newServerVersion) => {
        setRecovering(true);
        try {
            const result = await resolveConflict(surveyId, answers, sessionVersionRef.current);

            if (!result.hasConflict) {
                sessionVersionRef.current = result.surveyVersion;
                setRecovering(false);
                return;
            }

            // Real conflict — apply recovery
            const { recovery } = result;
            setConflictInfo({
                droppedAnswers: recovery.droppedAnswers,
                stableNode: recovery.stableNode,
                newVersion: result.surveyVersion,
                oldVersion: sessionVersionRef.current,
            });

            setAnswers(recovery.recoveredAnswers);
            setVisibleQuestions(recovery.newVisibleQuestions);
            sessionVersionRef.current = result.surveyVersion;

            // Re-fetch survey definition
            const updatedSurvey = await fetchSurvey(surveyId);
            setSurvey(updatedSurvey);
        } catch (err) {
            setError(`Conflict resolution failed: ${err.message}`);
        } finally {
            setRecovering(false);
        }
    }, [surveyId, answers]);

    // ── Answer change ──
    const handleAnswerChange = (questionId, value) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    // ── Submit with pre-flight conflict check ──
    const handleSubmit = async () => {
        if (submitting) return;
        setSubmitting(true);

        try {
            // Pre-flight conflict check
            const conflictResult = await resolveConflict(
                surveyId,
                answers,
                sessionVersionRef.current
            );

            if (conflictResult.hasConflict) {
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

                const updatedSurvey = await fetchSurvey(surveyId);
                setSurvey(updatedSurvey);
                setIsComplete(false);
                setSubmitting(false);
                return; // Don't submit — let user review
            }

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

    // ── Render: Loading ──
    if (loading) {
        return (
            <View style={styles.centered} accessibilityLabel="survey-loading">
                <StatusBar barStyle="light-content" backgroundColor="#1A1A2E" />
                <ActivityIndicator size="large" color="#6C63FF" />
                <Text style={styles.loadingText}>Loading survey…</Text>
            </View>
        );
    }

    // ── Render: Error ──
    if (error) {
        return (
            <View style={styles.centered} accessibilityLabel="survey-error">
                <StatusBar barStyle="light-content" backgroundColor="#1A1A2E" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="error-back-button"
                >
                    <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Render: Submitted ──
    if (submitted) {
        return (
            <View style={styles.centered} accessibilityLabel="survey-submitted">
                <StatusBar barStyle="light-content" backgroundColor="#1A1A2E" />
                <Text style={styles.thankYouTitle}>🎉 Thank you!</Text>
                <Text style={styles.thankYouText}>Your responses have been recorded.</Text>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => navigation.goBack()}
                    accessibilityLabel="submitted-back-button"
                >
                    <Text style={styles.backBtnText}>← Back to Dashboard</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Render: Survey Player ──
    return (
        <View style={styles.container} accessibilityLabel="survey-player">
            <StatusBar barStyle="light-content" backgroundColor="#1A1A2E" />

            {/* Recovery overlay */}
            {recovering && (
                <View style={styles.recoveryOverlay} accessibilityLabel="recovery-overlay">
                    <ActivityIndicator size="large" color="#FFF" />
                    <Text style={styles.recoveryText}>Resolving schema conflict…</Text>
                </View>
            )}

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        accessibilityLabel="back-button"
                    >
                        <Text style={styles.headerBack}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.surveyTitle}>{survey?.title}</Text>
                    {survey?.description ? (
                        <Text style={styles.surveyDesc}>{survey.description}</Text>
                    ) : null}
                </View>

                {/* Conflict Banner */}
                <ConflictBanner
                    conflictInfo={conflictInfo}
                    onDismiss={() => setConflictInfo(null)}
                />

                {/* Questions */}
                {visibleQuestions.map((q) => (
                    <QuestionRenderer
                        key={q.id}
                        question={q}
                        answers={answers}
                        onAnswerChange={handleAnswerChange}
                    />
                ))}

                {/* Submit */}
                <TouchableOpacity
                    style={[
                        styles.submitBtn,
                        (!isComplete || recovering) && styles.submitBtnDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={!isComplete || recovering || submitting}
                    accessibilityLabel="submit-button"
                >
                    {submitting ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.submitBtnText}>Submit Survey</Text>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F2F5',
    },
    centered: {
        flex: 1,
        backgroundColor: '#1A1A2E',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    loadingText: {
        color: '#A0AEC0',
        marginTop: 12,
        fontSize: 14,
    },
    errorText: {
        color: '#FC8181',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 16,
    },
    thankYouTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: '#6C63FF',
        marginBottom: 8,
    },
    thankYouText: {
        color: '#A0AEC0',
        fontSize: 16,
        marginBottom: 24,
    },
    backBtn: {
        paddingVertical: 10,
        paddingHorizontal: 20,
    },
    backBtnText: {
        color: '#6C63FF',
        fontSize: 14,
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    header: {
        marginBottom: 16,
    },
    headerBack: {
        color: '#6C63FF',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 12,
    },
    surveyTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1A1A2E',
    },
    surveyDesc: {
        fontSize: 13,
        color: '#718096',
        marginTop: 4,
    },
    submitBtn: {
        backgroundColor: '#6C63FF',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    submitBtnDisabled: {
        backgroundColor: '#A0AEC0',
    },
    submitBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },
    recoveryOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    recoveryText: {
        color: '#FFF',
        marginTop: 12,
        fontSize: 14,
    },
});

export default SurveyScreen;
