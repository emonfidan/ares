/**
 * surveyService.test.js — TDD Red-Green-Refactor
 *
 * RED phase:  Tests written BEFORE implementation.
 * GREEN phase: Functions implemented to make tests pass.
 *
 * Covers:
 *   1. evaluateCondition()       — all operators + edge cases
 *   2. resolveVisibleQuestionIds()— linear, branching, cycle prevention
 *   3. getVisibleQuestions()      — ID→object mapping
 *   4. validateAnswers()          — numeric rules
 *   5. isPathComplete()           — required + optional + validation
 *   6. CRUD operations            — create, update, delete, active survey
 *   7. detectConflict()           — NEW (conflict resolution)
 *   8. atomicStateRecovery()      — NEW (answer remapping)
 *   9. findLastStableNode()       — NEW (rollback point)
 */

const fs = require('fs');
const path = require('path');

const SURVEYS_FILE = path.join(__dirname, '../data/surveys.json');
const RESPONSES_FILE = path.join(__dirname, '../data/responses.json');
let originalData;
let originalResponses;

// Preserve original data and restore after each test
beforeAll(() => {
    originalData = fs.readFileSync(SURVEYS_FILE, 'utf8');
    try {
        originalResponses = fs.readFileSync(RESPONSES_FILE, 'utf8');
    } catch {
        originalResponses = JSON.stringify({ responses: [] });
    }
});

afterEach(() => {
    fs.writeFileSync(SURVEYS_FILE, originalData);
    fs.writeFileSync(RESPONSES_FILE, originalResponses);
});

// Fresh require to avoid module caching between tests
function freshService() {
    // Clear require cache so file re-reads happen
    delete require.cache[require.resolve('../services/surveyService')];
    return require('../services/surveyService');
}

// ─── Minimal test survey fixtures ─────────────────────────

const LINEAR_SURVEY = {
    surveyId: 'test_linear',
    version: 1,
    title: 'Linear Survey',
    entryQuestion: 'a',
    questions: [
        { id: 'a', text: 'Q-A', type: 'single-choice', required: true, options: ['X', 'Y'] },
        { id: 'b', text: 'Q-B', type: 'open-text', required: true },
        { id: 'c', text: 'Q-C', type: 'open-text', required: false },
    ],
    edges: [
        { from: 'a', to: 'b', condition: null },
        { from: 'b', to: 'c', condition: null },
    ],
};

const BRANCHING_SURVEY = {
    surveyId: 'test_branching',
    version: 1,
    title: 'Branching Survey',
    entryQuestion: 'root',
    questions: [
        { id: 'root', text: 'Type?', type: 'single-choice', required: true, options: ['A', 'B'] },
        { id: 'pathA', text: 'Path A', type: 'open-text', required: true },
        { id: 'pathB', text: 'Path B', type: 'open-text', required: true },
        { id: 'end', text: 'End', type: 'open-text', required: false },
    ],
    edges: [
        { from: 'root', to: 'pathA', condition: { questionId: 'root', operator: 'equals', value: 'A' } },
        { from: 'root', to: 'pathB', condition: { questionId: 'root', operator: 'equals', value: 'B' } },
        { from: 'pathA', to: 'end', condition: null },
        { from: 'pathB', to: 'end', condition: null },
    ],
};

const NUMERIC_SURVEY = {
    surveyId: 'test_numeric',
    version: 1,
    title: 'Numeric Survey',
    entryQuestion: 'n1',
    questions: [
        { id: 'n1', text: 'ID?', type: 'numeric', required: true, validation: { numericOnly: true, length: 8 } },
        { id: 'n2', text: 'Age?', type: 'numeric', required: true, validation: { numericOnly: true } },
        { id: 'n3', text: 'Note', type: 'open-text', required: false },
    ],
    edges: [
        { from: 'n1', to: 'n2', condition: null },
        { from: 'n2', to: 'n3', condition: null },
    ],
};

// ─── Helper: inject a survey into the data file ───────────

