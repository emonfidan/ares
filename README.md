```bash
cd backend
npm install
# Create a .env file with the following variables (see .env.example):
# GOOGLE_CLIENT_SECRET, GEMINI_API_KEY, GITHUB_CLIENT_SECRET
npm start
```

```bash
cd frontend
npm install
npm run dev
```

```bash
cd selenium
npm install
node tests/00_login_clean.js
node tests/01_dynamic_id_recovery.js
node tests/02_google_popup_overlay.js
#for test 3: running on 2 browsers: 
#if on powershell 
$env:BROWSER="firefox"; node tests/03_cross_browser_css_break.js
$env:BROWSER="chrome"; node tests/03_cross_browser_css_break.js
#if on linux/macOS
BROWSER=firefox node tests/03_cross_browser_css_break.js
BROWSER=chrome node tests/03_cross_browser_css_break.js


node tests/04_social_auth_handshake.js
```