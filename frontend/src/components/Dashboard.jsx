import { useState, useEffect } from 'react';
import { fetchActiveSurveyId } from '../services/surveyApi';
import './Dashboard.css';

const API_BASE = 'http://localhost:3001';

const Dashboard = ({ user, riskAssessment, onLogout, onTakeSurvey, onGoToAdmin }) => {
  const [providers, setProviders] = useState(user.linkedProviders || []);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });
  const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' });
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [activeSurveyId, setActiveSurveyId] = useState(null);
  const [activeSurveyLoading, setActiveSurveyLoading] = useState(true);

  useEffect(() => {
    fetchActiveSurveyId()
      .then(id => setActiveSurveyId(id))
      .catch(() => setActiveSurveyId(null))
      .finally(() => setActiveSurveyLoading(false));
  }, []);

  const hasPassword = providers.some(p => p.provider === 'password');

  const getRiskColorClass = (level) => {
    if (!level) return '';
    switch (level) {
      case 'LOW': return 'status-active';
      case 'MEDIUM': return 'status-challenged';
      case 'HIGH': return 'status-locked';
      default: return '';
    }
  };

  const providerLabel = (name) => {
    switch (name) {
      case 'password': return '🔑 Password';
      case 'google': return '🔵 Google';
      case 'github': return '⚫ GitHub';
      default: return name;
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (isSettingPassword) return;

    if (passwordForm.password !== passwordForm.confirm) {
      setPasswordMsg({ text: 'Passwords do not match.', type: 'error' });
      return;
    }

    setIsSettingPassword(true);
    setPasswordMsg({ text: '', type: '' });

    try {
      const response = await fetch(`${API_BASE}/api/user/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: passwordForm.password })
      });

      const data = await response.json().catch(() => ({}));

      if (data.success) {
        setPasswordMsg({ text: 'Password set successfully!', type: 'success' });
        setProviders(data.linkedProviders || [...providers, { provider: 'password' }]);
        setPasswordForm({ password: '', confirm: '' });
      } else {
        setPasswordMsg({ text: data.message || 'Failed to set password.', type: 'error' });
      }
    } catch (err) {
      setPasswordMsg({ text: 'Connection error. Please try again.', type: 'error' });
    } finally {
      setIsSettingPassword(false);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-card">
        <div className="dashboard-header">
          <h1>Welcome to ARES</h1>
          <button className="logout-button" id="logout-button" onClick={onLogout}>
            Logout
          </button>
        </div>

        <div className="user-info">
          <div className="user-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h2>Hello, {user.name}!</h2>
          <p className="user-email">{user.email}</p>
          {user.provider && (
            <p className="provider-badge">
              Logged in with {user.provider}
            </p>
          )}
        </div>

        <div className="survey-cta">
          <button
            className="survey-cta-btn"
            id="take-survey-button"
            disabled={activeSurveyLoading || !activeSurveyId}
            onClick={() => onTakeSurvey(activeSurveyId)}
          >
            Take the Survey
          </button>
          {!activeSurveyLoading && !activeSurveyId && (
            <p className="survey-cta-notice" id="no-active-survey-notice">
              No active survey is set yet.
            </p>
          )}
        </div>

        {user.role === 'admin' && (
          <div className="admin-cta">
            <button
              className="admin-cta-btn"
              id="admin-survey-builder-button"
              onClick={onGoToAdmin}
            >
              Admin: Build a Survey
            </button>
          </div>
        )}

        {/* Linked Login Methods */}
        <div className="info-box" id="linked-providers-section">
          <h3>Linked Login Methods</h3>
          <div className="provider-tags">
            {providers.map((p, i) => (
              <span key={i} className="provider-tag" data-provider={p.provider}>
                {providerLabel(p.provider)}
              </span>
            ))}
          </div>

          {!hasPassword && (
            <div className="set-password-section" id="set-password-section">
              <p className="set-password-hint">
                Add a password to also log in with email + password.
              </p>
              {passwordMsg.text && (
                <div className={`password-message ${passwordMsg.type}`} id="set-password-message">
                  {passwordMsg.text}
                </div>
              )}
              <form onSubmit={handleSetPassword} className="set-password-form">
                <input
                  type="password"
                  id="set-password-input"
                  placeholder="New password"
                  value={passwordForm.password}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, password: e.target.value }))}
                  required
                />
                <input
                  type="password"
                  id="set-password-confirm"
                  placeholder="Confirm password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
                  required
                />
                <button
                  type="submit"
                  className="set-password-button"
                  id="set-password-button"
                  disabled={isSettingPassword}
                >
                  {isSettingPassword ? 'Setting...' : 'Set Password'}
                </button>
              </form>
            </div>
          )}
        </div>

        {riskAssessment && (
          <div className="account-status">
            <div className="status-item">
              <span className="status-label">Risk Level</span>
              <span className={`status-value ${getRiskColorClass(riskAssessment.riskLevel)}`}>
                {riskAssessment.riskLevel || 'N/A'}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">Risk Score</span>
              <span className="status-value">{riskAssessment.riskScore}/100</span>
            </div>
            <div className="status-item">
              <span className="status-label">LLM Verdict</span>
              <span className={`status-value ${getRiskColorClass(
                riskAssessment.llmVerdict === 'ALLOW' ? 'LOW' :
                  riskAssessment.llmVerdict === 'CHALLENGE' ? 'MEDIUM' :
                    riskAssessment.llmVerdict === 'BLOCK' ? 'HIGH' : ''
              )}`}>
                {riskAssessment.llmVerdict || 'Not triggered'}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">Account Status</span>
              <span className={`status-value status-${(user.accountStatus || 'active').toLowerCase()}`}>
                {user.accountStatus || 'Active'}
              </span>
            </div>
          </div>
        )}

        {riskAssessment?.factors?.length > 0 && (
          <div className="info-box">
            <h3>Risk Factors</h3>
            <ul>
              {riskAssessment.factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;