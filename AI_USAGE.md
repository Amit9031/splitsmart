# AI_USAGE.md - AI Collaboration & Debugging Log

This document lists the AI tools used, key prompts, and details three concrete cases where the AI's initial code/configuration caused errors, how those errors were detected, and how they were resolved.

---

## 🤖 AI Tools Used
- **Antigravity**: Google DeepMind's advanced agentic AI coding assistant, running natively inside the workspace to write code, execute commands, run tests, and manage deployments.

---

## 📝 Key Prompts

### 1. Scoping and Initial Setup Prompt
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

### 3. Production Deployment Issue Troubleshooting
```text
it is working fine in localhost but after deployment it is not working
```

---

## 🐛 Debugging Log (AI Anomaly & Error Cases)

Below are three concrete cases where the AI's generated configurations/code failed in production, how the errors were detected, and how they were resolved.

### Case 1: Vercel Router Rewrites Syntax (HTTP 405 Method Not Allowed)
*   **Initial AI Output**: The AI configured API routing proxy rewrites in `vercel.json` using wildcard parameters:
    ```json
    {
      "rewrites": [
        { "source": "/api/:path*", "destination": "https://splitsmart-6jn1.onrender.com/api/:path*" }
      ]
    }
    ```
*   **The Problem**: This syntax is supported in Next.js projects but is ignored or parsed incorrectly by Vercel's standard routing engine for static Single-Page Apps (SPAs). As a result, POST requests to `/api/auth/...` were not proxied; instead, they fell through to Vercel's static router, which attempted to serve `index.html` (yielding an HTTP `405 Method Not Allowed` error).
*   **How We Caught It**: When attempting to sign up or request an OTP, the console network inspector displayed a `405 Method Not Allowed` response from the Vercel proxy.
*   **How We Fixed It**: Re-wrote `vercel.json` to utilize standard regex capturing groups:
    ```json
    {
      "rewrites": [
        { "source": "/api/(.*)", "destination": "https://splitsmart-6jn1.onrender.com/api/$1" }
      ]
    }
    ```
    This forced Vercel to correctly capture the sub-path and forward it to Render.

---

### Case 2: Unmapped Root Route for Render Health Checks (Container Termination)
*   **Initial AI Output**: The AI configured all API endpoints under `/api/` in `splitwise_clone/urls.py` but left the root URL `/` unmapped.
*   **The Problem**: Render's automated health checkers ping the root `/` path of a web service to determine if the container started successfully. Because the root path returned `404 Not Found`, Render flagged the deployment as unhealthy and terminated the container with a `term` signal immediately after startup.
*   **How We Caught It**: Render logs displayed requests to `GET /` returning `404`, followed immediately by a Gunicorn shutdown:
    ```text
    [INFO] Handling signal: term
    [INFO] Worker exiting (pid: 60)
    ```
*   **How We Fixed It**: Added a simple JSON `home_view` mapping directly to the root path `/` in `splitwise_clone/urls.py`:
    ```python
    def home_view(request):
        return JsonResponse({'status': 'ok', 'message': 'SplitSmart API is running'})
    ```
    This returns a `200 OK` status, satisfying Render's health check requirements.

---

### Case 3: Blocked SMTP Ports on Render Free Tier (Gunicorn Request Hanging)
*   **Initial AI Output**: The AI configured Django to connect directly to Gmail's SMTP server on port `587` to send verification OTP emails, returning an HTTP `500` error if it failed.
*   **The Problem**: Render's free hosting tier blocks all outbound TCP traffic on traditional SMTP ports (`25`, `465`, and `587`) to prevent abuse. Because the SMTP client had no connection timeout configured, the connection hung indefinitely. This caused Gunicorn to hit its default `30` second worker timeout, killing the process and throwing a generic HTML error page before Django's try-except block could execute.
*   **How We Caught It**: Requesting an OTP on the live frontend caused the request to hang for ~30 seconds, returning an HTML `502 Bad Gateway` page from Gunicorn instead of a JSON response.
*   **How We Fixed It**: 
    1. Added `EMAIL_TIMEOUT = 5` in `splitwise_clone/settings.py` so the connection times out fast, avoiding Gunicorn worker restarts.
    2. Modified `SendOTPView` to catch the connection timeout exception, save a sandbox fallback OTP code `'123456'` in the database for the user, and return a clean `200 OK` response with a warning message:
       ```json
       {
         "success": "OTP code generated in sandbox mode.",
         "warning": "Render Free Tier blocks outbound SMTP. Please use fallback verification code: 123456"
       }
       ```
    3. Updated the React frontend `Auth.jsx` to render the warning text in the success notice box so the user immediately knows to enter `123456` to authenticate.
