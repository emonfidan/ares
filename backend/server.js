require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = 3001;

// ─── Rate Limit (Brute Force / Rapid Attempts) ──────────────
// Simple in-memory sliding window limiter.
// Keyed by (clientIP + identifier) so one attacker can’t spam a single account endlessly.

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 30_000); // 30s
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 8); // 8 attempts per window

// Map<key, number[]> where array holds attempt timestamps (ms)
const rateLimitStore = new Map();

function normalizeIP(ip) {
  if (!ip) return 'unknown';
  // Express/Node often uses these on localhost
  if (ip === '::1') return '127.0.0.1';
  // IPv6-mapped IPv4
  if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '');
  return ip;
}

function rateLimitKey(clientIP, identifier) {
  const ip = normalizeIP(clientIP);
  const ident = (identifier || 'unknown').toLowerCase();
  return `${ip}::${ident}`;
}

function checkRateLimit(clientIP, identifier) {
  const key = rateLimitKey(clientIP, identifier);
  const now = Date.now();

  const timestamps = rateLimitStore.get(key) || [];

  // keep only timestamps inside window
  const fresh = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  // If already limited, do NOT add a new timestamp (don’t extend the lockout)
  if (fresh.length >= RATE_LIMIT_MAX) {
    const oldest = fresh[0];
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - oldest);
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

    // IMPORTANT: keep the filtered list (no new attempt added)
    rateLimitStore.set(key, fresh);

    return { limited: true, retryAfterSeconds };
  }

  // Not limited → record this attempt
  fresh.push(now);
  rateLimitStore.set(key, fresh);

  return { limited: false, retryAfterSeconds: 0 };
}

// Middleware
app.set('trust proxy', true);
app.use(cors());
app.use(bodyParser.json());

// ─── Config ───────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '569495896866-hnoe9pla7fma4j4lu3cn7ps5brjjiuma.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23lizLVhPXmTiichGS';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ─── User Database (JSON file) ───────────────────────────
const USERS_FILE = path.join(__dirname, 'users.json');

