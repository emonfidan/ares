import { useState, useEffect } from 'react';
import { createSurvey, updateSurvey } from '../../services/surveyApi';
import AdminEdgeBuilder, { edgeToState, buildValidEdges } from './AdminEdgeBuilder';
import './AdminSurveyBuilder.css';

// ─── Constants ────────────────────────────────────────────

const QUESTION_TYPES = [
    'single-choice',
    'dropdown',
    'numeric',
    'scale',
    'open-text',
    'year-dropdown',
];

const CURRENT_YEAR = new Date().getFullYear();

const BLANK_QUESTION = {
    text: '',
    type: 'single-choice',
    required: false,
    // type-specific fields added on first interaction:
    // options: []             — single-choice, dropdown
    // min, max, step          — scale
    // validation: {}          — numeric
    // placeholder: ''         — open-text
};

// Survey IDs must be lowercase alphanumeric with hyphens or underscores.
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

function toSlug(raw) {
    return raw
        .toLowerCase()
        .replace(/\s+/g, '_')        // spaces → underscores
        .replace(/[^a-z0-9_-]/g, ''); // strip anything else
}

// ─── Question ID helpers ──────────────────────────────────
//
// Each question in state carries:
//   _key      — stable React list key (always present)
//   _origId   — the real ID from the backend (present when editing)
//
// On save, _origId is used as the question id when it exists,
// otherwise a new provisional id is generated from _key.
// Neither _key nor _origId is ever sent to the backend.

function questionToState(q) {
    return { ...q, _key: q.id, _origId: q.id };
}

function blankQuestionState() {
    return { ...BLANK_QUESTION, _key: Date.now() };
}

// ─── Type-specific sub-form ───────────────────────────────

