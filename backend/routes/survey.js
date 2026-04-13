const express = require('express');
const router = express.Router();
const surveyService = require('../services/surveyService');

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

router.post('/', (req, res) => {
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

module.exports = router;