if (!fs.existsSync(USERS_FILE)) {
    const initialUsers = [
        // Scenario 1: Clean first-time user — LOW risk (score 0), LLM not triggered
        {
            id: 1, email: 'clean@example.com', phone: '5551234567', password: 'Password123!',
            name: 'Clean User', socialProvider: null, socialId: null,
            accountStatus: 'Active', failedAttempts: 0, lastLoginIP: null, loginHistory: []
        },
        // Scenario 2: User with 6 failed attempts — MEDIUM risk (score 30), LLM triggered
        {
            id: 2, email: 'suspicious@example.com', phone: '5559876543', password: 'Password123!',
            name: 'Suspicious User', socialProvider: null, socialId: null,
            accountStatus: 'Active', failedAttempts: 6, lastLoginIP: '192.168.1.10',
            loginHistory: [
                { ip: '192.168.1.10', timestamp: '2026-02-28T10:00:00Z', success: true, method: 'password', riskLevel: 'LOW' },
                { ip: '192.168.1.10', timestamp: '2026-02-28T14:00:05Z', success: false, method: 'password', riskLevel: null },
                { ip: '192.168.1.10', timestamp: '2026-02-28T14:00:10Z', success: false, method: 'password', riskLevel: null },
                { ip: '192.168.1.10', timestamp: '2026-02-28T14:00:15Z', success: false, method: 'password', riskLevel: null },
                { ip: '192.168.1.10', timestamp: '2026-02-28T14:00:20Z', success: false, method: 'password', riskLevel: null },
                { ip: '192.168.1.10', timestamp: '2026-02-28T14:00:25Z', success: false, method: 'password', riskLevel: null }
            ]
        },
        // Scenario 3: User with established IP — MEDIUM risk (score 30) when logging from new IP
        {
            id: 3, email: 'traveler@example.com', phone: null, password: 'Password123!',
            name: 'Traveler User', socialProvider: null, socialId: null,
            accountStatus: 'Active', failedAttempts: 0, lastLoginIP: '203.0.113.50',
            loginHistory: [
                { ip: '198.51.100.1', timestamp: '2026-02-25T08:00:00Z', success: true, method: 'password', riskLevel: 'LOW' },
                { ip: '203.0.113.50', timestamp: '2026-02-27T12:00:00Z', success: true, method: 'password', riskLevel: 'MEDIUM' }
            ]
        },
        // Scenario 4: Brute force target — HIGH risk (score 60+), 8 failures + new IP, LLM likely CHALLENGE/BLOCK
        {
            id: 4, email: 'bruteforce@example.com', phone: null, password: 'Password123!',
            name: 'Bruteforce Target', socialProvider: null, socialId: null,
            accountStatus: 'Active', failedAttempts: 8, lastLoginIP: '10.0.0.1',
            loginHistory: [
                { ip: '10.0.0.1', timestamp: '2026-02-28T09:00:00Z', success: true, method: 'password', riskLevel: 'LOW' },
                { ip: '172.16.0.99', timestamp: '2026-02-28T20:00:00Z', success: false, method: 'password', riskLevel: null },
                { ip: '172.16.0.99', timestamp: '2026-02-28T20:00:02Z', success: false, method: 'password', riskLevel: null },
                { ip: '172.16.0.99', timestamp: '2026-02-28T20:00:04Z', success: false, method: 'password', riskLevel: null },
                { ip: '172.16.0.99', timestamp: '2026-02-28T20:00:06Z', success: false, method: 'password', riskLevel: null }
            ]
        },
        // Scenario 5: Already Challenged account — MEDIUM risk (score 35), non-Active status +20 compounds with failures
        {
            id: 5, email: 'challenged@example.com', phone: null, password: 'Password123!',
            name: 'Challenged User', socialProvider: null, socialId: null,
            accountStatus: 'Challenged', failedAttempts: 3, lastLoginIP: '192.168.1.50',
            loginHistory: [
                { ip: '192.168.1.50', timestamp: '2026-02-28T15:00:00Z', success: true, method: 'password', riskLevel: 'MEDIUM' },
                { ip: '192.168.1.50', timestamp: '2026-02-28T16:00:00Z', success: false, method: 'password', riskLevel: null },
                { ip: '192.168.1.50', timestamp: '2026-02-28T16:00:05Z', success: false, method: 'password', riskLevel: null }
            ]
        },
        // Scenario 6: Locked account — blocked at login gate, cannot attempt login
        {
            id: 6, email: 'locked@example.com', phone: null, password: 'Password123!',
            name: 'Locked User', socialProvider: null, socialId: null,
            accountStatus: 'Locked', failedAttempts: 10, lastLoginIP: '10.10.10.10',
            loginHistory: []
        },
        // Scenario 7: Suspended account — blocked at login gate, previously blocked by LLM
        {
            id: 7, email: 'suspended@example.com', phone: null, password: 'Password123!',
            name: 'Suspended User', socialProvider: null, socialId: null,
            accountStatus: 'Suspended', failedAttempts: 5, lastLoginIP: '192.168.100.1',
            loginHistory: []
        },
        // Scenario 8: Google OAuth user with IP history — MEDIUM risk if IP changes (only risk vector for social auth)
        {
            id: 8, email: 'google.traveler@gmail.com', phone: null, password: null,
            name: 'Google Traveler', socialProvider: 'google', socialId: 'google_traveler_001',
            accountStatus: 'Active', failedAttempts: 0, lastLoginIP: '85.105.200.1',
            loginHistory: [
                { ip: '85.105.200.1', timestamp: '2026-02-20T10:00:00Z', success: true, method: 'google', riskLevel: 'LOW' },
                { ip: '74.125.200.100', timestamp: '2026-02-22T14:00:00Z', success: true, method: 'google', riskLevel: 'MEDIUM' },
                { ip: '85.105.200.1', timestamp: '2026-02-27T16:00:00Z', success: true, method: 'google', riskLevel: 'LOW' }
            ]
        },
        // Scenario 9: GitHub OAuth user, clean state — LOW risk (score 0)
        {
            id: 9, email: 'github-user@example.com', phone: null, password: null,
            name: 'GitHub User', socialProvider: 'github', socialId: 'github_123456',
            accountStatus: 'Active', failedAttempts: 0, lastLoginIP: null, loginHistory: []
        }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2));
}

