import { useState, useEffect } from 'react';
import { fetchAllSurveys, fetchSurvey, fetchActiveSurveyId, setActiveSurvey, deleteSurvey } from '../../services/surveyApi';
import './AdminSurveyList.css';

// ─── AdminSurveyList ──────────────────────────────────────
// Loads survey summaries on mount, renders a list with Edit
// and New Survey actions.
//
// Props:
//   user    — logged-in admin user; user.email is sent as adminEmail for set-active calls
//   onEdit(fullSurvey) — called with the full survey object when Edit is clicked
//   onNew()  — called when the user clicks New Survey
//   onBack() — navigate back to the main dashboard

const AdminSurveyList = ({ user, onEdit, onNew, onBack }) => {
    const [surveys, setSurveys]       = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState(null);
    const [opening, setOpening]       = useState(null);   // surveyId being loaded for edit
    const [activeSurveyId, setActiveSurveyId] = useState(null);
    const [settingActive, setSettingActive]   = useState(null); // surveyId being set active
    const [deleting, setDeleting]             = useState(null); // surveyId being deleted

    useEffect(() => {
        Promise.all([fetchAllSurveys(), fetchActiveSurveyId()])
            .then(([surveys, activeId]) => {
                setSurveys(surveys);
                setActiveSurveyId(activeId);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    const handleSetActive = async (surveyId) => {
        setSettingActive(surveyId);
        try {
            await setActiveSurvey(user.email, surveyId);
            setActiveSurveyId(surveyId);
        } catch (err) {
            setError(err.message);
        } finally {
            setSettingActive(null);
        }
    };

    const handleDelete = async (surveyId) => {
        if (!window.confirm(`Delete survey "${surveyId}"? This cannot be undone.`)) return;
        setDeleting(surveyId);
        try {
            await deleteSurvey(user.email, surveyId);
            setSurveys(prev => prev.filter(s => s.surveyId !== surveyId));
            if (activeSurveyId === surveyId) setActiveSurveyId(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setDeleting(null);
        }
    };

    const handleEdit = async (surveyId) => {
        setOpening(surveyId);
        try {
            const full = await fetchSurvey(surveyId);
            onEdit(full);
        } catch (err) {
            setError(err.message);
        } finally {
            setOpening(null);
        }
    };

    // ── Render states ──

    if (loading) {
        return (
            <div className="asl-container" data-testid="asl-loading">
                Loading surveys…
            </div>
        );
    }

    return (
        <div className="asl-container" data-testid="admin-survey-list">
            <div className="asl-header">
                <button type="button" className="asl-back-btn" onClick={onBack}>
                    ← Back
                </button>
                <h2>Surveys</h2>
                <button
                    type="button"
                    className="asl-new-btn"
                    data-testid="asl-new-survey"
                    onClick={onNew}
                >
                    + New Survey
                </button>
            </div>

            {error && (
                <p className="asl-error" data-testid="asl-error">{error}</p>
            )}

            {surveys.length === 0 && !error && (
                <p className="asl-empty">No surveys yet. Create one to get started.</p>
            )}

            {surveys.length > 0 && (
                <table className="asl-table" data-testid="asl-table">
                    <thead>
                        <tr>
                            <th>Survey ID</th>
                            <th>Title</th>
                            <th>Version</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {surveys.map(s => (
                            <tr key={s.surveyId} data-testid={`asl-row-${s.surveyId}`}>
                                <td className="asl-id-cell">{s.surveyId}</td>
                                <td>{s.title}</td>
                                <td className="asl-version-cell">v{s.version}</td>
                                <td className="asl-action-cell">
                                    {activeSurveyId === s.surveyId ? (
                                        <span
                                            className="asl-active-badge"
                                            data-testid={`asl-active-${s.surveyId}`}
                                        >
                                            Active Survey
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            className="asl-set-active-btn"
                                            data-testid={`asl-set-active-${s.surveyId}`}
                                            disabled={settingActive === s.surveyId}
                                            onClick={() => handleSetActive(s.surveyId)}
                                        >
                                            {settingActive === s.surveyId ? 'Saving…' : 'Set as New Survey'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="asl-edit-btn"
                                        data-testid={`asl-edit-${s.surveyId}`}
                                        disabled={opening === s.surveyId}
                                        onClick={() => handleEdit(s.surveyId)}
                                    >
                                        {opening === s.surveyId ? 'Loading…' : 'Edit'}
                                    </button>
                                    <button
                                        type="button"
                                        className="asl-delete-btn"
                                        data-testid={`asl-delete-${s.surveyId}`}
                                        disabled={deleting === s.surveyId}
                                        onClick={() => handleDelete(s.surveyId)}
                                    >
                                        {deleting === s.surveyId ? 'Deleting…' : 'Delete'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default AdminSurveyList;
