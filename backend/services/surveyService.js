const fs = require('fs');
const path = require('path');

const SURVEYS_FILE = path.join(__dirname, '../data/surveys.json');

// ─── Version History ─────────────────────────────────────
// In-memory store of previous survey versions so that the conflict
// resolution route can compare the REAL old survey against the new one.
// Key: "surveyId::version", Value: deep-cloned survey snapshot.

const versionHistory = new Map();

// Retrieve a previously stored snapshot, or null if unavailable.
function getSurveySnapshot(surveyId, version) {
    return versionHistory.get(`${surveyId}::${version}`) || null;
}

// ─── File I/O ────────────────────────────────────────────

function loadSurveys() {
    const data = fs.readFileSync(SURVEYS_FILE, 'utf8');
    return JSON.parse(data);
}

function saveSurveys(surveysData) {
    fs.writeFileSync(SURVEYS_FILE, JSON.stringify(surveysData, null, 2));
}

// ─── Basic Lookups ────────────────────────────────────────

function getAllSurveys() {
    const { surveys } = loadSurveys();
    return surveys;
}

function getSurveyById(id) {
    const surveys = getAllSurveys();
    return surveys.find(s => s.surveyId === id) || null;
}

// ─── Condition Evaluator ──────────────────────────────────
//
// A condition references a previously answered question and checks its value.
// If the referenced question has not been answered yet, the condition is
// treated as unsatisfied so the walk stops at the current question.
//
// Supported operators: equals | notEquals | in | notIn

function evaluateCondition(condition, answers) {
    if (!condition) return true;

    const { questionId, operator, value } = condition;
    const answer = answers[questionId];

    // Unanswered prerequisite — do not follow this edge yet
    if (answer === undefined || answer === null || answer === '') return false;

    switch (operator) {
        case 'equals':    return answer === value;
        case 'notEquals': return answer !== value;
        case 'in':        return Array.isArray(value) && value.includes(answer);
        case 'notIn':     return Array.isArray(value) && !value.includes(answer);
        default:          return true;
    }
}

// ─── Graph Walk ───────────────────────────────────────────
//
// Starting from entryQuestion, follow edges whose conditions are satisfied
// by the current answers.  Returns an ordered array of visible question IDs.
//
// The walk is linear (one next-hop per step) because each question has at
// most one valid outgoing edge given the current answers.  This matches the
// DAG structure described in the project spec.

function resolveVisibleQuestionIds(survey, answers) {
    const { entryQuestion, edges } = survey;
    const visited = new Set();
    const ordered = [];

    let current = entryQuestion;

    while (current && !visited.has(current)) {
        visited.add(current);
        ordered.push(current);

        const outgoing = edges.filter(e => e.from === current);
        const next = outgoing.find(e => evaluateCondition(e.condition, answers));

        if (!next) break;
        current = next.to;
    }

    return ordered;
}

// ─── Public: Visible Questions ────────────────────────────
//
// Returns the full question objects (in order) that should be shown to the
// respondent given their answers so far.

function getVisibleQuestions(surveyId, answers = {}) {
    const survey = getSurveyById(surveyId);
    if (!survey) return null;

    const visibleIds = resolveVisibleQuestionIds(survey, answers);
    const questionMap = Object.fromEntries(survey.questions.map(q => [q.id, q]));

    return visibleIds.map(id => questionMap[id]).filter(Boolean);
}

// ─── Public: Answer Validation ───────────────────────────
//
// Checks format constraints declared in each question's `validation` field.
// Returns { [questionId]: errorMessage } for every answer that fails.
// An empty object means all answers are valid.
//
// Currently enforced:
//   numericOnly  — value must contain only digit characters
//   length       — value must be exactly N digits (requires numericOnly)

function validateAnswers(surveyId, answers = {}) {
    const survey = getSurveyById(surveyId);
    if (!survey) return {};

    const errors = {};

    for (const question of survey.questions) {
        if (question.type !== 'numeric') continue;
        const val = question.validation;
        if (!val) continue;

        const answer = answers[question.id];
        // Skip unanswered fields — presence is handled by isPathComplete
        if (answer === undefined || answer === null || answer === '') continue;

        const str = String(answer).trim();

        if (val.numericOnly && !/^\d+$/.test(str)) {
            errors[question.id] = 'Only numeric characters are allowed.';
        } else if (val.numericOnly && val.length && str.length !== val.length) {
            errors[question.id] = `Must be exactly ${val.length} digits.`;
        }
    }

    return errors;
}

// ─── Public: Path Completeness ────────────────────────────
//
// Returns true when:
//   1. every required visible question has a non-empty answer, AND
//   2. all answers pass format validation (e.g. ID is exactly 8 digits).
// This is the condition under which the Submit button should appear.

