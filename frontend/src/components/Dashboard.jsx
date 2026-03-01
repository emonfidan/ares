import './Dashboard.css';

const Dashboard = ({ user, riskAssessment, onLogout }) => {
  const getRiskColorClass = (level) => {
    if (!level) return '';
    switch (level) {
      case 'LOW': return 'status-active';
      case 'MEDIUM': return 'status-challenged';
      case 'HIGH': return 'status-locked';
      default: return '';
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