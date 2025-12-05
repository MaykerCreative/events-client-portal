# Mayker Events - Client Portal

Client-facing portal for viewing proposals and yearly spend.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm start
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Configuration

The API URL is configured in `src/App.js`:
```javascript
const CLIENT_API_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_URL/exec';
```

## Features

- Client login/authentication
- Year-to-date spend dashboard
- Proposal viewing (Active/Completed/Cancelled)
- Proposal detail view

## Deployment

### Vercel
```bash
npm install -g vercel
vercel
```

### Netlify
```bash
npm install -g netlify-cli
netlify deploy
```













