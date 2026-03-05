import { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import './LoginForm.css';

const API_BASE = 'http://localhost:3001';

const LoginForm = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
    name: '',
    email: '',
    phone: ''
  });

  const [message, setMessage] = useState({ text: '', type: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [riskInfo, setRiskInfo] = useState(null);
  const [pendingChallenge, setPendingChallenge] = useState(null); // { user, riskAssessment }
  const [showPopup, setShowPopup] = useState(false);

  // Rate limit UI cooldown
  const [rateLimitUntil, setRateLimitUntil] = useState(null); // ms timestamp until login is allowed again
  const [now, setNow] = useState(Date.now());
  const isRateLimitedNow = Boolean(rateLimitUntil && now < rateLimitUntil);
  const rateLimitSecondsLeft = isRateLimitedNow
    ? Math.max(0, Math.ceil((rateLimitUntil - now) / 1000))
    : 0;

  // E2E flags from URL
  const isE2E = new URLSearchParams(window.location.search).get('e2e') === '1';

  // ✅ FIX: Make countdown "tick" and automatically clear when time is up
  useEffect(() => {
    if (!rateLimitUntil) return;

    const t = setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => clearInterval(t);
  }, [rateLimitUntil]);

  // When time passes the deadline, clear the lock once
  useEffect(() => {
    if (rateLimitUntil && now >= rateLimitUntil) {
      setRateLimitUntil(null);
    }
  }, [now, rateLimitUntil]);

  // GitHub OAuth callback handler (code in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname);
      handleGitHubCallback(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scenario 2: popup overlay toggle
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setShowPopup(params.get('e2ePopup') === '1');
  }, []);

  // Scenario: optional CSS break to test healing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldBreak = params.get('breakCss') === '1';
    if (shouldBreak) {
      const btn = document.getElementById('google-login-button');
      if (btn) btn.classList.add('e2e-break-google');
    }
  }, []);

  const handleInputChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const clearUiStateBeforeRequest = () => {
    setMessage({ text: '', type: '' });
    setAttemptsLeft(null);
    setRiskInfo(null);
    setPendingChallenge(null);
    // ✅ If user tries again, don't keep stale lock
    // (backend is source of truth; UI should recover when allowed)
    // Note: we *don't* always clear immediately on rate-limited response.
    // We clear at start so we can re-apply if backend says 429 again.
    setRateLimitUntil(null);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    clearUiStateBeforeRequest();

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: formData.identifier,
          password: formData.password
        })
      });

      const data = await response.json().catch(() => ({}));

      if (data.success) {
        if (data.riskAssessment) setRiskInfo(data.riskAssessment);

        if (data.challengeRequired) {
          setPendingChallenge({ user: data.user, riskAssessment: data.riskAssessment });
          setMessage({ text: 'Security challenge required — please verify below.', type: 'warning' });
        } else {
          setMessage({ text: `Welcome, ${data.user?.name || 'User'}!`, type: 'success' });
          setTimeout(() => onLoginSuccess(data.user, data.riskAssessment), 800);
        }
        return;
      }

      // Rate limit handling
      if (response.status === 429 && data.retryAfterSeconds) {
        const until = Date.now() + Number(data.retryAfterSeconds) * 1000;
        setRateLimitUntil(until);
        setMessage({ text: data.message || 'Too many login attempts. Please try again later.', type: 'error' });
        return;
      }

      // OAuth-only user tried password login
      if (data.requiresPasswordSetup) {
        setMessage({
          text: data.message || 'This account uses social login. Please register a password or use your social login.',
          type: 'error'
        });
        return;
      }

      setMessage({ text: data.message || 'Login failed.', type: 'error' });
      if (data.riskAssessment) setRiskInfo(data.riskAssessment);
      if (typeof data.remainingAttempts === 'number') setAttemptsLeft(data.remainingAttempts);
    } catch (err) {
      setMessage({ text: 'Connection error. Please try again.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const response = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          name: formData.name
        })
      });

      const data = await response.json().catch(() => ({}));

      if (data.success) {
        setMessage({ text: 'Registration successful! Please login.', type: 'success' });
        setTimeout(() => {
          setIsLogin(true);
          setFormData({ identifier: '', password: '', name: '', email: '', phone: '' });
        }, 1000);
      } else {
        setMessage({ text: data.message || 'Registration failed.', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Connection error. Please try again.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Google OAuth ---
  const googleLogin = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      setIsLoading(true);
      setMessage({ text: '', type: '' });

      try {
        const endpoint = isE2E ? `${API_BASE}/api/auth/google/e2e` : `${API_BASE}/api/auth/google`;
        const body = isE2E ? {} : { code: codeResponse.code };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const data = await response.json().catch(() => ({}));

        if (data.success) {
          if (data.riskAssessment) setRiskInfo(data.riskAssessment);

          if (data.challengeRequired) {
            setPendingChallenge({ user: data.user, riskAssessment: data.riskAssessment });
            setMessage({ text: 'Security challenge required — please verify below.', type: 'warning' });
          } else {
            setMessage({ text: `Welcome, ${data.user?.name || 'User'}!`, type: 'success' });
            setTimeout(() => onLoginSuccess(data.user, data.riskAssessment), 800);
          }
        } else {
          setMessage({ text: data.message || 'Google login failed.', type: 'error' });
          if (data.riskAssessment) setRiskInfo(data.riskAssessment);
        }
      } catch (err) {
        setMessage({ text: 'Google login failed. Please try again.', type: 'error' });
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => setMessage({ text: 'Google login failed. Please try again.', type: 'error' }),
    flow: 'auth-code'
  });

  // Button click handler (real Google popup vs E2E bypass)
  const handleGoogleClick = async () => {
    if (!isE2E) return googleLogin();

    setIsLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const response = await fetch(`${API_BASE}/api/auth/google/e2e`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json().catch(() => ({}));

      if (data.success) {
        if (data.riskAssessment) setRiskInfo(data.riskAssessment);

        if (data.challengeRequired) {
          setPendingChallenge({ user: data.user, riskAssessment: data.riskAssessment });
          setMessage({ text: 'Security challenge required — please verify below.', type: 'warning' });
        } else {
          setMessage({ text: `Welcome, ${data.user?.name || 'User'}!`, type: 'success' });
          setTimeout(() => onLoginSuccess(data.user, data.riskAssessment), 600);
        }
      } else {
        setMessage({ text: data.message || 'E2E Google login failed.', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'E2E Google login failed (network).', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  // --- GitHub OAuth ---
  const handleGitHubLogin = () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || 'Ov23lizLVhPXmTiichGS';
    const redirectUri = window.location.origin;
    const scope = 'read:user user:email';
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
  };

  const handleGitHubCallback = async (code) => {
    setIsLoading(true);
    setMessage({ text: 'Completing GitHub login...', type: '' });

    try {
      const response = await fetch(`${API_BASE}/api/auth/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await response.json().catch(() => ({}));

      if (data.success) {
        if (data.riskAssessment) setRiskInfo(data.riskAssessment);

        if (data.challengeRequired) {
          setPendingChallenge({ user: data.user, riskAssessment: data.riskAssessment });
          setMessage({ text: 'Security challenge required — please verify below.', type: 'warning' });
        } else {
          setMessage({ text: `Welcome, ${data.user?.name || 'User'}!`, type: 'success' });
          setTimeout(() => onLoginSuccess(data.user, data.riskAssessment), 800);
        }
      } else {
        setMessage({ text: data.message || 'GitHub login failed.', type: 'error' });
        if (data.riskAssessment) setRiskInfo(data.riskAssessment);
      }
    } catch (err) {
      setMessage({ text: 'GitHub login failed. Please try again.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const solveChallenge = () => {
    if (!pendingChallenge) return;

    const solvedUser = pendingChallenge.user;
    const solvedRisk = pendingChallenge.riskAssessment;

    // Clear overlay
    setPendingChallenge(null);

    // Immediately move to dashboard (full login)
    onLoginSuccess(solvedUser, solvedRisk);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {showPopup && (
          <div className="blocking-overlay" id="blocking-overlay">
            <div className="blocking-popup" id="blocking-popup">
              <h3>Heads up</h3>
              <p>This popup is blocking Google login (Scenario 2).</p>
              <button
                type="button"
                id="popup-close"
                className="popup-close-btn"
                onClick={() => setShowPopup(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        <div className="login-header">
          <h1>ARES Authentication</h1>
          <p>AI-Driven Resilient & Evolutionary Systems</p>
        </div>

        <div className="tab-buttons">
          <button
            className={isLogin ? 'tab-button active' : 'tab-button'}
            onClick={() => {
              setIsLogin(true);
              setAttemptsLeft(null);
              setMessage({ text: '', type: '' });
            }}
            id="login-tab"
            type="button"
          >
            Login
          </button>
          <button
            className={!isLogin ? 'tab-button active' : 'tab-button'}
            onClick={() => {
              setIsLogin(false);
              setMessage({ text: '', type: '' });
            }}
            id="register-tab"
            type="button"
          >
            Register
          </button>
        </div>

        {message.text && (
          <div className={`message ${message.type}`} id="message-box">
            {message.text}
          </div>
        )}

        {isLogin && attemptsLeft !== null && (
          <div className="message info" id="attempts-left">
            Attempts left: {attemptsLeft}
          </div>
        )}

        {riskInfo && (
          <div className={`risk-badge risk-${riskInfo.riskLevel?.toLowerCase()}`} id="risk-info">
            <span className="risk-label">Risk: {riskInfo.riskLevel}</span>
            <span className="risk-score">Score: {riskInfo.riskScore}/100</span>
            {riskInfo.llmVerdict && <span className="llm-verdict">LLM Verdict: {riskInfo.llmVerdict}</span>}
            {riskInfo.factors && riskInfo.factors.length > 0 && (
              <ul className="risk-factors">
                {riskInfo.factors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {pendingChallenge && (
          <div className="challenge-overlay" id="challenge-overlay">
            <div className="challenge-icon">🛡️</div>
            <h3>Security Verification Required</h3>
            <p>Unusual activity detected on your account. Please verify you are human to continue.</p>
            <button className="challenge-button" id="challenge-verify-btn" onClick={solveChallenge} type="button">
              ✅ Click here to verify
            </button>
          </div>
        )}

        {isLogin ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="identifier">Email or Phone</label>
              <input
                type="text"
                id="identifier"
                name="identifier"
                value={formData.identifier}
                onChange={handleInputChange}
                placeholder="Enter email or phone"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Enter password"
                required
              />
            </div>

            <button
              type="submit"
              className="submit-button"
              id="login-button"
              disabled={isLoading || isRateLimitedNow}
            >
              {isLoading ? 'Logging in...' : isRateLimitedNow ? `Try again in ${rateLimitSecondsLeft}s` : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="login-form">
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Enter email"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">Phone (Optional)</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="Enter phone number"
              />
            </div>

            <div className="form-group">
              <label htmlFor="register-password">Password</label>
              <input
                type="password"
                id="register-password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Enter password"
                required
              />
            </div>

            <button type="submit" className="submit-button" id="register-button" disabled={isLoading}>
              {isLoading ? 'Registering...' : 'Register'}
            </button>
          </form>
        )}

        <div className="divider">
          <span>OR</span>
        </div>

        <div className="social-buttons">
          <button
            className="social-button google"
            id="google-login-button"
            onClick={handleGoogleClick}
            disabled={isLoading}
            type="button"
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

          <button
            className="social-button github"
            id="github-login-button"
            onClick={handleGitHubLogin}
            disabled={isLoading}
            type="button"
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                fill="#333"
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
              />
            </svg>
            Continue with GitHub
          </button>
        </div>

        <div className="test-credentials">
          <p>
            <strong>Test Credentials:</strong> (Password for all: Password123!)
          </p>
          <p>🟢 clean@example.com — LOW risk</p>
          <p>⚠️ challenged@example.com — Challenged state</p>
          <p>� risky@example.com — HIGH risk (LLM likely suspends)</p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;