function isPathComplete(surveyId, answers = {}) {
    const visibleQuestions = getVisibleQuestions(surveyId, answers);
    if (!visibleQuestions) return false;

    const allAnswered = visibleQuestions.every(q => {
        if (!q.required) return true;
        const answer = answers[q.id];
        return answer !== undefined && answer !== null && answer !== '';
    });

    if (!allAnswered) return false;

    const errors = validateAnswers(surveyId, answers);
    return Object.keys(errors).length === 0;
}

// ─── Public: Active Survey ────────────────────────────────

function getActiveSurveyId() {
    const data = loadSurveys();
    return data.activeSurveyId || null;
}

function setActiveSurveyId(surveyId) {
    const surveysData = loadSurveys();
    const exists = surveysData.surveys.some(s => s.surveyId === surveyId);
    if (!exists) throw new Error(`Survey "${surveyId}" does not exist`);
    surveysData.activeSurveyId = surveyId;
    saveSurveys(surveysData);
    return surveyId;
}

// ─── Public: CRUD ─────────────────────────────────────────

function createSurvey(data) {
    const surveysData = loadSurveys();
    const existing = surveysData.surveys.find(s => s.surveyId === data.surveyId);
    if (existing) {
        throw new Error(`Survey with id "${data.surveyId}" already exists`);
    }
    const newSurvey = { ...data, version: 1 };
    surveysData.surveys.push(newSurvey);
    saveSurveys(surveysData);
    return newSurvey;
}

// Update a survey and bump its version number.
// The surveyId cannot be changed; all other fields are replaced by updates.
// IMPORTANT: A deep-copy snapshot of the old version is stored in
// versionHistory so that conflict resolution can compare against it.

function updateSurvey(id, updates) {
    const surveysData = loadSurveys();
    const idx = surveysData.surveys.findIndex(s => s.surveyId === id);
    if (idx === -1) return null;

    const current = surveysData.surveys[idx];

    // ── Snapshot the current version before overwriting ──
    versionHistory.set(
        `${current.surveyId}::${current.version}`,
        JSON.parse(JSON.stringify(current))   // deep clone
    );

    const updated = {
        ...current,
        ...updates,
        surveyId: current.surveyId,   // immutable
        version: current.version + 1  // always increment on update
    };

    surveysData.surveys[idx] = updated;
    saveSurveys(surveysData);
    return updated;
}

function deleteSurvey(id) {
    const surveysData = loadSurveys();
    const idx = surveysData.surveys.findIndex(s => s.surveyId === id);
    if (idx === -1) return false;
    surveysData.surveys.splice(idx, 1);
    if (surveysData.activeSurveyId === id) {
        surveysData.activeSurveyId = null;
    }
    saveSurveys(surveysData);
    return true;
}

// ─── Public: Conflict Detection ──────────────────────────
//
// Compares an old survey version with a new one, given the user's current
// answers.  Returns an object describing any conflicts found:
//   hasConflict        — true if any conflict exists
//   deletedQuestions   — question IDs that existed in old but not in new
//   orphanedAnswers    — answered question IDs that no longer exist in new
//   modifiedEdges      — true if the edge set changed in a way that
//                        invalidates the current path
//   newRequiredQuestions — required question IDs added in the new version
//                          that the user hasn't answered yet

function detectConflict(oldSurvey, newSurvey, answers) {
    const oldIds = new Set(oldSurvey.questions.map(q => q.id));
    const newIds = new Set(newSurvey.questions.map(q => q.id));
    const answerIds = Object.keys(answers).filter(k =>
        answers[k] !== undefined && answers[k] !== null && answers[k] !== ''
    );

    // 1. Questions deleted between versions
    const deletedQuestions = [...oldIds].filter(id => !newIds.has(id));

    // 2. Answers that reference deleted questions
    const orphanedAnswers = answerIds.filter(id => !newIds.has(id));

    // 3. Check if the current path is still valid under the new edges
    const newVisible = resolveVisibleQuestionIds(newSurvey, answers);
    const oldVisible = resolveVisibleQuestionIds(oldSurvey, answers);
    const modifiedEdges = JSON.stringify(oldVisible) !== JSON.stringify(newVisible);

    // 4. New required questions that weren't in the old version
    const newRequiredQuestions = newSurvey.questions
        .filter(q => q.required && !oldIds.has(q.id))
        .map(q => q.id);

    const hasConflict =
        deletedQuestions.length > 0 ||
        orphanedAnswers.length > 0 ||
        modifiedEdges ||
        newRequiredQuestions.length > 0;

    return {
        hasConflict,
        deletedQuestions,
        orphanedAnswers,
        modifiedEdges,
        newRequiredQuestions,
    };
}

// ─── Public: Atomic State Recovery ───────────────────────
//
// Re-maps existing answers to the new DAG structure without data loss
// where possible.  Returns:
//   recoveredAnswers     — answers that are still valid in the new DAG
//   droppedAnswers       — question IDs whose answers were discarded
//   newVisibleQuestions  — visible question objects after recovery