function getUsers() {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ─── Risk Assessment Engine ──────────────────────────────

function calculateRiskScore(user, clientIP) {
    let score = 0;
    const factors = [];

    // Factor 1: New / unknown IP
    if (user.lastLoginIP && user.lastLoginIP !== clientIP) {
        score += 30;
        factors.push('New IP address detected');
    }

    // Factor 2: Failed attempts (5 points each, capped at 30)
    const failedPenalty = Math.min(user.failedAttempts * 5, 30);
    if (failedPenalty > 0) {
        score += failedPenalty;
        factors.push(`${user.failedAttempts} failed login attempt(s)`);
    }

    // Factor 3: Account not in Active state
    if (user.accountStatus !== 'Active') {
        score += 20;
        factors.push(`Account status is ${user.accountStatus}`);
    }

    // Determine risk level
    let riskLevel;
    if (score >= 60) riskLevel = 'HIGH';
    else if (score >= 30) riskLevel = 'MEDIUM';
    else riskLevel = 'LOW';

    return { score, riskLevel, factors };
}

async function analyzeFraudWithLLM(user, clientIP, riskScore, loginMethod) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

        const loginHistoryText = (user.loginHistory || [])
            .slice(-5)
            .map(h => `  - ${h.timestamp} | IP: ${h.ip} | ${h.success ? 'Success' : 'Failed'}`)
            .join('\n') || '  No previous login history';

        const prompt = `You are a security fraud analysis system for a web application called ARES.
Analyze the following login attempt and respond with EXACTLY one word: ALLOW, CHALLENGE, or BLOCK.

- ALLOW: The login appears safe. Let the user in.
- CHALLENGE: The login is suspicious. Let the user in but mark account as challenged and warn them.
- BLOCK: The login is highly suspicious or dangerous. Block the login and suspend the account.

Login Attempt Details:
- User: ${user.email} (${user.name})
- Login Method: ${loginMethod}
- Current IP: ${clientIP}
- Last Known IP: ${user.lastLoginIP || 'None (first login)'}
- Account Status: ${user.accountStatus}
- Failed Attempts: ${user.failedAttempts}
- Risk Score: ${riskScore.score}/100 (${riskScore.riskLevel})
- Risk Factors: ${riskScore.factors.join(', ') || 'None'}
- Recent Login History:
${loginHistoryText}

Respond with ONLY one word: ALLOW, CHALLENGE, or BLOCK.`;

        const result = await model.generateContent(prompt);
        const response = result.response.text().trim().toUpperCase();

        // Parse the LLM response — extract the verdict
        if (response.includes('BLOCK')) return 'BLOCK';
        if (response.includes('CHALLENGE')) return 'CHALLENGE';
        if (response.includes('ALLOW')) return 'ALLOW';

        // If response is unclear, default to ALLOW
        console.warn('LLM returned unclear response:', response);
        return 'ALLOW';

    } catch (error) {
        console.error('LLM fraud analysis failed:', error.message);
        // Fail-open: if LLM is unavailable, allow login
        return 'ALLOW';
    }
}

// Shared risk assessment interceptor — called after authentication succeeds
async function performRiskAssessment(user, clientIP, loginMethod, users) {
    const riskScore = calculateRiskScore(user, clientIP);

    let llmVerdict = null;

    // Only call LLM when risk is MEDIUM or HIGH
    if (riskScore.riskLevel !== 'LOW') {
        llmVerdict = await analyzeFraudWithLLM(user, clientIP, riskScore, loginMethod);

        // Apply LLM verdict to account state
        if (llmVerdict === 'CHALLENGE') {
            user.accountStatus = 'Challenged';
        } else if (llmVerdict === 'BLOCK') {
            user.accountStatus = 'Suspended';
        } else {
            // ALLOW — restore to Active
            user.accountStatus = 'Active';
        }
    } else {
        // LOW risk — ensure account is Active
        user.accountStatus = 'Active';
    }

    // Record login history
    if (!user.loginHistory) user.loginHistory = [];
    user.loginHistory.push({
        ip: clientIP,
        timestamp: new Date().toISOString(),
        success: llmVerdict !== 'BLOCK',
        method: loginMethod,
        riskLevel: riskScore.riskLevel
    });
    // Keep only last 10 entries
    if (user.loginHistory.length > 10) {
        user.loginHistory = user.loginHistory.slice(-10);
    }

    user.lastLoginIP = clientIP;
    saveUsers(users);

    return { riskScore, llmVerdict };
}

// ─── Login Endpoint (Email/Phone + Password) ────────────

