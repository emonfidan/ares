# ARES – Self-Healing Authentication System

## Setup

Open **three terminals**.

---

## Environment Variables

Before running the project, create a `.env` file for both **backend** and **selenium**.

Each folder includes a `.env.example` file.

After you create / or recieve specific keys/codes to use: 
Copy it and rename it to `.env`.

--- 

# Terminal 1
cd backend <br>
npm install<br>
node server.js <br>

# Terminal 2
cd frontend <br>
npm install <br>
npm run dev <br>

# Terminal 3
cd selenium <br>
npm install <br>
npm install -D geckodriver <br>
npm run test:all <br>
