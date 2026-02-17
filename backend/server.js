const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Basit kullanıcı veritabanı dosyası - Simple user database file
const USERS_FILE = path.join(__dirname, 'users.json');

// Kullanıcı dosyası yoksa oluştur - If the user file does not exist, create it
if (!fs.existsSync(USERS_FILE)) {
    const initialUsers = [
        {
            id: 1,
            email: 'test@example.com',
            phone: '5551234567',
            password: 'password123',
            name: 'Test User',
            socialProvider: null,
            socialId: null,
            accountStatus: 'Active',
            failedAttempts: 0,
            lastLoginIP: null
        },
        {
            id: 2,
            email: 'google@example.com',
            phone: null,
            password: null,
            name: 'Google User',
            socialProvider: 'google',
            socialId: 'google_123456',
            accountStatus: 'Active',
            failedAttempts: 0,
            lastLoginIP: null
        },
        {
            id: 3,
            email: 'facebook@example.com',
            phone: null,
            password: null,
            name: 'Facebook User',
            socialProvider: 'facebook',
            socialId: 'facebook_123456',
            accountStatus: 'Active',
            failedAttempts: 0,
            lastLoginIP: null
        }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2));
}

// Kullanıcıları oku - Read users
function getUsers() {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
}

// Kullanıcıları kaydet - Register users 
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Login endpoint - Email/Phone + Password
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

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

    // Hesap durumu kontrolü - Account status check
    if (user.accountStatus === 'Locked') {
        return res.status(403).json({ 
            success: false, 
            message: 'Account is locked. Please contact support.' 
        });
    }

    if (user.accountStatus === 'Suspended') {
        return res.status(403).json({ 
            success: false, 
            message: 'Account is suspended.' 
        });
    }

    // Şifre kontrolü - Password check
    if (user.password !== password) {
        // Başarısız girişim sayacını artır - Increase the failed attempt counter
        user.failedAttempts = (user.failedAttempts || 0) + 1;
        
        // 5 başarısız denemeden sonra hesabı challenge durumuna al - After 5 failed attempts, put the account in challenge mode
        if (user.failedAttempts >= 5 && user.failedAttempts < 10) {
            user.accountStatus = 'Challenged';
        }
        
        // 10 başarısız denemeden sonra hesabı kilitle - Lock the account after 10 failed attempts.
        if (user.failedAttempts >= 10) {
            user.accountStatus = 'Locked';
        }
        
        saveUsers(users);
        
        return res.status(401).json({ 
            success: false,
            message: user.accountStatus === 'Locked'
                ? 'Account locked due to too many failed attempts'
                : user.accountStatus === 'Challenged'
                ? 'Warning: multiple failed attempts'
                : 'Invalid credentials',
            remainingAttempts: Math.max(0, 10 - user.failedAttempts),
            accountStatus: user.accountStatus
        });
    }

    // Başarılı giriş - Successful login
    user.failedAttempts = 0;
    user.accountStatus = 'Active';
    user.lastLoginIP = clientIP;
    saveUsers(users);

    res.json({ 
        success: true, 
        message: 'Login successful',
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            accountStatus: user.accountStatus
        }
    });
});

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
        lastLoginIP: null
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

// Social Auth - Google
app.post('/api/auth/google', (req, res) => {
    const { token, email, name, googleId } = req.body;

    if (!token || !email || !googleId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid Google authentication data' 
        });
    }

    const users = getUsers();
    let user = users.find(u => u.socialProvider === 'google' && u.socialId === googleId);

    if (!user) {
        // Yeni Google kullanıcısı oluştur -- Create a new Google user
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
            lastLoginIP: req.ip
        };
        users.push(user);
        saveUsers(users);
    } else {
        // Mevcut kullanıcı - son giriş IP'sini güncelle
        // Current user - update last login IP address.
        user.lastLoginIP = req.ip;
        saveUsers(users);
    }

    res.json({ 
        success: true, 
        message: 'Google login successful',
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            provider: 'google'
        }
    });
});

// Social Auth - Facebook
app.post('/api/auth/facebook', (req, res) => {
    const { token, email, name, facebookId } = req.body;

    if (!token || !email || !facebookId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid Facebook authentication data' 
        });
    }

    const users = getUsers();
    let user = users.find(u => u.socialProvider === 'facebook' && u.socialId === facebookId);

    if (!user) {
        // Yeni Facebook kullanıcısı oluştur
        // Create a new Facebook user
        user = {
            id: users.length + 1,
            email,
            phone: null,
            password: null,
            name,
            socialProvider: 'facebook',
            socialId: facebookId,
            accountStatus: 'Active',
            failedAttempts: 0,
            lastLoginIP: req.ip
        };
        users.push(user);
        saveUsers(users);
    } else {
        // Mevcut kullanıcı - son giriş IP'sini güncelle
        // Current user - update last login IP

        user.lastLoginIP = req.ip;
        saveUsers(users);
    }

    res.json({ 
        success: true, 
        message: 'Facebook login successful',
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            provider: 'facebook'
        }
    });
});

// Get user status endpoint (test için)
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
            failedAttempts: user.failedAttempts
        }
    });
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
