import { useState } from 'react';
import './Dashboard.css';

const Dashboard = ({ user, onLogout }) => {
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
        
        {/* Buradan aşağısı kaldırıldı */}
      </div>
    </div>
  );
};

export default Dashboard;