import { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import SurveyPage from './components/survey/SurveyPage';
import AdminArea from './components/admin/AdminArea';
import './App.css';

function App() {
  const [view, setView]                   = useState('login'); // 'login' | 'dashboard' | 'survey' | 'admin'
  const [user, setUser]                   = useState(null);
  const [riskAssessment, setRiskAssessment] = useState(null);
  const [selectedSurveyId, setSelectedSurveyId] = useState(null);

  // ── Restore session on mount ──
  useEffect(() => {
    const saved = sessionStorage.getItem('ares_user');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
        setView('dashboard');
      } catch {
        sessionStorage.removeItem('ares_user');
      }
    }
  }, []);

  const handleLoginSuccess = (userData, riskData) => {
    sessionStorage.setItem('ares_user', JSON.stringify(userData));
    setUser(userData);
    setRiskAssessment(riskData || null);
    setView('dashboard');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('ares_user');
    setUser(null);
    setRiskAssessment(null);
    setView('login');
  };

  return (
    <div className="App">
      {view === 'login' && (
        <LoginForm onLoginSuccess={handleLoginSuccess} />
      )}
      {view === 'dashboard' && (
        <Dashboard
          user={user}
          riskAssessment={riskAssessment}
          onLogout={handleLogout}
          onTakeSurvey={(id) => { setSelectedSurveyId(id); setView('survey'); }}
          onGoToAdmin={() => setView('admin')}
        />
      )}
      {view === 'survey' && (
        <SurveyPage surveyId={selectedSurveyId} user={user} onBack={() => setView('dashboard')} />
      )}
      {view === 'admin' && (
        <AdminArea user={user} onBack={() => setView('dashboard')} />
      )}
    </div>
  );
}

export default App;