app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    const clientIP = normalizeIP(req.ip || req.connection.remoteAddress);

    // Rate limit BEFORE doing any expensive work
    const rl = checkRateLimit(clientIP, identifier);

    if (rl.limited) {
        // Standard: 429 + Retry-After header
        res.set('Retry-After', String(rl.retryAfterSeconds));
        return res.status(429).json({
            success: false,
            message: `Too many login attempts. Please try again in ${rl.retryAfterSeconds} seconds.`,
            rateLimited: true,
            retryAfterSeconds: rl.retryAfterSeconds
        });
    }

    if (!identifier || !password) {
        return res.status(400).json({
            success: false,
            message: 'Identifier and password are required'
        });
    }

    const users = getUsers();
    const user = users.find(u =>
        (u.email === identifier || u.phone === identifier) && u.password
    );

    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }

    // Account status check — Locked and Suspended users cannot login
    if (user.accountStatus === 'Locked') {
        return res.status(403).json({
            success: false,
            message: 'Account is locked. Please contact support.'
        });
    }

    if (user.accountStatus === 'Suspended') {
        return res.status(403).json({
            success: false,
            message: 'Account is suspended due to suspicious activity.'
        });
    }

    // Password check
    if (user.password !== password) {
        user.failedAttempts = (user.failedAttempts || 0) + 1;

        // Record failed attempt in history
        if (!user.loginHistory) user.loginHistory = [];
        user.loginHistory.push({
            ip: clientIP,
            timestamp: new Date().toISOString(),
            success: false,
            method: 'password',
            riskLevel: null
        });
        if (user.loginHistory.length > 10) {
            user.loginHistory = user.loginHistory.slice(-10);
        }

        saveUsers(users);

        return res.status(401).json({
            success: false,
            message: 'Invalid credentials',
            remainingAttempts: Math.max(0, 10 - user.failedAttempts),
            accountStatus: user.accountStatus
        });
    }

    // Password correct — perform risk assessment
    const { riskScore, llmVerdict } = await performRiskAssessment(user, clientIP, 'password', users);

    // If LLM blocked the login
    if (llmVerdict === 'BLOCK') {
        return res.status(403).json({
            success: false,
            message: 'Login blocked due to suspicious activity. Account suspended.',
            riskLevel: riskScore.riskLevel,
            riskScore: riskScore.score,
            llmVerdict: llmVerdict,
            accountStatus: user.accountStatus
        });
    }

    // Successful login — reset failed attempts
    user.failedAttempts = 0;
    saveUsers(users);

    res.json({
        success: true,
        challengeRequired: llmVerdict === 'CHALLENGE',
        message: llmVerdict === 'CHALLENGE'
            ? 'Security challenge required — please verify your identity'
            : 'Login successful',
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            accountStatus: user.accountStatus
        },
        riskAssessment: {
            riskLevel: riskScore.riskLevel,
            riskScore: riskScore.score,
            factors: riskScore.factors,
            llmVerdict: llmVerdict
        }
    });
});

// ─── Validation Helpers ──────────────────────────────────

function isStrongPassword(password) {
    // at least 8 chars, 1 uppercase, 1 symbol
    const lengthOK = password.length >= 8;
    const upperOK = /[A-Z]/.test(password);
    const symbolOK = /[^A-Za-z0-9]/.test(password);
    return lengthOK && upperOK && symbolOK;
}

function isValidName(name) {
    return /^[A-Za-z\s]+$/.test(name);
}
// Register endpoint
app.post('/api/register', (req, res) => {
    const { email, phone, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({
            success: false,
            message: 'Email, password, and name are required'
        });
    }

    // Name validation
    if (!isValidName(name)) {
        return res.status(400).json({
            success: false,
            message: 'Name can only contain letters'
        });
    }

    // Password validation
    if (!isStrongPassword(password)) {
        return res.status(400).json({
            success: false,
            message: 'Password must contain uppercase, symbol, and be 8+ characters'
        });
    }

    const users = getUsers();

    // Email zaten kayıtlı mı kontrol et - // Check if the email is already registered.
    if (users.find(u => u.email === email)) {
        return res.status(409).json({
            success: false,
            message: 'Email already registered'
        });

    }

    // Yeni kullanıcı oluştur - Create new user 
    const newUser = {
        id: users.length + 1,
        email,
        phone: phone || null,
        password,
        name,
        socialProvider: null,
        socialId: null,
        accountStatus: 'Active',
        failedAttempts: 0,
        lastLoginIP: null,
        loginHistory: []
    };

    users.push(newUser);
    saveUsers(users);

    res.json({
        success: true,
        message: 'Registration successful',
        user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name
        }
    });
});

