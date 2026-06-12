# AI Context - Splitwise Clone

This document serves as the single source of truth for the Splitwise Clone application. It specifies all technical decisions, architecture, database schema, APIs, and user interface details.

---

## 1. Product Understanding & Scope

### Goals
Build a simplified, highly functional Splitwise clone that allows users to manage shared expenses, divide costs, track balances, chat within expenses, and record payments/settlements.

### Scope & MVP Features
1. **User Authentication**: Sign up, login, and token-based authentication (JWT).
2. **Group Management**:
   - Create groups.
   - Add/invite users to groups (via email or username lookup).
   - Remove users from groups (only allowed if the user's group balance is $0.00).
3. **Expense Management**:
   - Create, edit, and delete expenses within groups.
   - Support four split types:
     1. **Equally**: Divides cost equally among all selected members.
     2. **Unequally**: Explicit decimal amounts specified for each member.
     3. **Percentage**: Percentage shares that must sum to 100%.
     4. **Share**: Ratios (shares) that determine proportional distribution.
   - Real-time expense chat/activity log for each expense (using 3-second polling to ensure deployment reliability without WebSockets overhead).
4. **Balances & Settlements**:
   - Group-level balances: Display how much each member owes/is owed.
   - Individual balance summary: Show net positive/negative balances.
   - Debt Simplification: Match debtors and creditors inside a group to minimize transactions.
   - Record settlements: Record payments between members (e.g., "User A paid User B $X").

### Out-of-Scope Features
- Multi-currency support (standardizing on a single currency, e.g., USD `$`).
- Receipt OCR scanning or image attachments.
- Email or push notifications.
- Recurring expenses.

---

## 2. Tech Stack

- **Backend**: Python 3.10 + Django 4.2+ + Django REST Framework (DRF)
- **Database**: SQLite (relational database, robust and easily portable)
- **Frontend**: React (Vite-based) + Vanilla CSS (Aesthetic glassmorphism/dark mode) + Lucide Icons
- **Real-Time Communication**: HTTP Polling (every 3 seconds) for the chat inside expenses
- **Authentication**: JWT authentication (`djangorestframework-simplejwt`)

---

## 3. Database Schema

The database will consist of the following relational tables:

### User (Django standard auth_user)
- `id` (int, PK)
- `username` (varchar)
- `email` (varchar)
- `password` (varchar)
- `first_name` (varchar)
- `last_name` (varchar)

### Group
- `id` (int, PK)
- `name` (varchar)
- `description` (text)
- `created_at` (datetime)
- `created_by_id` (int, FK to User)

### GroupMember
- `id` (int, PK)
- `group_id` (int, FK to Group)
- `user_id` (int, FK to User)
- `joined_at` (datetime)
- *Unique constraint on (group_id, user_id)*

### Expense
- `id` (int, PK)
- `group_id` (int, FK to Group)
- `description` (varchar)
- `amount` (decimal, 10, 2)
- `paid_by_id` (int, FK to User)
- `split_type` (varchar: 'EQUALLY', 'UNEQUALLY', 'PERCENTAGE', 'SHARE')
- `created_at` (datetime)
- `created_by_id` (int, FK to User)

### ExpenseSplit
- `id` (int, PK)
- `expense_id` (int, FK to Expense, on delete cascade)
- `user_id` (int, FK to User)
- `amount` (decimal, 10, 2)  -- The actual calculated amount owed
- `split_value` (decimal, 10, 2) -- The raw split input (percent, share, or amount)
- *Unique constraint on (expense_id, user_id)*

### Settlement
- `id` (int, PK)
- `group_id` (int, FK to Group)
- `payer_id` (int, FK to User)
- `payee_id` (int, FK to User)
- `amount` (decimal, 10, 2)
- `created_at` (datetime)
- `created_by_id` (int, FK to User)

### ChatMessage
- `id` (int, PK)
- `expense_id` (int, FK to Expense, on delete cascade)
- `user_id` (int, FK to User)
- `message` (text)
- `created_at` (datetime)

### EmailOTP
- `id` (int, PK)
- `email` (varchar, unique)
- `otp` (varchar)
- `created_at` (datetime)

---

## 4. API Design

All endpoints prefixed with `/api/`. JWT Bearer tokens expected in `Authorization` header.

### Auth
- `POST /api/auth/register/` - Register a new user
- `POST /api/auth/login/` - Login and get JWT token (access/refresh)
- `GET /api/auth/user/` - Get current user profile
- `POST /api/auth/send-otp/` - Send a 6-digit OTP code to email
- `POST /api/auth/verify-otp/` - Verify OTP and obtain JWT tokens (registers user automatically if they don't exist)


### Groups
- `GET /api/groups/` - List groups the user belongs to
- `POST /api/groups/` - Create a group
- `GET /api/groups/<id>/` - Retrieve group details, members, and group-level balances
- `POST /api/groups/<id>/add-member/` - Add/invite user by username or email
- `POST /api/groups/<id>/remove-member/` - Remove user (fails if user has non-zero balance)

### Expenses
- `GET /api/groups/<group_id>/expenses/` - List expenses in a group
- `POST /api/groups/<group_id>/expenses/` - Create a new expense (requires validating splits sum to total)
- `GET /api/expenses/<id>/` - Retrieve individual expense details
- `PUT /api/expenses/<id>/` - Update an expense
- `DELETE /api/expenses/<id>/` - Delete an expense

### Settlements
- `POST /api/groups/<group_id>/settle/` - Record a settlement payment

### Chat
- `GET /api/expenses/<expense_id>/messages/` - Get chat messages for an expense
- `POST /api/expenses/<expense_id>/messages/` - Post a new chat message

---

## 5. Engineering Requirements & Algorithms

### Balance Calculation Formula
For each user $U$ in group $G$, their net balance is computed as:
$$\text{Net Balance}(U) = \text{TotalPaid}(U) - \text{TotalOwed}(U) + \text{SettlementPayer}(U) - \text{SettlementPayee}(U)$$
Where:
- $\text{TotalPaid}(U)$ = Sum of `amount` of all Expenses in group $G$ where `paid_by` = $U$
- $\text{TotalOwed}(U)$ = Sum of `amount` of all ExpenseSplits for Expenses in group $G$ where `user` = $U$
- $\text{SettlementPayer}(U)$ = Sum of Settlements in group $G$ where `payer` = $U$
- $\text{SettlementPayee}(U)$ = Sum of Settlements in group $G$ where `payee` = $U$

### Debt Simplification Algorithm
To calculate who owes whom:
1. Compute the net balance of every user in the group.
2. Separate users into two lists:
   - **Debtors** (negative balance) sorted by ascending balance (most negative first).
   - **Creditors** (positive balance) sorted by descending balance (most positive first).
3. Greedily match the largest debtor with the largest creditor:
   - Let $D$ be the largest debtor with debt amount $V_D > 0$.
   - Let $C$ be the largest creditor with credit amount $V_C > 0$.
   - Match transaction amount $M = \min(V_D, V_C)$.
   - Add transaction: $D \text{ owes } C \text{ amount } M$.
   - Update $V_D = V_D - M$ and $V_C = V_C - M$.
   - Re-sort/update lists and repeat until all balances are near zero.

---

## 6. Frontend Structure

A single-page application (SPA) with a responsive dashboard:
- **Theme**: Premium dark mode with frosted-glass effect (glassmorphism), neon accents (emerald for owed/green, rose for owing/red), and smooth animations.
- **Views**:
  - `Login/Register`: Custom modern auth forms.
  - `Dashboard`: Lists all groups, overall net balance summary, and overall settlements due.
  - `Group Detail`: Group activity log, member list (with edit/remove actions), group balances, and action buttons ("Add Expense", "Settle Debt").
  - `Expense Detail & Chat`: Side-panel/detail modal showing details, how it was split, and the real-time chat feed.

---

## 7. Deployment Plan

- **Backend (Django)**: Hosted on Render (running gunicorn server).
- **Database (PostgreSQL)**: Relational PostgreSQL instance (via Render or Neon).
- **Frontend (Vite/React)**: Hosted on Vercel.
- **Proxy Configuration**: Vercel `vercel.json` rewrites proxy `/api/` calls to the Render backend domain, bypassing CORS errors.

