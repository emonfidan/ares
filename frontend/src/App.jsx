import { useState } from 'react';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import SurveyPage from './components/survey/SurveyPage';
import './App.css';

function App() {
  const [view, setView] = useState('login'); // 'login' | 'dashboard' | 'survey'
  const [user, setUser] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState(null);

  const handleLoginSuccess = (userData, riskData) => {
    setUser(userData);
    setRiskAssessment(riskData || null);
    setView('dashboard');
  };

  const handleLogout = () => {
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
          onTakeSurvey={() => setView('survey')}
        />
      )}
      {view === 'survey' && (
        <SurveyPage user={user} onBack={() => setView('dashboard')} />
      )}
    </div>
  );
}

export default App;