# SplitSmart - Splitwise Clone

A premium, modern Splitwise clone built using Python (Django REST Framework) and React (Vite). It features multi-split calculations (equal, unequal, percentage, share), a real-time short-polling chat inside expenses, greedy debt simplification, and group balance analytics.

---

## 🛠️ Technology Stack

- **Backend**: Python 3.10+, Django 4.2+, Django REST Framework (DRF), SimpleJWT (Auth)
- **Database**: SQLite (Relational DB)
- **Frontend**: React 18 (Vite, Javascript), Vanilla CSS (Frosted glassmorphism theme), Lucide Icons
- **Real-time Sync**: HTTP Short Polling (3 seconds)

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+ installed
- Node.js (v18+) and npm installed

### 1. Backend Setup & Run

1. Open a terminal in the `backend/` directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment and activate it:
   - **Windows PowerShell**:
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   - **macOS/Linux**:
     ```bash
     python -m venv venv
     source venv/bin/activate
     ```

3. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```

4. Run database migrations:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

5. Run unit tests to verify:
   ```bash
   python manage.py test
   ```

6. Start the Django development server:
   ```bash
   python manage.py runserver
   ```
   *The backend will run on `http://127.0.0.1:8000/`.*

---

### 2. Frontend Setup & Run

1. Open a new terminal in the `frontend/` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite React development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on `http://localhost:3000/`.*

---

## 🧪 Running Backend Unit Tests

You can run automated tests checking split math, member removal validation, settlements, and debt simplification by running:
```bash
python backend/manage.py test
```

## 🌐 Production Deployment Guide

We have added all necessary configuration files (`Procfile`, `vercel.json`, `django-database-url`, and `whitenoise`) to make deployment straightforward.

### 1. Deploy Backend (Render)
1. Go to [Render](https://render.com).
2. Create a **New PostgreSQL** Database. Copy the **External Database URL**.
3. Create a **New Web Service**:
   - Connect your GitHub repository.
   - Set **Root Directory** to `backend`.
   - Set **Build Command**: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
   - Set **Start Command**: `gunicorn splitwise_clone.wsgi`
   - Add **Environment Variables**:
     - `DATABASE_URL`: (Your Render PostgreSQL Database URL)
     - `EMAIL_HOST_USER`: `amitrajr7@gmail.com`
     - `EMAIL_HOST_PASSWORD`: `vfom maee xnax sjfr`
     - `SECRET_KEY`: (Any random security key string)
4. Deploy the service and copy the provided Web Service URL (e.g. `https://splitsmart-backend.onrender.com`).

### 2. Deploy Frontend (Vercel)
1. Go to [Vercel](https://vercel.com).
2. Create a **New Project** and import your GitHub repository.
3. Configure settings:
   - Set **Root Directory** to `frontend`.
   - Set **Framework Preset** to `Vite`.
4. Open the code in your editor, open `frontend/vercel.json`, and replace `https://splitsmart-backend.onrender.com` with your actual Render Web Service URL.
5. Commit and push this change to GitHub:
   ```bash
   git add frontend/vercel.json
   git commit -m "Update backend API proxy URL"
   git push
   ```
6. Vercel will automatically redeploy the frontend. Your app is now live!

---


## 🤖 AI Collaboration Process

- **AI Tool Used**: **Antigravity** (Google DeepMind advanced AI coding assistant).
- **Core Strategy**:
  - Initial Interview: The AI prompted questions about edge cases, DB schema, auth types, and screen specs, and captured it in [AI_CONTEXT.md](file:///c:/Users/Amit%20Ranjan/OneDrive/Documents/drive%20assignment/AI_CONTEXT.md).
  - Test-Driven Validation: Backend functions and split math were fully validated using unit tests before integration.
  - Premium Styling: Vanilla CSS was used to create a bespoke, gorgeous dark-mode experience with smooth hover animations.

---

## 📝 Key Prompts Used

### 1. Project Initialization Prompt
```text
You are a junior engineer helping me complete an internship assignment.
The assignment is to reverse engineer Splitwise, scope a realistic 3-day version,
and build a working deployed app.
Important instructions:
1. Do not assume product requirements...
[full prompt pasted from assignment sheet]
```

### 2. End-to-End Build Prompt
```text
please create the whole project end to end
```
