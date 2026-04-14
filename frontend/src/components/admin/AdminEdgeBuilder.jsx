import './AdminSurveyBuilder.css';

// ─── Operators ────────────────────────────────────────────

const OPERATORS = [
    { value: 'equals',    label: 'equals' },
    { value: 'notEquals', label: 'does not equal' },
    { value: 'in',        label: 'is one of' },
    { value: 'notIn',     label: 'is not one of' },
];

// ─── Key helpers ──────────────────────────────────────────

let _edgeKeyCounter = 0;
function nextEdgeKey() { return `e_${++_edgeKeyCounter}`; }

// ─── Question ID helper ───────────────────────────────────
// Mirrors the same logic used in AdminSurveyBuilder to derive
// a question's effective ID from its state object.

export function getQuestionId(q) {
    return q._origId || `q_${q._key}`;
}

// ─── State conversion helpers ─────────────────────────────

// Convert a backend edge object → editor state
export function edgeToState(edge) {
    const cond = edge.condition;
    return {
        _key:              nextEdgeKey(),
        from:              edge.from || '',
        to:                edge.to   || '',
        conditionType:     cond ? 'if' : 'always',
        conditionQuestion: cond ? cond.questionId : '',
        operator:          cond ? cond.operator   : 'equals',
        // in/notIn values are arrays on the backend; join for editing
        value: cond
            ? (Array.isArray(cond.value) ? cond.value.join(', ') : String(cond.value))
            : '',
    };
}

export function blankEdgeState() {
    return {
        _key:              nextEdgeKey(),
        from:              '',
        to:                '',
        conditionType:     'always',
        conditionQuestion: '',
        operator:          'equals',
        value:             '',
    };
}

// ─── Serializer ───────────────────────────────────────────
//
// Converts edge state array → backend edge format.
// Silently excludes:
//   - incomplete edges (missing from or to)
//   - self-loops (from === to)
//   - conditional edges with empty conditionQuestion or value
//   - duplicate edges (same logical content)
//
// This is the only function called from AdminSurveyBuilder on save.

export function buildValidEdges(edgeStates, questions) {
    const validIds = new Set(questions.map(getQuestionId));
    const seen     = new Set();
    const result   = [];

    for (const e of edgeStates) {
        // Completeness
        if (!e.from || !e.to)                              continue;
        if (e.from === e.to)                               continue;
        if (!validIds.has(e.from) || !validIds.has(e.to)) continue;

        if (e.conditionType === 'if') {
            if (!e.conditionQuestion || !e.value.trim())   continue;
            if (!validIds.has(e.conditionQuestion))        continue;
        }

        // Dedup by logical content
        const dedupKey = JSON.stringify([
            e.from, e.to, e.conditionType,
            e.conditionQuestion, e.operator, e.value,
        ]);
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        const isMulti = e.operator === 'in' || e.operator === 'notIn';
        result.push({
            from: e.from,
            to:   e.to,
            condition: e.conditionType === 'always'
                ? null
                : {
                    questionId: e.conditionQuestion,
                    operator:   e.operator,
                    value:      isMulti
                        ? e.value.split(',').map(s => s.trim()).filter(Boolean)
                        : e.value.trim(),
                },
        });
    }

    return result;
}

// ─── Per-edge validation (UI only, does not block save) ───

function getEdgeError(edge, allEdges) {
    if (!edge.from || !edge.to)
        return 'Select both a From and a To question.';
    if (edge.from === edge.to)
        return 'From and To cannot be the same question.';
    if (edge.conditionType === 'if') {
        if (!edge.conditionQuestion)
            return 'Select the question to check.';
        if (!edge.value.trim())
            return 'Condition value cannot be empty.';
    }
    const isDupe = allEdges.some(e =>
        e._key              !== edge._key &&
        e.from              === edge.from &&
        e.to                === edge.to   &&
        e.conditionType     === edge.conditionType &&
        e.conditionQuestion === edge.conditionQuestion &&
        e.operator          === edge.operator &&
        e.value             === edge.value
    );
    if (isDupe) return 'This rule already exists.';
    return null;
}

