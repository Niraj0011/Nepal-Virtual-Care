# Nepal Virtual Care — React Frontend

A responsive frontend prototype inspired by the supplied Virtual Care reference. Built with React 18, Vite, React Router and Lucide icons.

## Requirements
- Node.js 18 or newer (npm included)

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite (usually http://localhost:5173).

## Production build
```bash
npm run build
npm run preview
```

## Pages
- `/` Home
- `/virtual-care` provider directory, search, specialty filter and demo consultation request
- `/health-information` educational resource cards
- `/community` sample discussions and local post creation
- `/register` and `/login` demo authentication
- `/records` patient overview, profile, documents, consultation requests and consent

## Project structure
```text
src/
  components/   Shared layout, provider card and booking modal
  context/      Shared demo user and appointment state
  data/         Sample provider records
  pages/        Route-level pages
  App.jsx       Routes and providers
  main.jsx      React entry point
  styles.css    Responsive application styles
```

## Important limitations
This is a frontend demonstration. Authentication and appointment requests use browser LocalStorage only. There is no real API, server, database, video call, payment or medical-record storage. All providers and document records are sample data. Do not enter real patient information or credentials. A production healthcare system needs secure backend services, access controls, audit logs, consent workflows and privacy/security review.
