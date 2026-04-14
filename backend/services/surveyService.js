const fs = require('fs');
const path = require('path');

const SURVEYS_FILE = path.join(__dirname, '../data/surveys.json');

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

function updateSurvey(id, updates) {
    const surveysData = loadSurveys();
    const idx = surveysData.surveys.findIndex(s => s.surveyId === id);
    if (idx === -1) return null;

    const current = surveysData.surveys[idx];
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

module.exports = {
    getAllSurveys,
    getSurveyById,
    getActiveSurveyId,
    setActiveSurveyId,
    deleteSurvey,
    getVisibleQuestions,
    isPathComplete,
    validateAnswers,
    createSurvey,
    updateSurvey,
    // exported for unit testing
    evaluateCondition,
    resolveVisibleQuestionIds
};