// ─── Value input ──────────────────────────────────────────
//
// When conditionQuestion is single-choice or dropdown AND
// operator is equals/notEquals, renders a select of that
// question's defined options.
// All other cases use a plain text input.

function ValueInput({ edge, condQObj, onValueChange }) {
    const isMultiOp  = edge.operator === 'in' || edge.operator === 'notIn';
    const isChoiceQ  = condQObj &&
        (condQObj.type === 'single-choice' || condQObj.type === 'dropdown');
    const hasOptions = isChoiceQ && condQObj.options && condQObj.options.length > 0;

    if (hasOptions && !isMultiOp) {
        return (
            <select
                className="asb-edge-select"
                data-testid={`aeb-value-select-${edge._key}`}
                value={edge.value}
                onChange={e => onValueChange(e.target.value)}
            >
                <option value="">Select value…</option>
                {condQObj.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        );
    }

    return (
        <input
            type="text"
            className="asb-edge-input"
            data-testid={`aeb-value-input-${edge._key}`}
            value={edge.value}
            placeholder={isMultiOp ? 'e.g. Yes, No' : 'Value…'}
            onChange={e => onValueChange(e.target.value)}
        />
    );
}

// ─── AdminEdgeBuilder ─────────────────────────────────────
// Controlled component — all state lives in the parent.
//
// Props:
//   questions          — question state array from AdminSurveyBuilder
//   edges              — edge state array
//   onChange(newEdges) — called on every mutation

const AdminEdgeBuilder = ({ questions, edges, onChange }) => {

    const questionIds = questions.map(getQuestionId);

    // Look up question display label for use in dropdowns
    function qLabel(qid) {
        const q = questions.find(q2 => getQuestionId(q2) === qid);
        if (!q) return qid;
        const text = q.text ? q.text.slice(0, 42) : '(no text)';
        return `${qid} — ${text}`;
    }

    const addEdge = () => onChange([...edges, blankEdgeState()]);

    const removeEdge = (key) =>
        onChange(edges.filter(e => e._key !== key));

    const moveEdge = (key, dir) => {
        const idx = edges.findIndex(e => e._key === key);
        const target = idx + dir;
        if (target < 0 || target >= edges.length) return;
        const next = [...edges];
        [next[idx], next[target]] = [next[target], next[idx]];
        onChange(next);
    };

    const updateEdge = (key, field, value) =>
        onChange(edges.map(e => e._key === key ? { ...e, [field]: value } : e));

    return (
        <section className="asb-section" data-testid="admin-edge-builder">
            <h3>Logic Rules</h3>
            <p className="asb-edge-section-hint">
                Rules define the survey flow — which question comes next.
                An unconditional rule is always followed.
                A conditional rule is only followed when the specified answer matches.
                Invalid or incomplete rules are excluded on save.
            </p>

            {edges.length === 0 && (
                <p className="asb-empty">No rules yet. Add one below.</p>
            )}

            {edges.map((edge, i) => {
                const error   = getEdgeError(edge, edges);
                const condQObj = questions.find(
                    q => getQuestionId(q) === edge.conditionQuestion
                );

                return (
                    <div
                        key={edge._key}
                        className={`asb-edge-row${error ? ' asb-edge-row--invalid' : ''}`}
                        data-testid={`aeb-edge-${i}`}
                    >
                        {/* ── Reorder / Remove ── */}
                        <div className="asb-question-actions" style={{ marginBottom: '0.5rem' }}>
                            <button
                                type="button"
                                className="asb-move-btn"
                                data-testid={`aeb-move-up-${i}`}
                                disabled={i === 0}
                                onClick={() => moveEdge(edge._key, -1)}
                                title="Move up"
                            >
                                ↑
                            </button>
                            <button
                                type="button"
                                className="asb-move-btn"
                                data-testid={`aeb-move-down-${i}`}
                                disabled={i === edges.length - 1}
                                onClick={() => moveEdge(edge._key, 1)}
                                title="Move down"
                            >
                                ↓
                            </button>
                            <button
                                type="button"
                                className="asb-remove-btn"
                                data-testid={`aeb-remove-${i}`}
                                onClick={() => removeEdge(edge._key)}
                            >
                                Remove
                            </button>
                        </div>

                        {/* ── From / To ── */}
                        <div className="asb-edge-main">
                            <label className="asb-edge-label">
                                From
                                <select
                                    className="asb-edge-select"
                                    data-testid={`aeb-from-${i}`}
                                    value={edge.from}
                                    onChange={e => updateEdge(edge._key, 'from', e.target.value)}
                                >
                                    <option value="">Select…</option>
                                    {questionIds.map(qid => (
                                        <option key={qid} value={qid}>{qLabel(qid)}</option>
                                    ))}
                                </select>
                            </label>

                            <span className="asb-edge-arrow">→</span>

                            <label className="asb-edge-label">
                                To
                                <select
                                    className="asb-edge-select"
                                    data-testid={`aeb-to-${i}`}
                                    value={edge.to}
                                    onChange={e => updateEdge(edge._key, 'to', e.target.value)}
                                >
                                    <option value="">Select…</option>
                                    {/* Exclude `from` to prevent self-loops */}
                                    {questionIds
                                        .filter(qid => qid !== edge.from)
                                        .map(qid => (
                                            <option key={qid} value={qid}>{qLabel(qid)}</option>
                                        ))
                                    }
                                </select>
                            </label>

                        </div>

                        {/* ── Condition type toggle ── */}
                        <div className="asb-edge-condition-toggle">
                            <label className="asb-radio-label">
                                <input
                                    type="radio"
                                    name={`condType_${edge._key}`}
                                    value="always"
                                    checked={edge.conditionType === 'always'}
                                    onChange={() => updateEdge(edge._key, 'conditionType', 'always')}
                                />
                                Always follow
                            </label>
                            <label className="asb-radio-label">
                                <input
                                    type="radio"
                                    name={`condType_${edge._key}`}
                                    value="if"
                                    checked={edge.conditionType === 'if'}
                                    onChange={() => updateEdge(edge._key, 'conditionType', 'if')}
                                />
                                Only if…
                            </label>
                        </div>

                        {/* ── Condition fields ── */}
                        {edge.conditionType === 'if' && (
                            <div className="asb-edge-condition">
                                <span className="asb-edge-condition-keyword">When</span>

                                <select
                                    className="asb-edge-select"
                                    data-testid={`aeb-cond-q-${i}`}
                                    value={edge.conditionQuestion}
                                    onChange={e =>
                                        updateEdge(edge._key, 'conditionQuestion', e.target.value)
                                    }
                                >
                                    <option value="">Select question…</option>
                                    {questionIds.map(qid => (
                                        <option key={qid} value={qid}>{qLabel(qid)}</option>
                                    ))}
                                </select>

                                <select
                                    className="asb-edge-select asb-edge-select--narrow"
                                    data-testid={`aeb-operator-${i}`}
                                    value={edge.operator}
                                    onChange={e =>
                                        updateEdge(edge._key, 'operator', e.target.value)
                                    }
                                >
                                    {OPERATORS.map(op => (
                                        <option key={op.value} value={op.value}>
                                            {op.label}
                                        </option>
                                    ))}
                                </select>

                                <ValueInput
                                    edge={edge}
                                    condQObj={condQObj}
                                    onValueChange={v => updateEdge(edge._key, 'value', v)}
                                />

                                {(edge.operator === 'in' || edge.operator === 'notIn') && (
                                    <span className="asb-edge-hint-inline">comma-separated</span>
                                )}
                            </div>
                        )}

                        {/* ── Inline error ── */}
                        {error && (
                            <p className="asb-edge-error" data-testid={`aeb-error-${i}`}>
                                ⚠ {error}
                            </p>
                        )}
                    </div>
                );
            })}

            <button
                type="button"
                className="asb-add-btn"
                data-testid="aeb-add-edge"
                onClick={addEdge}
            >
                + Add Rule
            </button>
        </section>
    );
};

export default AdminEdgeBuilder;
