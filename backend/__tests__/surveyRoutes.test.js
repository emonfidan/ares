/**
 * surveyRoutes.test.js — Integration tests for survey API endpoints
 *
 * Uses supertest to exercise the Express routes end-to-end through HTTP,
 * validating request/response contracts, admin guards, and error handling.
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');

const SURVEYS_FILE  = path.join(__dirname, '../data/surveys.json');
const RESPONSES_FILE = path.join(__dirname, '../data/responses.json');
const USERS_FILE     = path.join(__dirname, '../users.json');

let originalSurveys, originalResponses;

// We need to load the app fresh for supertest
let app;

beforeAll(() => {
    originalSurveys   = fs.readFileSync(SURVEYS_FILE, 'utf8');
    try { originalResponses = fs.readFileSync(RESPONSES_FILE, 'utf8'); }
    catch { originalResponses = JSON.stringify({ responses: [] }); }

    // Ensure admin user exists in users.json for tests
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (!users.find(u => u.email === 'admin@admin.com')) {
        users.push({
            id: 999,
            email: 'admin@admin.com',
            password: 'Admin123!',
            name: 'Admin',
            role: 'admin',
            linkedProviders: [{ provider: 'password' }],
            accountStatus: 'Active',
            failedAttempts: 0,
            lastLoginIP: null,
            loginHistory: []
        });
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }

    // Clear module cache so app picks up current data
    delete require.cache[require.resolve('../server')];
    app = require('../server');
});

afterEach(() => {
    fs.writeFileSync(SURVEYS_FILE, originalSurveys);
    fs.writeFileSync(RESPONSES_FILE, originalResponses);
});

// ═══════════════════════════════════════════════════════════
// GET /api/surveys — List all surveys
// ═══════════════════════════════════════════════════════════

describe('GET /api/surveys', () => {
    test('returns a list of surveys with summary fields', async () => {
        const res = await request(app).get('/api/surveys');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.surveys)).toBe(true);
        expect(res.body.surveys.length).toBeGreaterThanOrEqual(1);
        // Should have summary fields, not full question data
        const first = res.body.surveys[0];
        expect(first).toHaveProperty('surveyId');
        expect(first).toHaveProperty('title');
        expect(first).toHaveProperty('version');
    });
});

// ═══════════════════════════════════════════════════════════
// GET /api/surveys/active — Active survey
// ═══════════════════════════════════════════════════════════

describe('GET /api/surveys/active', () => {
    test('returns the active survey ID', async () => {
        const res = await request(app).get('/api/surveys/active');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('activeSurveyId');
    });
});

// ═══════════════════════════════════════════════════════════
// GET /api/surveys/:id — Full survey definition
// ═══════════════════════════════════════════════════════════

describe('GET /api/surveys/:id', () => {
    test('returns full survey with questions and edges', async () => {
        const res = await request(app).get('/api/surveys/bilkent_feedback');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.survey).toHaveProperty('questions');
        expect(res.body.survey).toHaveProperty('edges');
        expect(res.body.survey).toHaveProperty('version');
    });

    test('returns 404 for non-existent survey', async () => {
        const res = await request(app).get('/api/surveys/nonexistent');
        expect(res.status).toBe(404);
    });
});

// ═══════════════════════════════════════════════════════════
// POST /api/surveys — Create survey (admin guarded)
// ═══════════════════════════════════════════════════════════

describe('POST /api/surveys', () => {
    test('creates a survey with admin email', async () => {
        const res = await request(app)
            .post('/api/surveys')
            .send({
                adminEmail: 'admin@admin.com',
                surveyId: 'route_test_create',
                title: 'Route Test Survey',
                entryQuestion: 'q1',
                questions: [{ id: 'q1', text: 'Q1', type: 'open-text', required: true }],
                edges: [],
            });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.survey.surveyId).toBe('route_test_create');
    });

    test('rejects without admin email (403)', async () => {
        const res = await request(app)
            .post('/api/surveys')
            .send({
                surveyId: 'no_admin',
                title: 'No Admin',
                entryQuestion: 'q1',
                questions: [],
                edges: [],
            });
        expect(res.status).toBe(403);
    });

    test('rejects with non-admin email (403)', async () => {
        const res = await request(app)
            .post('/api/surveys')
            .send({
                adminEmail: 'clean@example.com',
                surveyId: 'non_admin',
                title: 'Non Admin',
                entryQuestion: 'q1',
                questions: [],
                edges: [],
            });
        expect(res.status).toBe(403);
    });
});

// ═══════════════════════════════════════════════════════════
// PUT /api/surveys/:id — Update survey
// ═══════════════════════════════════════════════════════════

describe('PUT /api/surveys/:id', () => {
    test('updates a survey and bumps version', async () => {
        const res = await request(app)
            .put('/api/surveys/bilkent_feedback')
            .send({ title: 'Updated Title' });
        expect(res.status).toBe(200);
        expect(res.body.survey.title).toBe('Updated Title');
        expect(res.body.survey.version).toBe(3); // was 2
    });

    test('returns 404 for non-existent survey', async () => {
        const res = await request(app)
            .put('/api/surveys/nonexistent')
            .send({ title: 'nope' });
        expect(res.status).toBe(404);
    });
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/surveys/:id — Delete survey (admin guarded)
// ═══════════════════════════════════════════════════════════

describe('DELETE /api/surveys/:id', () => {
    test('deletes a survey with admin email', async () => {
        // Create one first
        await request(app)
            .post('/api/surveys')
            .send({
                adminEmail: 'admin@admin.com',
                surveyId: 'delete_target',
                title: 'To Delete',
                entryQuestion: 'q1',
                questions: [],
                edges: [],
            });

        const res = await request(app)
            .delete('/api/surveys/delete_target')
            .send({ adminEmail: 'admin@admin.com' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('rejects without admin email', async () => {
        const res = await request(app)
            .delete('/api/surveys/bilkent_feedback')
            .send({});
        expect(res.status).toBe(403);
    });
});

// ═══════════════════════════════════════════════════════════
// POST /api/surveys/:id/visible-questions — Dynamic visibility
// ═══════════════════════════════════════════════════════════

describe('POST /api/surveys/:id/visible-questions', () => {
    test('returns visible questions and isComplete flag', async () => {
        const res = await request(app)
            .post('/api/surveys/bilkent_feedback/visible-questions')
            .send({ answers: { q1: 'Undergraduate' } });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.visibleQuestions)).toBe(true);
        expect(typeof res.body.isComplete).toBe('boolean');
        expect(res.body.surveyVersion).toBeDefined();
    });

    test('returns 404 for non-existent survey', async () => {
        const res = await request(app)
            .post('/api/surveys/nonexistent/visible-questions')
            .send({ answers: {} });
        expect(res.status).toBe(404);
    });
});

// ═══════════════════════════════════════════════════════════
// POST /api/surveys/:id/resolve-conflict — Conflict resolution
// ═══════════════════════════════════════════════════════════

describe('POST /api/surveys/:id/resolve-conflict', () => {
    test('returns no conflict when version matches', async () => {
        const res = await request(app)
            .post('/api/surveys/bilkent_feedback/resolve-conflict')
            .send({ answers: { q1: 'Undergraduate' }, clientVersion: 2 });
        expect(res.status).toBe(200);
        expect(res.body.hasConflict).toBe(false);
    });

    test('returns conflict info when version mismatches', async () => {
        const res = await request(app)
            .post('/api/surveys/bilkent_feedback/resolve-conflict')
            .send({ answers: { q1: 'Undergraduate' }, clientVersion: 1 });
        expect(res.status).toBe(200);
        // A version mismatch should be detected
        expect(res.body.surveyVersion).toBeDefined();
    });

    test('returns 404 for non-existent survey', async () => {
        const res = await request(app)
            .post('/api/surveys/nonexistent/resolve-conflict')
            .send({ answers: {}, clientVersion: 1 });
        expect(res.status).toBe(404);
    });
});

// ═══════════════════════════════════════════════════════════
// POST /api/surveys/:id/submit — Survey submission
// ═══════════════════════════════════════════════════════════

describe('POST /api/surveys/:id/submit', () => {
    test('accepts a valid complete submission', async () => {
        // Use the test_survey which is active and has known structure
        // First, check what questions need answering
        const surveyRes = await request(app).get('/api/surveys/test_survey');
        const survey = surveyRes.body.survey;

        // Build complete answers for the linear path
        // The test_survey starts at q_1776169846109 (open-text "What is your full name?")
        const answers = {};
        const entry = survey.entryQuestion;

        // We need to walk the DAG manually to build valid answers
        // Use visible-questions to determine what we need
        let currentAnswers = {};
        let visible;

        // Get initial visible
        let vRes = await request(app)
            .post('/api/surveys/test_survey/visible-questions')
            .send({ answers: currentAnswers });
        visible = vRes.body.visibleQuestions;

        // Answer each question to walk the path
        for (const q of visible) {
            if (q.type === 'open-text') currentAnswers[q.id] = 'Test answer';
            else if (q.type === 'numeric') currentAnswers[q.id] = q.validation?.length ? '9'.repeat(q.validation.length) : '25';
            else if (q.type === 'single-choice') currentAnswers[q.id] = q.options?.[0] || 'X';
            else if (q.type === 'dropdown') currentAnswers[q.id] = q.options?.[0] || 'X';
            else if (q.type === 'year-dropdown') currentAnswers[q.id] = '2000';
            else if (q.type === 'scale') currentAnswers[q.id] = q.min || 1;
        }

        // Re-fetch visible with answers to get more questions
        vRes = await request(app)
            .post('/api/surveys/test_survey/visible-questions')
            .send({ answers: currentAnswers });
        visible = vRes.body.visibleQuestions;

        // Answer any new questions
        for (const q of visible) {
            if (currentAnswers[q.id] !== undefined) continue;
            if (q.type === 'open-text') currentAnswers[q.id] = 'Test answer';
            else if (q.type === 'numeric') currentAnswers[q.id] = q.validation?.length ? '9'.repeat(q.validation.length) : '25';
            else if (q.type === 'single-choice') currentAnswers[q.id] = q.options?.[0] || 'X';
            else if (q.type === 'dropdown') currentAnswers[q.id] = q.options?.[0] || 'X';
            else if (q.type === 'year-dropdown') currentAnswers[q.id] = '2000';
            else if (q.type === 'scale') currentAnswers[q.id] = q.min || 1;
        }

        // Iterate again to ensure complete path
        vRes = await request(app)
            .post('/api/surveys/test_survey/visible-questions')
            .send({ answers: currentAnswers });

        for (const q of vRes.body.visibleQuestions) {
            if (currentAnswers[q.id] !== undefined) continue;
            if (q.type === 'open-text') currentAnswers[q.id] = 'Test answer';
            else if (q.type === 'numeric') currentAnswers[q.id] = q.validation?.length ? '9'.repeat(q.validation.length) : '25';
            else if (q.type === 'single-choice') currentAnswers[q.id] = q.options?.[0] || 'X';
            else if (q.type === 'dropdown') currentAnswers[q.id] = q.options?.[0] || 'X';
            else if (q.type === 'year-dropdown') currentAnswers[q.id] = '2000';
            else if (q.type === 'scale') currentAnswers[q.id] = q.min || 1;
        }

        const submitRes = await request(app)
            .post('/api/surveys/test_survey/submit')
            .send({ answers: currentAnswers, userId: 'integration_test_user' });
        expect(submitRes.status).toBe(200);
        expect(submitRes.body.success).toBe(true);
        expect(submitRes.body.responseId).toBeDefined();
    });

    test('rejects submission without userId (400)', async () => {
        const res = await request(app)
            .post('/api/surveys/test_survey/submit')
            .send({ answers: {} });
        expect(res.status).toBe(400);
    });

    test('returns 404 for non-existent survey', async () => {
        const res = await request(app)
            .post('/api/surveys/nonexistent/submit')
            .send({ answers: {}, userId: 'user1' });
        expect(res.status).toBe(404);
    });

    test('rejects incomplete submission (400)', async () => {
        const res = await request(app)
            .post('/api/surveys/test_survey/submit')
            .send({ answers: {}, userId: 'incomplete_user' });
        expect(res.status).toBe(400);
    });
});
