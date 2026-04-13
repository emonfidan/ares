import './SurveyPlayer.css';

// ─── Input renderers ──────────────────────────────────────
// Each function receives the question object and the current answer value,
// and returns the appropriate input element.
// onAnswerChange(questionId, value) is called on every user interaction.

function renderSingleChoice(question, currentAnswer, onAnswerChange) {
    return (
        <div className="choice-group" data-testid={`choices-${question.id}`}>
            {question.options.map(opt => (
                <button
                    key={opt}
                    type="button"
                    className={`choice-btn${currentAnswer === opt ? ' selected' : ''}`}
                    data-testid={`option-${question.id}-${opt.replace(/\s+/g, '-').toLowerCase()}`}
                    onClick={() => onAnswerChange(question.id, opt)}
                >
                    {opt}
                </button>
            ))}
        </div>
    );
}

function renderDropdown(question, currentAnswer, onAnswerChange) {
    return (
        <select
            data-testid={`dropdown-${question.id}`}
            value={currentAnswer || ''}
            onChange={e => onAnswerChange(question.id, e.target.value)}
        >
            <option value="">Select…</option>
            {question.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    );
}

function renderNumeric(question, currentAnswer, onAnswerChange) {
    const { id, validation } = question;

    if (validation?.numericOnly) {
        // Use a text input so we have full control over what characters are accepted.
        // type="number" allows 'e', '-', '.' which are invalid for an ID field.
        return (
            <input
                type="text"
                inputMode="numeric"
                data-testid={`numeric-${id}`}
                value={currentAnswer || ''}
                maxLength={validation.length || undefined}
                placeholder={validation.length ? `${validation.length}-digit ID` : 'Enter number'}
                onChange={e => {
                    // Strip every non-digit before storing — handles paste too
                    const digitsOnly = e.target.value.replace(/\D/g, '');
                    onAnswerChange(id, digitsOnly);
                }}
            />
        );
    }

    return (
        <input
            type="number"
            data-testid={`numeric-${id}`}
            value={currentAnswer ?? ''}
            min={0}
            onChange={e => onAnswerChange(id, e.target.value)}
        />
    );
}

function renderScale(question, currentAnswer, onAnswerChange) {
    const steps = [];
    for (let v = question.min; v <= question.max; v = Math.round((v + question.step) * 10) / 10) {
        steps.push(v);
    }
    return (
        <div className="scale-group" data-testid={`scale-${question.id}`}>
            {steps.map(v => (
                <button
                    key={v}
                    type="button"
                    className={`scale-btn${currentAnswer === v ? ' selected' : ''}`}
                    data-testid={`scale-${question.id}-${v}`}
                    onClick={() => onAnswerChange(question.id, v)}
                >
                    {v}
                </button>
            ))}
        </div>
    );
}

function renderOpenText(question, currentAnswer, onAnswerChange) {
    return (
        <textarea
            data-testid={`textarea-${question.id}`}
            value={currentAnswer || ''}
            rows={4}
            onChange={e => onAnswerChange(question.id, e.target.value)}
        />
    );
}

// ─── Validation ──────────────────────────────────────────
// Computes an inline error message from the question's validation rules and
// the current answer.  Returns null when there is nothing to show.
// No state required — derived directly from props on every render.

function getValidationError(question, answers) {
    const val = question.validation;
    if (!val) return null;

    const answer = answers[question.id];
    // No answer yet — stay silent until the user has typed something
    if (answer === undefined || answer === null || answer === '') return null;

    const str = String(answer).trim();

    if (val.numericOnly && !/^\d+$/.test(str)) {
        return 'Only numeric characters are allowed.';
    }
    if (val.numericOnly && val.length && str.length !== val.length) {
        return `Must be exactly ${val.length} digits.`;
    }
    return null;
}

// ─── Question dispatcher ──────────────────────────────────

function renderQuestion(question, answers, onAnswerChange) {
    const currentAnswer = answers[question.id];
    const validationError = getValidationError(question, answers);
    let input;

    switch (question.type) {
        case 'single-choice': input = renderSingleChoice(question, currentAnswer, onAnswerChange); break;
        case 'dropdown':      input = renderDropdown(question, currentAnswer, onAnswerChange);     break;
        case 'numeric':       input = renderNumeric(question, currentAnswer, onAnswerChange);      break;
        case 'scale':         input = renderScale(question, currentAnswer, onAnswerChange);        break;
        case 'open-text':     input = renderOpenText(question, currentAnswer, onAnswerChange);     break;
        default:              input = null;
    }

    return (
        <div key={question.id} className="survey-question" data-testid={`question-${question.id}`}>
            <label className="question-text">
                {question.text}
                {question.required && <span className="required-marker"> *</span>}
            </label>
            {input}
            {validationError && (
                <p className="validation-error" data-testid={`error-${question.id}`}>
                    {validationError}
                </p>
            )}
        </div>
    );
}

// ─── Component ────────────────────────────────────────────
// Props:
//   survey            — full survey object (for title)
//   visibleQuestions  — ordered array of question objects to render
//   answers           — { [questionId]: value } map
//   isComplete        — true when Submit should appear
//   onAnswerChange(questionId, value)
//   onSubmit()
//   onBack()

const SurveyPlayer = ({ survey, visibleQuestions, answers, isComplete, onAnswerChange, onSubmit, onBack }) => {
    return (
        <div className="survey-player" data-testid="survey-player">
            <div className="survey-header">
                <button
                    type="button"
                    className="back-btn"
                    data-testid="back-button"
                    onClick={onBack}
                >
                    ← Back
                </button>
                <h2>{survey?.title}</h2>
            </div>

            <div className="survey-questions">
                {visibleQuestions.map(q => renderQuestion(q, answers, onAnswerChange))}
            </div>

            <button
                    type="button"
                    className="submit-btn"
                    data-testid="submit-button"
                    disabled={!isComplete}
                    onClick={onSubmit}
                >
                    Submit Survey
                </button>
        </div>
    );
};

export default SurveyPlayer;