// ─── Social Auth - Google (Real OAuth 2.0) ───────────────

app.post('/api/auth/google', async (req, res) => {
    const { code } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!code) {
        return res.status(400).json({
            success: false,
            message: 'Authorization code is required'
        });
    }

    try {
        // Exchange authorization code for tokens
        const { tokens } = await googleClient.getToken(code);

        // Verify the ID token
        const ticket = await googleClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;
        const name = payload.name || email;

        const users = getUsers();
        let user = users.find(u => u.socialProvider === 'google' && u.socialId === googleId);

        if (!user) {
            // Check if email already exists with a different provider
            const existingEmailUser = users.find(u => u.email === email && u.socialProvider !== 'google');
            if (existingEmailUser) {
                return res.status(409).json({
                    success: false,
                    message: 'An account with this email already exists. Please login with your password.'
                });
            }

            user = {
                id: users.length + 1,
                email,
                phone: null,
                password: null,
                name,
                socialProvider: 'google',
                socialId: googleId,
                accountStatus: 'Active',
                failedAttempts: 0,
                lastLoginIP: clientIP,
                loginHistory: []
            };
            users.push(user);
            saveUsers(users);
        }

        // Risk assessment — applied even for OAuth logins
        const { riskScore, llmVerdict } = await performRiskAssessment(user, clientIP, 'google', users);

        if (llmVerdict === 'BLOCK') {
            return res.status(403).json({
                success: false,
                message: 'Login blocked due to suspicious activity. Account suspended.',
                riskLevel: riskScore.riskLevel,
                riskScore: riskScore.score,
                llmVerdict: llmVerdict,
                accountStatus: user.accountStatus
            });
        }

        res.json({
            success: true,
            challengeRequired: llmVerdict === 'CHALLENGE',
            message: llmVerdict === 'CHALLENGE'
                ? 'Security challenge required — please verify your identity'
                : 'Google login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                provider: 'google',
                accountStatus: user.accountStatus
            },
            riskAssessment: {
                riskLevel: riskScore.riskLevel,
                riskScore: riskScore.score,
                factors: riskScore.factors,
                llmVerdict: llmVerdict
            }
        });
    } catch (error) {
        console.error('Google auth error:', error.message);
        res.status(401).json({
            success: false,
            message: 'Google authentication failed. Please try again.'
        });
    }
});
// ─── Social Auth - Google (E2E Bypass Mode) ───────────────
// This bypasses Google's external UI but still exercises your backend auth + risk pipeline.
// Enable only when E2E_MODE=true in backend/.env
app.post('/api/auth/google/e2e', async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  // Safety gate: prevent accidental use outside test mode
  const E2E_MODE = (process.env.E2E_MODE || '').toLowerCase() === 'true';
  if (!E2E_MODE) {
    return res.status(403).json({
      success: false,
      message: 'E2E Google auth is disabled. Set E2E_MODE=true to enable.'
    });
  }

  try {
    const users = getUsers();

    // Use a deterministic seeded social user so Selenium is stable
    let user = users.find(u => u.socialProvider === 'google' && u.socialId === 'google_traveler_001');

    if (!user) {
      user = {
        id: users.length + 1,
        email: 'google.traveler@gmail.com',
        phone: null,
        password: null,
        name: 'Google Traveler',
        socialProvider: 'google',
        socialId: 'google_traveler_001',
        accountStatus: 'Active',
        failedAttempts: 0,
        lastLoginIP: clientIP,
        loginHistory: []
      };
      users.push(user);
      saveUsers(users);
    }

    // Reuse your real pipeline (risk + possible CHALLENGE/BLOCK)
    const { riskScore, llmVerdict } = await performRiskAssessment(user, clientIP, 'google', users);

    if (llmVerdict === 'BLOCK') {
      return res.status(403).json({
        success: false,
        message: 'Login blocked due to suspicious activity. Account suspended.',
        riskLevel: riskScore.riskLevel,
        riskScore: riskScore.score,
        llmVerdict,
        accountStatus: user.accountStatus
      });
    }

    return res.json({
      success: true,
      challengeRequired: llmVerdict === 'CHALLENGE',
      message: 'Google login successful (E2E mode)',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: 'google',
        accountStatus: user.accountStatus
      },
      riskAssessment: {
        riskLevel: riskScore.riskLevel,
        riskScore: riskScore.score,
        factors: riskScore.factors,
        llmVerdict
      }
    });
  } catch (err) {
    console.error('E2E Google auth error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'E2E Google auth failed.'
    });
  }
});



