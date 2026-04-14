import { useState } from 'react';
import AdminSurveyList from './AdminSurveyList';
import AdminSurveyBuilder from './AdminSurveyBuilder';
import SurveyPage from '../survey/SurveyPage';

// ─── AdminArea ────────────────────────────────────────────
// Owns sub-navigation for the admin section.
//
// Sub-views:
//   'list'   — show all existing surveys, entry point
//   'create' — blank builder form for a new survey
//   'edit'   — builder form pre-filled with an existing survey
//   'play'   — run a selected survey in the SurveyPlayer
//
// Props:
//   user   — logged-in user (passed down to builder for adminEmail)
//   onBack — navigate back to the main dashboard

const AdminArea = ({ user, onBack }) => {
    const [subView, setSubView]               = useState('list');
    const [selectedSurvey, setSelectedSurvey] = useState(null);
    const [playingSurveyId, setPlayingSurveyId] = useState(null);

    const handleEdit = (survey) => {
        setSelectedSurvey(survey);
        setSubView('edit');
    };

    const handleNew = () => {
        setSelectedSurvey(null);
        setSubView('create');
    };

    const handlePlay = (surveyId) => {
        setPlayingSurveyId(surveyId);
        setSubView('play');
    };

    const handleBuilderBack = () => {
        setSelectedSurvey(null);
        setSubView('list');
    };

    if (subView === 'list') {
        return (
            <AdminSurveyList
                user={user}
                onEdit={handleEdit}
                onPlay={handlePlay}
                onNew={handleNew}
                onBack={onBack}
            />
        );
    }

    if (subView === 'play') {
        if (!playingSurveyId) {
            // Shouldn't happen, but guard against a stale render
            setSubView('list');
            return null;
        }
        return (
            <SurveyPage
                surveyId={playingSurveyId}
                onBack={() => setSubView('list')}
            />
        );
    }

    // 'create' or 'edit' — both render the builder
    return (
        <AdminSurveyBuilder
            user={user}
            existingSurvey={subView === 'edit' ? selectedSurvey : null}
            onBack={handleBuilderBack}
        />
    );
};

export default AdminArea;
