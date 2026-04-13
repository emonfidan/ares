const API_BASE = 'http://localhost:3001';

// Fetch the full survey definition (questions + edges + version).
export async function fetchSurvey(surveyId) {
    const res = await fetch(`${API_BASE}/api/surveys/${surveyId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load survey');
    return data.survey;
}

// Given the current answers, ask the backend which questions should be visible
// and whether the path is complete enough to submit.
//
// Returns: { visibleQuestions, isComplete, surveyVersion }
export async function fetchVisibleQuestions(surveyId, answers) {
    const res = await fetch(`${API_BASE}/api/surveys/${surveyId}/visible-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to compute visible questions');
    return {
        visibleQuestions: data.visibleQuestions,
        isComplete: data.isComplete,
        surveyVersion: data.surveyVersion
    };
}
