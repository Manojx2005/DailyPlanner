<div align="center">
  <img src="icon.svg" width="100" height="100" alt="Day Planner Logo">
  <h1>Daily Planner</h1>
  <p><strong>A beautifully crafted, modern day planner and life organizer PWA.</strong></p>

  <p>
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#deployment">Deployment</a>
  </p>
</div>

---

## 🌟 Overview

**Daily Planner** is a comprehensive, mobile-first Progressive Web App (PWA) designed to organize your daily life. It features a premium, modern design with smooth micro-animations, glassmorphism, and a meticulously crafted Navy & Mint color palette. The app works offline and uses Firebase Firestore to seamlessly sync your data across all your devices.

Whether you're scheduling tasks, tracking finances, planning your meals, or managing groceries, Daily Planner keeps everything in one elegant dashboard.

## ✨ Features

### 📅 Schedule & Week View
- **Interactive Timeline**: Visual blocks for Fixed, Meal, Study, Project, and Chore tasks.
- **Drag & Drop**: Easily reorganize tasks via an intuitive interface.
- **Week Overview**: A high-level overview of the week, with integrated stats and completion rings.
- **Calendar Export**: Export your schedule to a standard `.ics` file for Google/Apple Calendar.

### 💰 Finance Tracking
- **Income & Expenses**: Track fixed and variable costs.
- **Credit Cards**: Monitor card limits and track utilization via visual progress bars.
- **Receipt Parsing**: Built-in receipt scanner logic with total calculation and UI rendering.

### 🍱 Meal & Nutrition Planner
- **Meal Scheduler**: Plan Breakfast, Lunch, Dinner, and Snacks.
- **Nutrition Tracking**: View kcal & macros (Protein, Carbs, Fats) dynamically calculated per meal.
- **Recipe Management**: Store and pick from an expanding library of structured recipes.

### 🛒 Smart Shopping List
- **Checklists**: Dynamic to-do shopping items with strike-through completions.
- **Tax Calculation**: Automated pre-tax and post-tax cost estimations based on 8%/10% thresholds.

### ⚡ PWA & Offline Support
- Fully installable Progressive Web App (PWA).
- **Service Worker** caching allows reading your plans even without an internet connection.
- Multi-language UI support (i18n).

## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla JavaScript (ES Modules), Custom Vanilla CSS (No bloated frameworks).
- **Architecture**: Modular JS (`app.js`, `finance.js`, `shopping.js`, `meals.js`, `schedule.js`).
- **Backend & Sync**: Firebase Auth & Firestore (v11 Modular SDK).
- **Deployment**: Configured for GitHub Pages.
- **Testing**: Native Node.js test runner (`node --test`).

## 🚀 Getting Started

### Prerequisites
- A modern web browser.
- A Firebase project with Firestore enabled (if you want live cloud syncing).

### Local Setup
1. **Clone the repository:**
   ```bash
   git clone https://github.com/Manojx2005/DailyPlanner.git
   cd DailyPlanner
   ```
2. **Configure Firebase (Optional but recommended):**
   Copy `config.example.js` to `firebase-config.js` and input your actual Firebase API keys:
   ```javascript
   export const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_AUTH_DOMAIN",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_STORAGE_BUCKET",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```
3. **Run locally:**
   Since this uses ES modules, you must serve it over an HTTP server.
   ```bash
   npx serve .
   ```
   Open `http://localhost:3000` in your browser.

## 🌐 Deployment

This application is ready to be deployed to **GitHub Pages**! 
Because it is a purely client-side static application, you can host it anywhere. Your database rules (`firestore.rules`) can be separately deployed using the Firebase CLI:
```bash
firebase deploy --only firestore
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
