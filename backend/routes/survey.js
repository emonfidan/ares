const express = require('express');
const router = express.Router();
const surveyService = require('../services/surveyService');
const fs = require('fs');
const path = require('path');

// ─── Admin guard ──────────────────────────────────────────
//
// SECURITY NOTE (project limitation): this check trusts the adminEmail value
// sent by the client and looks up the role in users.json.  There is no session
// token or JWT in this system, so a request with a forged adminEmail would
// bypass the check.  This is intentional for the scope of this project; a
// production system would use a signed token verified server-side.

const USERS_FILE = path.join(__dirname, '../users.json');

function requireAdmin(req, res, next) {
    const { adminEmail } = req.body;
    if (!adminEmail) {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const user = users.find(u => u.email === adminEmail);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    next();
}

// ─── GET /api/surveys ─────────────────────────────────────
// Returns a summary list of all surveys (no question/edge data).

router.get('/', (req, res) => {
    const surveys = surveyService.getAllSurveys();
    res.json({
        success: true,
        surveys: surveys.map(s => ({
            surveyId:    s.surveyId,
            title:       s.title,
            version:     s.version,
            description: s.description
        }))
    });
});

// ─── GET /api/surveys/active ──────────────────────────────
// Returns the active survey ID (or null if none is set).
// Must be registered BEFORE /:id to avoid route shadowing.

router.get('/active', (_req, res) => {
    const activeSurveyId = surveyService.getActiveSurveyId();
    res.json({ success: true, activeSurveyId });
});

// ─── PUT /api/surveys/active ──────────────────────────────
// Admin: set the active survey.
// Body: { adminEmail, surveyId }

router.put('/active', requireAdmin, (req, res) => {
    const { surveyId } = req.body;
    if (!surveyId) {
        return res.status(400).json({ success: false, message: 'surveyId is required.' });
    }
    try {
        surveyService.setActiveSurveyId(surveyId);
        res.json({ success: true, activeSurveyId: surveyId });
    } catch (err) {
        res.status(404).json({ success: false, message: err.message });
    }
});

// ─── GET /api/surveys/:id ─────────────────────────────────
// Returns the full survey definition: questions + edges + version.

router.get('/:id', (req, res) => {
    const survey = surveyService.getSurveyById(req.params.id);
    if (!survey) {
        return res.status(404).json({ success: false, message: 'Survey not found' });
    }
    res.json({ success: true, survey });
});

// ─── POST /api/surveys/:id/visible-questions ──────────────
// Core dynamic logic endpoint.
//
// Body: { answers: { q1: "Undergraduate", q2: "20201234", ... } }
//
// Returns:
//   - visibleQuestions: ordered array of question objects the respondent
//     should currently see
//   - isComplete: true when all visible required questions are answered
//     (i.e. the Submit button should appear)

router.post('/:id/visible-questions', (req, res) => {
    const { answers = {} } = req.body;

    const visible = surveyService.getVisibleQuestions(req.params.id, answers);
    if (!visible) {
        return res.status(404).json({ success: false, message: 'Survey not found' });
    }

    const isComplete = surveyService.isPathComplete(req.params.id, answers);

    res.json({
        success: true,
        surveyVersion: surveyService.getSurveyById(req.params.id).version,
        visibleQuestions: visible,
        isComplete
    });
});

// ─── POST /api/surveys ────────────────────────────────────
// Admin: create a new survey.
// Body must include surveyId, title, entryQuestion, questions[], edges[].

router.post('/', requireAdmin, (req, res) => {
    try {
        const survey = surveyService.createSurvey(req.body);
        res.status(201).json({ success: true, survey });
    } catch (err) {
        res.status(409).json({ success: false, message: err.message });
    }
});

// ─── PUT /api/surveys/:id ─────────────────────────────────
// Admin: update a survey.  Version is automatically incremented.
// Used later for versioning + conflict resolution scenarios.

router.put('/:id', (req, res) => {
    const updated = surveyService.updateSurvey(req.params.id, req.body);
    if (!updated) {
        return res.status(404).json({ success: false, message: 'Survey not found' });
    }
    res.json({ success: true, survey: updated });
});

// ─── DELETE /api/surveys/:id ──────────────────────────────
// Admin: delete a survey. Clears activeSurveyId if the deleted survey was active.

router.delete('/:id', requireAdmin, (req, res) => {
    const deleted = surveyService.deleteSurvey(req.params.id);
    if (!deleted) {
        return res.status(404).json({ success: false, message: 'Survey not found' });
    }
    res.json({ success: true });
});

module.exports = router;
