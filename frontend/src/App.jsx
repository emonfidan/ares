import { useState } from 'react';
import LoginForm from './components/LoginForm';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState(null);

  const handleLoginSuccess = (userData, riskData) => {
    setUser(userData);
    setRiskAssessment(riskData || null);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setUser(null);
    setRiskAssessment(null);
    setIsLoggedIn(false);
  };

  return (
    <div className="App">
      {isLoggedIn ? (
        <Dashboard user={user} riskAssessment={riskAssessment} onLogout={handleLogout} />
      ) : (
        <LoginForm onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
}

export default App;