// ─── Social Auth - GitHub OAuth ──────────────────────────

app.post('/api/auth/github', async (req, res) => {
    const { code } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!code) {
        return res.status(400).json({
            success: false,
            message: 'Authorization code is required'
        });
    }

    try {
        // Step 1: Exchange authorization code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code
            })
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('GitHub token error:', tokenData.error_description);
            return res.status(401).json({
                success: false,
                message: `GitHub authentication failed: ${tokenData.error_description || tokenData.error}`
            });
        }

        const accessToken = tokenData.access_token;

        // Step 2: Fetch user profile from GitHub API
        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        const githubUser = await userResponse.json();

        // Step 3: Fetch user email (may be private)
        let email = githubUser.email;
        if (!email) {
            const emailResponse = await fetch('https://api.github.com/user/emails', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            const emails = await emailResponse.json();
            const primaryEmail = emails.find(e => e.primary) || emails[0];
            email = primaryEmail?.email;
        }

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Could not retrieve email from GitHub. Please make sure your GitHub email is public or grant email permission.'
            });
        }

        const githubId = String(githubUser.id);
        const name = githubUser.name || githubUser.login;

        const users = getUsers();
        let user = users.find(u => u.socialProvider === 'github' && u.socialId === githubId);

        if (!user) {
            // Check if email already exists with a different provider
            const existingEmailUser = users.find(u => u.email === email && u.socialProvider !== 'github');
            if (existingEmailUser) {
                return res.status(409).json({
                    success: false,
                    message: 'An account with this email already exists. Please login with your existing method.'
                });
            }

            // Create new GitHub user
            user = {
                id: users.length + 1,
                email,
                phone: null,
                password: null,
                name,
                socialProvider: 'github',
                socialId: githubId,
                accountStatus: 'Active',
                failedAttempts: 0,
                lastLoginIP: clientIP,
                loginHistory: []
            };
            users.push(user);
            saveUsers(users);
        }

        // Risk assessment — applied even for OAuth logins
        const { riskScore, llmVerdict } = await performRiskAssessment(user, clientIP, 'github', users);

        if (llmVerdict === 'BLOCK') {
            return res.status(403).json({
                success: false,
                message: 'Login blocked due to suspicious activity. Account suspended.',
                riskLevel: riskScore.riskLevel,
                riskScore: riskScore.score,
                llmVerdict: llmVerdict,
                accountStatus: user.accountStatus
            });
        }

        res.json({
            success: true,
            challengeRequired: llmVerdict === 'CHALLENGE',
            message: llmVerdict === 'CHALLENGE'
                ? 'Security challenge required — please verify your identity'
                : 'GitHub login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                provider: 'github',
                accountStatus: user.accountStatus
            },
            riskAssessment: {
                riskLevel: riskScore.riskLevel,
                riskScore: riskScore.score,
                factors: riskScore.factors,
                llmVerdict: llmVerdict
            }
        });
    } catch (error) {
        console.error('GitHub auth error:', error.message);
        res.status(401).json({
            success: false,
            message: 'GitHub authentication failed. Please try again.'
        });
    }
});

// ─── User Status Endpoint ────────────────────────────────

app.get('/api/user/:email', (req, res) => {
    const users = getUsers();
    const user = users.find(u => u.email === req.params.email);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: 'User not found'
        });
    }

    res.json({
        success: true,
        user: {
            email: user.email,
            accountStatus: user.accountStatus,
            failedAttempts: user.failedAttempts,
            loginHistory: user.loginHistory || []
        }
    });
});

// ─── Admin: Reset Account ────────────────────────────────


app.post('/api/admin/reset/:email', (req, res) => {
  const users = getUsers();
  const user = users.find(u => u.email === req.params.email);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  user.accountStatus = 'Active';
  user.failedAttempts = 0;
  saveUsers(users);

  res.json({
    success: true,
    message: `Account ${req.params.email} reset to Active`,
    user: { email: user.email, accountStatus: user.accountStatus, failedAttempts: user.failedAttempts }
  });
});
// ─── Start Server ────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