function atomicStateRecovery(answers, newSurvey) {
    const newQuestionIds = new Set(newSurvey.questions.map(q => q.id));

    // Step 1: Keep only answers whose questions still exist
    const recoveredAnswers = {};
    const droppedAnswers = [];

    for (const [qId, value] of Object.entries(answers)) {
        if (newQuestionIds.has(qId)) {
            recoveredAnswers[qId] = value;
        } else {
            droppedAnswers.push(qId);
        }
    }

    // Step 2: Compute the new visible path with recovered answers
    const visibleIds = resolveVisibleQuestionIds(newSurvey, recoveredAnswers);
    const visibleSet = new Set(visibleIds);

    // Step 3: Drop answers for questions that exist but are no longer reachable
    for (const qId of Object.keys(recoveredAnswers)) {
        if (!visibleSet.has(qId)) {
            droppedAnswers.push(qId);
            delete recoveredAnswers[qId];
        }
    }

    // Step 4: Build the full visible question objects
    const questionMap = Object.fromEntries(newSurvey.questions.map(q => [q.id, q]));
    const newVisibleQuestions = visibleIds.map(id => questionMap[id]).filter(Boolean);

    return {
        recoveredAnswers,
        droppedAnswers,
        newVisibleQuestions,
    };
}

// ─── Public: Find Last Stable Node ───────────────────────
//
// Walks the new DAG using the existing answers and returns the deepest
// question ID that:
//   1. Still exists in the new survey
//   2. Has a valid answer
//   3. Is reachable from the entry question
//
// Returns null if no answered question is reachable in the new DAG.

function findLastStableNode(answers, newSurvey) {
    const newQuestionIds = new Set(newSurvey.questions.map(q => q.id));

    // Walk the new DAG with the existing answers
    const visibleIds = resolveVisibleQuestionIds(newSurvey, answers);

    // Find the deepest visible question that has an answer
    let lastStable = null;
    for (const qId of visibleIds) {
        if (!newQuestionIds.has(qId)) continue;
        const answer = answers[qId];
        if (answer !== undefined && answer !== null && answer !== '') {
            lastStable = qId;
        }
    }

    return lastStable;
}

// ─── Public: Survey Response Submission ──────────────────
//
// Persists a completed survey response.  Enforces:
//   1. Survey must exist
//   2. Path must be complete (all required visible questions answered + valid)
//   3. No duplicate submissions from the same user for the same survey

const RESPONSES_FILE = path.join(__dirname, '../data/responses.json');

function loadResponses() {
    try {
        const data = fs.readFileSync(RESPONSES_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        // File doesn't exist yet — start fresh
        return { responses: [] };
    }
}

function saveResponses(data) {
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(data, null, 2));
}

function submitSurveyResponse(surveyId, answers, userId) {
    const survey = getSurveyById(surveyId);
    if (!survey) throw new Error(`Survey "${surveyId}" not found`);

    if (!isPathComplete(surveyId, answers)) {
        throw new Error('Survey is not complete — all required visible questions must be answered');
    }

    const responsesData = loadResponses();

    // Duplicate check
    const existing = responsesData.responses.find(
        r => r.surveyId === surveyId && r.userId === userId
    );
    if (existing) {
        throw new Error(`User "${userId}" has already submitted a response for survey "${surveyId}"`);
    }

    const response = {
        responseId: `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        surveyId,
        userId,
        surveyVersion: survey.version,
        answers,
        submittedAt: new Date().toISOString(),
    };

    responsesData.responses.push(response);
    saveResponses(responsesData);

    return { success: true, responseId: response.responseId };
}

// ── E2E Test Helpers ─────────────────────────────────────────

/**
 * Delete all responses for a given surveyId.
 * Used by E2E tests to clean up stale submissions between runs.
 */
function deleteResponsesForSurvey(surveyId) {
    const data = loadResponses();
    const before = data.responses.length;
    data.responses = data.responses.filter(r => r.surveyId !== surveyId);
    const removed = before - data.responses.length;
    saveResponses(data);
    return removed;
}

module.exports = {
    getAllSurveys,
    getSurveyById,
    getSurveySnapshot,
    getActiveSurveyId,
    setActiveSurveyId,
    deleteSurvey,
    getVisibleQuestions,
    isPathComplete,
    validateAnswers,
    createSurvey,
    updateSurvey,
    // Conflict resolution (GBCR/RCLR)
    detectConflict,
    atomicStateRecovery,
    findLastStableNode,
    // Submission
    submitSurveyResponse,
    // E2E helpers
    deleteResponsesForSurvey,
    // Exported for unit testing
    evaluateCondition,
    resolveVisibleQuestionIds,
};

