/**
 * api.js — Mobile API service layer
 *
 * Mirrors the web frontend's surveyApi.js but targets the backend
 * from the Android emulator (10.0.2.2 = host machine's localhost).
 * When using Expo Go on a physical device, change to the host's LAN IP.
 */

import { Platform } from 'react-native';

// Android emulator maps 10.0.2.2 → host machine's localhost
// Physical device / Expo Go: use the host machine's LAN IP
const API_BASE = Platform.OS === 'android'
    ? 'http://10.0.2.2:3001'
    : 'http://localhost:3001';

// ─── Auth ────────────────────────────────────────────────

export async function login(identifier, password) {
    const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json();
    return { status: res.status, ...data };
}

export async function register(email, password, name, phone) {
    const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, phone: phone || null }),
    });
    const data = await res.json();
    return { status: res.status, ...data };
}

// ─── Surveys ─────────────────────────────────────────────

export async function fetchActiveSurveyId() {
    const res = await fetch(`${API_BASE}/api/surveys/active`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to fetch active survey');
    return data.activeSurveyId;
}

export async function fetchSurvey(surveyId) {
    const res = await fetch(`${API_BASE}/api/surveys/${encodeURIComponent(surveyId)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load survey');
    return data.survey;
}

export async function fetchVisibleQuestions(surveyId, answers) {
    const res = await fetch(
        `${API_BASE}/api/surveys/${encodeURIComponent(surveyId)}/visible-questions`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers }),
        }
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to compute visible questions');
    return {
        visibleQuestions: data.visibleQuestions,
        isComplete: data.isComplete,
        surveyVersion: data.surveyVersion,
    };
}

export async function resolveConflict(surveyId, answers, clientVersion) {
    const res = await fetch(
        `${API_BASE}/api/surveys/${encodeURIComponent(surveyId)}/resolve-conflict`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers, clientVersion }),
        }
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to resolve conflict');
    return data;
}

export async function submitSurvey(surveyId, answers, userId) {
    const res = await fetch(
        `${API_BASE}/api/surveys/${encodeURIComponent(surveyId)}/submit`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers, userId }),
        }
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to submit survey');
    return { responseId: data.responseId };
}