function QuestionTypeConfig({ q, index, updateQuestion }) {
    switch (q.type) {

        case 'single-choice':
        case 'dropdown': {
            const options = q.options || [];
            const setOptions = (opts) => updateQuestion(index, 'options', opts);
            return (
                <div className="asb-type-config">
                    <span className="asb-config-label">Answer options</span>
                    {options.map((opt, oi) => (
                        <div key={oi} className="asb-option-row">
                            <input
                                type="text"
                                data-testid={`asb-option-${index}-${oi}`}
                                value={opt}
                                placeholder={`Option ${oi + 1}`}
                                onChange={e => {
                                    const next = [...options];
                                    next[oi] = e.target.value;
                                    setOptions(next);
                                }}
                            />
                            <button
                                type="button"
                                className="asb-remove-option-btn"
                                data-testid={`asb-remove-option-${index}-${oi}`}
                                onClick={() => setOptions(options.filter((_, i) => i !== oi))}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="asb-add-option-btn"
                        data-testid={`asb-add-option-${index}`}
                        onClick={() => setOptions([...options, ''])}
                    >
                        + Add option
                    </button>
                </div>
            );
        }

        case 'scale': {
            const min  = q.min  ?? 1;
            const max  = q.max  ?? 5;
            const step = q.step ?? 1;
            return (
                <div className="asb-type-config asb-scale-config">
                    <span className="asb-config-label">Scale range</span>
                    <div className="asb-scale-row">
                        <label className="asb-inline-label">
                            Min
                            <input
                                type="number"
                                data-testid={`asb-scale-min-${index}`}
                                value={min}
                                step="any"
                                onChange={e => updateQuestion(index, 'min', Number(e.target.value))}
                            />
                        </label>
                        <label className="asb-inline-label">
                            Max
                            <input
                                type="number"
                                data-testid={`asb-scale-max-${index}`}
                                value={max}
                                step="any"
                                onChange={e => updateQuestion(index, 'max', Number(e.target.value))}
                            />
                        </label>
                        <label className="asb-inline-label">
                            Step
                            <input
                                type="number"
                                data-testid={`asb-scale-step-${index}`}
                                value={step}
                                step="any"
                                min="0.1"
                                onChange={e => updateQuestion(index, 'step', Number(e.target.value))}
                            />
                        </label>
                    </div>
                </div>
            );
        }

        case 'numeric': {
            const val = q.validation || {};
            const setVal = (patch) => updateQuestion(index, 'validation', { ...val, ...patch });
            return (
                <div className="asb-type-config">
                    <span className="asb-config-label">Numeric constraints</span>
                    <label className="asb-checkbox-label">
                        <input
                            type="checkbox"
                            data-testid={`asb-numeric-only-${index}`}
                            checked={val.numericOnly || false}
                            onChange={e => setVal({ numericOnly: e.target.checked })}
                        />
                        Digits only (no letters or symbols)
                    </label>
                    {val.numericOnly && (
                        <label className="asb-inline-label asb-length-label">
                            Fixed length (leave 0 for none)
                            <input
                                type="number"
                                data-testid={`asb-numeric-length-${index}`}
                                value={val.length || 0}
                                min={0}
                                onChange={e => {
                                    const n = parseInt(e.target.value, 10);
                                    setVal({ length: n > 0 ? n : null });
                                }}
                            />
                        </label>
                    )}
                </div>
            );
        }

        case 'open-text':
            return (
                <div className="asb-type-config">
                    <span className="asb-config-label">Placeholder text (optional)</span>
                    <input
                        type="text"
                        data-testid={`asb-placeholder-${index}`}
                        value={q.placeholder || ''}
                        placeholder="e.g. Share your thoughts…"
                        onChange={e => updateQuestion(index, 'placeholder', e.target.value)}
                    />
                    <label className="asb-inline-label" style={{ marginTop: '0.5rem' }}>
                        Max characters (0 = no limit)
                        <input
                            type="number"
                            data-testid={`asb-maxlength-${index}`}
                            value={q.maxLength || 0}
                            min={0}
                            onChange={e => {
                                const n = parseInt(e.target.value, 10);
                                updateQuestion(index, 'maxLength', n > 0 ? n : null);
                            }}
                        />
                    </label>
                </div>
            );

        case 'year-dropdown': {
            const minYear = q.minYear ?? 1900;
            const maxYear = q.maxYear ?? CURRENT_YEAR;
            return (
                <div className="asb-type-config asb-scale-config">
                    <span className="asb-config-label">Year range</span>
                    <div className="asb-scale-row">
                        <label className="asb-inline-label">
                            From
                            <input
                                type="number"
                                data-testid={`asb-year-min-${index}`}
                                value={minYear}
                                min={1900}
                                max={maxYear}
                                onChange={e => updateQuestion(index, 'minYear', parseInt(e.target.value, 10))}
                            />
                        </label>
                        <label className="asb-inline-label">
                            To
                            <input
                                type="number"
                                data-testid={`asb-year-max-${index}`}
                                value={maxYear}
                                min={minYear}
                                max={CURRENT_YEAR}
                                onChange={e => updateQuestion(index, 'maxYear', parseInt(e.target.value, 10))}
                            />
                        </label>
                    </div>
                </div>
            );
        }

        default:
            return null;
    }
}

// ─── AdminSurveyBuilder ───────────────────────────────────
// Smart container. Owns all form state.
//
// Props:
//   user           — logged-in user (email sent to backend for admin check)
//   existingSurvey — full survey object when editing; null/undefined for create
//   onBack()       — navigate back to survey list

const AdminSurveyBuilder = ({ user, existingSurvey, onBack }) => {
    const isEditing = !!existingSurvey;

    const [title, setTitle]             = useState('');
    const [description, setDescription] = useState('');
    const [surveyId, setSurveyId]       = useState('');
    const [questions, setQuestions]     = useState([]);
    const [edges, setEdges]             = useState([]);
    const [saving, setSaving]           = useState(false);
    const [error, setError]             = useState(null);
    const [saved, setSaved]             = useState(false);

    // ── Pre-fill when opening an existing survey ──
    // Runs once when existingSurvey is provided (edit mode).
    // Original question IDs are preserved via _origId.

    useEffect(() => {
        if (!existingSurvey) return;
        setTitle(existingSurvey.title || '');
        setDescription(existingSurvey.description || '');
        setSurveyId(existingSurvey.surveyId || '');
        setQuestions((existingSurvey.questions || []).map(questionToState));
        setEdges((existingSurvey.edges || []).map(edgeToState));
    }, [existingSurvey]);

    const slugError = !isEditing && surveyId && !SLUG_RE.test(surveyId)
        ? 'Only lowercase letters, digits, hyphens, and underscores. Must start with a letter or digit.'
        : null;

    // ── Question helpers ──

    const addQuestion = () => {
        setQuestions(prev => [...prev, blankQuestionState()]);
    };

    const removeQuestion = (index) => {
        setQuestions(prev => prev.filter((_, i) => i !== index));
    };

    const moveQuestion = (index, dir) => {
        const target = index + dir;
        if (target < 0 || target >= questions.length) return;
        setQuestions(prev => {
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const updateQuestion = (index, field, value) => {
        setQuestions(prev =>
            prev.map((q, i) => i === index ? { ...q, [field]: value } : q)
        );
    };

    // ── Serialize questions for the backend ──
    // Preserves _origId as the question id when editing.
    // Strips all internal state keys (_key, _origId) before sending.

    const buildQuestions = () =>
        questions.map(({ _key, _origId, ...q }) => {
            const base = {
                id:       _origId || `q_${_key}`,
                text:     q.text.trim(),
                type:     q.type,
                required: q.required,
                path:     q.path || 'common',
            };
            if (q.options)           base.options = q.options.filter(o => o.trim() !== '');
            if (q.type === 'scale') {
                base.min  = q.min  ?? 1;
                base.max  = q.max  ?? 5;
                base.step = q.step ?? 1;
            }
            if (q.type === 'numeric' && q.validation) base.validation  = q.validation;
            if (q.placeholder)                        base.placeholder = q.placeholder.trim();
            if (q.type === 'open-text' && q.maxLength) base.maxLength  = q.maxLength;
            if (q.type === 'year-dropdown') {
                base.minYear = q.minYear ?? 1900;
                base.maxYear = q.maxYear ?? CURRENT_YEAR;
            }
            return base;
        });

    // ── Save ──

    const handleSave = async (e) => {
        e.preventDefault();
        if (slugError) return;
        setError(null);

        const builtQuestions = buildQuestions();
        const builtEdges     = buildValidEdges(edges, questions);

        // ── Path validation ──────────────────────────────────
        // Every question except the last must have at least one outgoing edge.
        // A question with no outgoing edge breaks the visible-question walk,
        // causing the player to stop there and enabling Submit too early.
        if (builtQuestions.length > 1) {
            const edgeFromIds   = new Set(builtEdges.map(e => e.from));
            const disconnected  = builtQuestions
                .slice(0, -1)
                .filter(q => !edgeFromIds.has(q.id));
            if (disconnected.length > 0) {
                const labels = disconnected
                    .map(q => `"${q.text || q.id}"`)
                    .join(', ');
                setError(
                    `Missing outgoing logic rule from: ${labels}. ` +
                    `Add an unconditional or conditional edge for each non-last question.`
                );
                return;
            }
        }

        // SECURITY NOTE: adminEmail is sent by the client and verified by the
        // backend against users.json.  This is a project-scope simplification —
        // it is NOT forgery-resistant without a signed session token.
        const payload = {
            adminEmail:    user.email,
            title:         title.trim(),
            description:   description.trim(),
            questions:     builtQuestions,
            edges:         builtEdges,
            entryQuestion: builtQuestions.length > 0 ? builtQuestions[0].id : null,
        };

        setSaving(true);
        try {
            if (isEditing) {
                await updateSurvey(existingSurvey.surveyId, payload);
            } else {
                await createSurvey({ ...payload, surveyId: surveyId.trim() });
            }
            setSaved(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Success screen ──

    if (saved) {
        return (
            <div className="asb-container" data-testid="asb-saved">
                <p className="asb-success">
                    Survey "{title}" {isEditing ? 'updated' : 'saved'} successfully.
                </p>
                <button onClick={onBack}>Back to Survey List</button>
            </div>
        );
    }

    // ── Builder form ──

    return (
        <div className="asb-container" data-testid="admin-survey-builder">
            <div className="asb-header">
                <button type="button" className="asb-back-btn" onClick={onBack}>
                    ← Back
                </button>
                <h2>{isEditing ? `Editing: ${existingSurvey.surveyId}` : 'New Survey'}</h2>
            </div>

            <form onSubmit={handleSave} className="asb-form">

                {/* ── Survey metadata ── */}
                <section className="asb-section">
                    <h3>Survey Details</h3>

                    <label className="asb-label">
                        Survey ID
                        {!isEditing && <span className="asb-required"> *</span>}
                        <input
                            type="text"
                            data-testid="asb-survey-id"
                            value={surveyId}
                            placeholder="e.g. spring_2026_feedback"
                            required={!isEditing}
                            readOnly={isEditing}
                            className={isEditing ? 'asb-readonly' : ''}
                            onChange={isEditing ? undefined : e => setSurveyId(toSlug(e.target.value))}
                        />
                        {slugError && (
                            <span className="asb-field-error" data-testid="asb-survey-id-error">
                                {slugError}
                            </span>
                        )}
                        {!isEditing && (
                            <span className="asb-hint">
                                Lowercase letters, digits, hyphens, and underscores only.
                            </span>
                        )}
                    </label>

                    <label className="asb-label">
                        Title <span className="asb-required">*</span>
                        <input
                            type="text"
                            data-testid="asb-title"
                            value={title}
                            placeholder="Survey title"
                            required
                            onChange={e => setTitle(e.target.value)}
                        />
                    </label>

                    <label className="asb-label">
                        Description
                        <textarea
                            data-testid="asb-description"
                            value={description}
                            rows={3}
                            placeholder="Optional description"
                            onChange={e => setDescription(e.target.value)}
                        />
                    </label>
                </section>

                {/* ── Questions ── */}
                <section className="asb-section">
                    <h3>Questions</h3>

                    {questions.length === 0 && (
                        <p className="asb-empty">No questions yet. Add one below.</p>
                    )}

                    {questions.map((q, i) => (
                        <div key={q._key} className="asb-question-card" data-testid={`asb-question-${i}`}>
                            <div className="asb-question-header">
                                <span className="asb-question-num">
                                    Q{i + 1}
                                    {q._origId && (
                                        <span className="asb-orig-id"> ({q._origId})</span>
                                    )}
                                </span>
                                <div className="asb-question-actions">
                                    <button
                                        type="button"
                                        className="asb-move-btn"
                                        data-testid={`asb-move-up-${i}`}
                                        disabled={i === 0}
                                        onClick={() => moveQuestion(i, -1)}
                                        title="Move up"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className="asb-move-btn"
                                        data-testid={`asb-move-down-${i}`}
                                        disabled={i === questions.length - 1}
                                        onClick={() => moveQuestion(i, 1)}
                                        title="Move down"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        className="asb-remove-btn"
                                        data-testid={`asb-remove-question-${i}`}
                                        onClick={() => removeQuestion(i)}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>

                            <label className="asb-label">
                                Question text <span className="asb-required">*</span>
                                <input
                                    type="text"
                                    data-testid={`asb-question-text-${i}`}
                                    value={q.text}
                                    placeholder="Enter question"
                                    required
                                    onChange={e => updateQuestion(i, 'text', e.target.value)}
                                />
                            </label>

                            <label className="asb-label">
                                Type
                                <select
                                    data-testid={`asb-question-type-${i}`}
                                    value={q.type}
                                    onChange={e => updateQuestion(i, 'type', e.target.value)}
                                >
                                    {QUESTION_TYPES.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </label>

                            <QuestionTypeConfig q={q} index={i} updateQuestion={updateQuestion} />

                            <label className="asb-checkbox-label">
                                <input
                                    type="checkbox"
                                    data-testid={`asb-question-required-${i}`}
                                    checked={q.required}
                                    onChange={e => updateQuestion(i, 'required', e.target.checked)}
                                />
                                Required
                            </label>
                        </div>
                    ))}

                    <button
                        type="button"
                        className="asb-add-btn"
                        data-testid="asb-add-question"
                        onClick={addQuestion}
                    >
                        + Add Question
                    </button>
                </section>

                {/* ── Logic rules ── */}
                <AdminEdgeBuilder
                    questions={questions}
                    edges={edges}
                    onChange={setEdges}
                />

                {/* ── Error / Submit ── */}
                {error && (
                    <p className="asb-error" data-testid="asb-error">{error}</p>
                )}

                <button
                    type="submit"
                    className="asb-save-btn"
                    data-testid="asb-save"
                    disabled={saving || !!slugError}
                >
                    {saving
                        ? (isEditing ? 'Updating…' : 'Saving…')
                        : (isEditing ? 'Update Survey' : 'Save Survey')}
                </button>
            </form>
        </div>
    );
};

export default AdminSurveyBuilder;