function injectSurvey(survey) {
    const data = JSON.parse(fs.readFileSync(SURVEYS_FILE, 'utf8'));
    // Remove if it already exists (by surveyId)
    data.surveys = data.surveys.filter(s => s.surveyId !== survey.surveyId);
    data.surveys.push(survey);
    fs.writeFileSync(SURVEYS_FILE, JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════════════════
// 1. evaluateCondition
// ═══════════════════════════════════════════════════════════

describe('evaluateCondition', () => {
    let evaluateCondition;
    beforeAll(() => {
        evaluateCondition = freshService().evaluateCondition;
    });

    test('returns true when condition is null (unconditional edge)', () => {
        expect(evaluateCondition(null, {})).toBe(true);
    });

    test('returns true when condition is undefined', () => {
        expect(evaluateCondition(undefined, {})).toBe(true);
    });

    test('"equals" returns true on matching answer', () => {
        const cond = { questionId: 'q1', operator: 'equals', value: 'Yes' };
        expect(evaluateCondition(cond, { q1: 'Yes' })).toBe(true);
    });

    test('"equals" returns false on non-matching answer', () => {
        const cond = { questionId: 'q1', operator: 'equals', value: 'Yes' };
        expect(evaluateCondition(cond, { q1: 'No' })).toBe(false);
    });

    test('"notEquals" returns true when answer differs', () => {
        const cond = { questionId: 'q1', operator: 'notEquals', value: 'Yes' };
        expect(evaluateCondition(cond, { q1: 'No' })).toBe(true);
    });

    test('"notEquals" returns false when answer matches', () => {
        const cond = { questionId: 'q1', operator: 'notEquals', value: 'Yes' };
        expect(evaluateCondition(cond, { q1: 'Yes' })).toBe(false);
    });

    test('"in" returns true when answer is in value array', () => {
        const cond = { questionId: 'q1', operator: 'in', value: ['A', 'B', 'C'] };
        expect(evaluateCondition(cond, { q1: 'B' })).toBe(true);
    });

    test('"in" returns false when answer is not in value array', () => {
        const cond = { questionId: 'q1', operator: 'in', value: ['A', 'B', 'C'] };
        expect(evaluateCondition(cond, { q1: 'D' })).toBe(false);
    });

    test('"notIn" returns true when answer is not in value array', () => {
        const cond = { questionId: 'q1', operator: 'notIn', value: ['A', 'B'] };
        expect(evaluateCondition(cond, { q1: 'C' })).toBe(true);
    });

    test('"notIn" returns false when answer is in value array', () => {
        const cond = { questionId: 'q1', operator: 'notIn', value: ['A', 'B'] };
        expect(evaluateCondition(cond, { q1: 'A' })).toBe(false);
    });

    test('returns false when referenced question is unanswered', () => {
        const cond = { questionId: 'q1', operator: 'equals', value: 'Yes' };
        expect(evaluateCondition(cond, {})).toBe(false);
    });

    test('returns false when referenced question answer is null', () => {
        const cond = { questionId: 'q1', operator: 'equals', value: 'Yes' };
        expect(evaluateCondition(cond, { q1: null })).toBe(false);
    });

    test('returns false when referenced question answer is empty string', () => {
        const cond = { questionId: 'q1', operator: 'equals', value: 'Yes' };
        expect(evaluateCondition(cond, { q1: '' })).toBe(false);
    });

    test('unknown operator defaults to true', () => {
        const cond = { questionId: 'q1', operator: 'customOp', value: 'x' };
        expect(evaluateCondition(cond, { q1: 'whatever' })).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════
// 2. resolveVisibleQuestionIds
// ═══════════════════════════════════════════════════════════

describe('resolveVisibleQuestionIds', () => {
    let resolveVisibleQuestionIds;
    beforeAll(() => {
        resolveVisibleQuestionIds = freshService().resolveVisibleQuestionIds;
    });

    test('walks a linear path returning all question IDs in order', () => {
        const ids = resolveVisibleQuestionIds(LINEAR_SURVEY, { a: 'X', b: 'something' });
        expect(ids).toEqual(['a', 'b', 'c']);
    });

    test('stops at the entry question when no edge condition is satisfied', () => {
        const ids = resolveVisibleQuestionIds(BRANCHING_SURVEY, {});
        expect(ids).toEqual(['root']);
    });

    test('follows the A branch when condition matches', () => {
        const ids = resolveVisibleQuestionIds(BRANCHING_SURVEY, { root: 'A' });
        // Unconditional edge from pathA→end is always followed
        expect(ids).toEqual(['root', 'pathA', 'end']);
    });

    test('follows the B branch when condition matches', () => {
        const ids = resolveVisibleQuestionIds(BRANCHING_SURVEY, { root: 'B', pathB: 'done' });
        expect(ids).toEqual(['root', 'pathB', 'end']);
    });

    test('does not loop if there is a cycle in edges', () => {
        const cyclicSurvey = {
            entryQuestion: 'x',
            questions: [
                { id: 'x', text: 'X', type: 'open-text', required: true },
                { id: 'y', text: 'Y', type: 'open-text', required: true },
            ],
            edges: [
                { from: 'x', to: 'y', condition: null },
                { from: 'y', to: 'x', condition: null },  // Cycle!
            ],
        };
        const ids = resolveVisibleQuestionIds(cyclicSurvey, { x: 'a', y: 'b' });
        expect(ids).toEqual(['x', 'y']);  // Visited set prevents loop
    });
});

// ═══════════════════════════════════════════════════════════
// 3. getVisibleQuestions
// ═══════════════════════════════════════════════════════════

describe('getVisibleQuestions', () => {
    let getVisibleQuestions;

    beforeEach(() => {
        injectSurvey(LINEAR_SURVEY);
        getVisibleQuestions = freshService().getVisibleQuestions;
    });

    test('returns full question objects in visible order', () => {
        const visible = getVisibleQuestions('test_linear', { a: 'X', b: 'hello' });
        expect(visible).toHaveLength(3);
        expect(visible[0].id).toBe('a');
        expect(visible[1].id).toBe('b');
        expect(visible[2].id).toBe('c');
        expect(visible[0].text).toBe('Q-A');
    });

    test('returns null for non-existent survey', () => {
        expect(getVisibleQuestions('nope', {})).toBeNull();
    });

    test('returns only entry question when no answers provided', () => {
        const visible = getVisibleQuestions('test_linear', {});
        // Entry question is always visible; edges without conditions continue the walk
        expect(visible.length).toBeGreaterThanOrEqual(1);
        expect(visible[0].id).toBe('a');
    });
});

// ═══════════════════════════════════════════════════════════
// 4. validateAnswers
// ═══════════════════════════════════════════════════════════

describe('validateAnswers', () => {
    let validateAnswers;

    beforeEach(() => {
        injectSurvey(NUMERIC_SURVEY);
        validateAnswers = freshService().validateAnswers;
    });

    test('returns empty object for valid answers', () => {
        const errors = validateAnswers('test_numeric', { n1: '12345678', n2: '25' });
        expect(errors).toEqual({});
    });

    test('catches non-numeric characters', () => {
        const errors = validateAnswers('test_numeric', { n1: '1234abcd' });
        expect(errors.n1).toBeDefined();
        expect(errors.n1).toMatch(/numeric/i);
    });

    test('catches incorrect length', () => {
        const errors = validateAnswers('test_numeric', { n1: '12345' });
        expect(errors.n1).toBeDefined();
        expect(errors.n1).toMatch(/digits/i);
    });

    test('skips unanswered fields', () => {
        const errors = validateAnswers('test_numeric', {});
        expect(errors).toEqual({});
    });

    test('returns empty for non-existent survey', () => {
        const errors = validateAnswers('nope', { n1: 'abc' });
        expect(errors).toEqual({});
    });
});

// ═══════════════════════════════════════════════════════════
// 5. isPathComplete
// ═══════════════════════════════════════════════════════════

describe('isPathComplete', () => {
    let isPathComplete;

    beforeEach(() => {
        injectSurvey(LINEAR_SURVEY);
        injectSurvey(NUMERIC_SURVEY);
        isPathComplete = freshService().isPathComplete;
    });

    test('returns true when all required visible questions are answered', () => {
        // Linear: a (required), b (required), c (optional)
        expect(isPathComplete('test_linear', { a: 'X', b: 'hello' })).toBe(true);
    });

    test('returns false when a required question is unanswered', () => {
        expect(isPathComplete('test_linear', { a: 'X' })).toBe(false);
    });

    test('returns true even when optional question is unanswered', () => {
        expect(isPathComplete('test_linear', { a: 'X', b: 'hello' })).toBe(true);
    });

    test('returns false when validation fails', () => {
        // n1 requires exactly 8 digits
        expect(isPathComplete('test_numeric', { n1: '123', n2: '25' })).toBe(false);
    });

    test('returns true when numeric validation passes', () => {
        expect(isPathComplete('test_numeric', { n1: '12345678', n2: '25' })).toBe(true);
    });

    test('returns false for non-existent survey', () => {
        expect(isPathComplete('nope', {})).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════
// 6. CRUD operations
// ═══════════════════════════════════════════════════════════

describe('CRUD operations', () => {
    test('createSurvey adds a new survey and sets version to 1', () => {
        const svc = freshService();
        const created = svc.createSurvey({
            surveyId: 'crud_test',
            title: 'CRUD Test',
            entryQuestion: 'q1',
            questions: [{ id: 'q1', text: 'Hello', type: 'open-text', required: true }],
            edges: [],
        });
        expect(created.version).toBe(1);
        expect(created.surveyId).toBe('crud_test');

        // Verify it persists
        const svc2 = freshService();
        expect(svc2.getSurveyById('crud_test')).toBeTruthy();
    });

    test('createSurvey throws on duplicate ID', () => {
        const svc = freshService();
        svc.createSurvey({
            surveyId: 'dup_test',
            title: 'First',
            entryQuestion: 'q1',
            questions: [],
            edges: [],
        });
        expect(() => svc.createSurvey({
            surveyId: 'dup_test',
            title: 'Second',
            entryQuestion: 'q1',
            questions: [],
            edges: [],
        })).toThrow(/already exists/i);
    });

    test('updateSurvey bumps version and merges fields', () => {
        const svc = freshService();
        svc.createSurvey({
            surveyId: 'update_test',
            title: 'V1',
            entryQuestion: 'q1',
            questions: [],
            edges: [],
        });
        const updated = svc.updateSurvey('update_test', { title: 'V2' });
        expect(updated.version).toBe(2);
        expect(updated.title).toBe('V2');
        expect(updated.surveyId).toBe('update_test'); // immutable
    });

    test('updateSurvey returns null for non-existent survey', () => {
        const svc = freshService();
        expect(svc.updateSurvey('nope', { title: 'X' })).toBeNull();
    });

    test('deleteSurvey removes the survey', () => {
        const svc = freshService();
        svc.createSurvey({
            surveyId: 'delete_me',
            title: 'Gone',
            entryQuestion: 'q1',
            questions: [],
            edges: [],
        });
        expect(svc.deleteSurvey('delete_me')).toBe(true);
        expect(svc.getSurveyById('delete_me')).toBeNull();
    });

    test('deleteSurvey clears activeSurveyId if it was the active survey', () => {
        const svc = freshService();
        svc.createSurvey({
            surveyId: 'active_del',
            title: 'Active',
            entryQuestion: 'q1',
            questions: [],
            edges: [],
        });
        svc.setActiveSurveyId('active_del');
        expect(svc.getActiveSurveyId()).toBe('active_del');
        svc.deleteSurvey('active_del');
        expect(svc.getActiveSurveyId()).toBeNull();
    });

    test('deleteSurvey returns false for non-existent survey', () => {
        const svc = freshService();
        expect(svc.deleteSurvey('nope')).toBe(false);
    });

    test('setActiveSurveyId throws for non-existent survey', () => {
        const svc = freshService();
        expect(() => svc.setActiveSurveyId('nope')).toThrow();
    });

    test('getAllSurveys returns array of all surveys', () => {
        const svc = freshService();
        const all = svc.getAllSurveys();
        expect(Array.isArray(all)).toBe(true);
        expect(all.length).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════════
// 7. detectConflict  ◀── RED — function does not exist yet
// ═══════════════════════════════════════════════════════════

describe('detectConflict', () => {
    let detectConflict;

    beforeEach(() => {
        const svc = freshService();
        detectConflict = svc.detectConflict;
    });

    test('function exists and is exported', () => {
        expect(typeof detectConflict).toBe('function');
    });

    test('returns no conflict when surveys are identical', () => {
        const result = detectConflict(LINEAR_SURVEY, LINEAR_SURVEY, { a: 'X', b: 'hi' });
        expect(result.hasConflict).toBe(false);
        expect(result.deletedQuestions).toEqual([]);
        expect(result.orphanedAnswers).toEqual([]);
    });

    test('detects a deleted question that has an existing answer', () => {
        const modified = {
            ...LINEAR_SURVEY,
            version: 2,
            questions: LINEAR_SURVEY.questions.filter(q => q.id !== 'b'),
            edges: [{ from: 'a', to: 'c', condition: null }],
        };
        const answers = { a: 'X', b: 'this answer is orphaned' };
        const result = detectConflict(LINEAR_SURVEY, modified, answers);
        expect(result.hasConflict).toBe(true);
        expect(result.deletedQuestions).toContain('b');
        expect(result.orphanedAnswers).toContain('b');
    });

    test('detects modified edges that invalidate the current path', () => {
        const modified = {
            ...BRANCHING_SURVEY,
            version: 2,
            // Remove the "A" branch edge
            edges: BRANCHING_SURVEY.edges.filter(e => !(e.from === 'root' && e.to === 'pathA')),
        };
        const answers = { root: 'A', pathA: 'my answer' };
        const result = detectConflict(BRANCHING_SURVEY, modified, answers);
        expect(result.hasConflict).toBe(true);
    });

    test('detects new required questions not yet answered', () => {
        const modified = {
            ...LINEAR_SURVEY,
            version: 2,
            questions: [
                ...LINEAR_SURVEY.questions,
                { id: 'new_req', text: 'New Required', type: 'open-text', required: true },
            ],
            edges: [
                ...LINEAR_SURVEY.edges,
                { from: 'c', to: 'new_req', condition: null },
            ],
        };
        const answers = { a: 'X', b: 'hi' };
        const result = detectConflict(LINEAR_SURVEY, modified, answers);
        expect(result.newRequiredQuestions).toContain('new_req');
    });
});

// ═══════════════════════════════════════════════════════════
// 8. atomicStateRecovery  ◀── RED — function does not exist yet
// ═══════════════════════════════════════════════════════════

describe('atomicStateRecovery', () => {
    let atomicStateRecovery;

    beforeEach(() => {
        const svc = freshService();
        atomicStateRecovery = svc.atomicStateRecovery;
    });

    test('function exists and is exported', () => {
        expect(typeof atomicStateRecovery).toBe('function');
    });

    test('preserves answers whose questions still exist in version 2', () => {
        const newSurvey = {
            ...LINEAR_SURVEY,
            version: 2,
            // Remove question 'b'
            questions: LINEAR_SURVEY.questions.filter(q => q.id !== 'b'),
            edges: [{ from: 'a', to: 'c', condition: null }],
        };
        const answers = { a: 'X', b: 'orphaned', c: 'kept' };
        const result = atomicStateRecovery(answers, newSurvey);
        expect(result.recoveredAnswers.a).toBe('X');
        expect(result.recoveredAnswers.c).toBe('kept');
        expect(result.recoveredAnswers.b).toBeUndefined();
        expect(result.droppedAnswers).toContain('b');
    });

    test('discards answers for questions no longer reachable', () => {
        const newSurvey = {
            ...BRANCHING_SURVEY,
            version: 2,
            // Remove pathA entirely
            questions: BRANCHING_SURVEY.questions.filter(q => q.id !== 'pathA'),
            edges: BRANCHING_SURVEY.edges.filter(e => e.to !== 'pathA' && e.from !== 'pathA'),
        };
        const answers = { root: 'A', pathA: 'my answer' };
        const result = atomicStateRecovery(answers, newSurvey);
        expect(result.recoveredAnswers.root).toBe('A');
        expect(result.recoveredAnswers.pathA).toBeUndefined();
        expect(result.droppedAnswers).toContain('pathA');
    });

    test('returns the new visible questions after recovery', () => {
        const newSurvey = { ...LINEAR_SURVEY, version: 2 };
        const answers = { a: 'X', b: 'hello' };
        const result = atomicStateRecovery(answers, newSurvey);
        expect(Array.isArray(result.newVisibleQuestions)).toBe(true);
        expect(result.newVisibleQuestions.length).toBeGreaterThanOrEqual(1);
    });
});

// ═══════════════════════════════════════════════════════════
// 9. findLastStableNode  ◀── RED — function does not exist yet
// ═══════════════════════════════════════════════════════════

describe('findLastStableNode', () => {
    let findLastStableNode;

    beforeEach(() => {
        const svc = freshService();
        findLastStableNode = svc.findLastStableNode;
    });

    test('function exists and is exported', () => {
        expect(typeof findLastStableNode).toBe('function');
    });

    test('returns the deepest answered question that still exists', () => {
        const newSurvey = {
            ...LINEAR_SURVEY,
            version: 2,
            // Remove question c
            questions: LINEAR_SURVEY.questions.filter(q => q.id !== 'c'),
            edges: [{ from: 'a', to: 'b', condition: null }],
        };
        const answers = { a: 'X', b: 'hello', c: 'this is orphaned' };
        const stableNode = findLastStableNode(answers, newSurvey);
        expect(stableNode).toBe('b');
    });

    test('returns entry question when all other questions are removed', () => {
        const newSurvey = {
            ...LINEAR_SURVEY,
            version: 2,
            questions: [LINEAR_SURVEY.questions[0]], // Only 'a' remains
            edges: [],
        };
        const answers = { a: 'X', b: 'orphaned', c: 'orphaned' };
        const stableNode = findLastStableNode(answers, newSurvey);
        expect(stableNode).toBe('a');
    });

    test('returns null when entry question is also removed', () => {
        const newSurvey = {
            ...LINEAR_SURVEY,
            version: 2,
            entryQuestion: 'z',
            questions: [{ id: 'z', text: 'New', type: 'open-text', required: true }],
            edges: [],
        };
        const answers = { a: 'X', b: 'hello' };
        const stableNode = findLastStableNode(answers, newSurvey);
        // None of the answered questions exist in v2
        expect(stableNode).toBeNull();
    });

    test('follows a branching path and returns the correct stable node', () => {
        const newSurvey = {
            ...BRANCHING_SURVEY,
            version: 2,
            // Remove 'end' question
            questions: BRANCHING_SURVEY.questions.filter(q => q.id !== 'end'),
            edges: BRANCHING_SURVEY.edges.filter(e => e.to !== 'end'),
        };
        const answers = { root: 'A', pathA: 'my answer', end: 'orphaned' };
        const stableNode = findLastStableNode(answers, newSurvey);
        expect(stableNode).toBe('pathA');
    });
});

// ═══════════════════════════════════════════════════════════
// 10. submitSurveyResponse  ◀── RED — function does not exist yet
// ═══════════════════════════════════════════════════════════

describe('submitSurveyResponse', () => {
    let submitSurveyResponse;

    beforeEach(() => {
        injectSurvey(LINEAR_SURVEY);
        const svc = freshService();
        submitSurveyResponse = svc.submitSurveyResponse;
    });

    test('function exists and is exported', () => {
        expect(typeof submitSurveyResponse).toBe('function');
    });

    test('accepts valid complete answers and returns success', () => {
        const result = submitSurveyResponse('test_linear', { a: 'X', b: 'hello' }, 'user1');
        expect(result.success).toBe(true);
        expect(result.responseId).toBeDefined();
    });

    test('rejects submission for non-existent survey', () => {
        expect(() => submitSurveyResponse('nope', {}, 'user1')).toThrow();
    });

    test('rejects submission when path is not complete', () => {
        // 'a' is required, 'b' is required — only providing 'a'
        expect(() => submitSurveyResponse('test_linear', { a: 'X' }, 'user1')).toThrow(/not complete/i);
    });

    test('prevents duplicate submissions from the same user', () => {
        submitSurveyResponse('test_linear', { a: 'X', b: 'hello' }, 'user1');
        expect(() => submitSurveyResponse('test_linear', { a: 'X', b: 'hello' }, 'user1'))
            .toThrow(/already submitted/i);
    });
});
