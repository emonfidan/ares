const API_BASE = 'http://localhost:3001';

// Fetch summary list of all surveys (surveyId, title, version, description).
export async function fetchAllSurveys() {
    const res = await fetch(`${API_BASE}/api/surveys`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load surveys');
    return data.surveys;
}

// Fetch the full survey definition (questions + edges + version).
export async function fetchSurvey(surveyId) {
    const res = await fetch(`${API_BASE}/api/surveys/${encodeURIComponent(surveyId)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load survey');
    return data.survey;
}

// Create a new survey. Sends the full survey definition to the backend.
// Returns the created survey object on success.
export async function createSurvey(surveyData) {
    const res = await fetch(`${API_BASE}/api/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(surveyData)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to create survey');
    return data.survey;
}

// Update an existing survey. Version is bumped automatically by the backend.
// Returns the updated survey object on success.
export async function updateSurvey(surveyId, surveyData) {
    const res = await fetch(`${API_BASE}/api/surveys/${encodeURIComponent(surveyId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(surveyData)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to update survey');
    return data.survey;
}

// Fetch the currently active survey ID (or null if none is set).
export async function fetchActiveSurveyId() {
    const res = await fetch(`${API_BASE}/api/surveys/active`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to fetch active survey');
    return data.activeSurveyId; // may be null
}

// Admin: set the active survey.
export async function setActiveSurvey(adminEmail, surveyId) {
    const res = await fetch(`${API_BASE}/api/surveys/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail, surveyId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to set active survey');
    return data.activeSurveyId;
}

// Admin: delete a survey. Clears activeSurveyId on the backend if it was the active one.
export async function deleteSurvey(adminEmail, surveyId) {
    const res = await fetch(`${API_BASE}/api/surveys/${encodeURIComponent(surveyId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to delete survey');
}

// Given the current answers, ask the backend which questions should be visible
// and whether the path is complete enough to submit.
//
// Returns: { visibleQuestions, isComplete, surveyVersion }
export async function fetchVisibleQuestions(surveyId, answers) {
    const res = await fetch(`${API_BASE}/api/surveys/${encodeURIComponent(surveyId)}/visible-questions`, {
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
