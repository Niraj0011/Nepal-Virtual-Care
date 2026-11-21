# Nepal Virtual Care — Django + PostgreSQL backend

This backend is designed around the supplied React/Vite frontend. It provides API foundations for registration/login, provider search, appointment requests, community posts/likes, patient profile, consent preferences, and health-information resources.

> Important: the four providers and four learning resources are imported as demo/sample data from the frontend. They are not verified clinical listings or medical advice. This starter is not ready for real patient data or clinical deployment. Before production, complete security/privacy review, access-control testing, audit logging, backups, encryption, consent/legal review, and clinical/provider verification.

## 1. Requirements
- Python 3.10+
- PostgreSQL installed and running
- Node frontend remains separate

## 2. Create database
Open PostgreSQL (pgAdmin or psql) and create a database named `nepal_virtual_care`. Example SQL:

```sql
CREATE DATABASE nepal_virtual_care;
```

Use your own PostgreSQL username/password in `.env`.

## 3. Install and configure
From this backend folder:

```bash
python -m venv venv
```

Windows:
```powershell
venv\Scripts\activate
```

macOS/Linux:
```bash
source venv/bin/activate
```

Then:
```bash
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and set your PostgreSQL password and a strong SECRET_KEY.

## 4. Create tables and demo data
```bash
python manage.py migrate
python manage.py seed_demo_data
python manage.py createsuperuser
```

## 5. Start server
```bash
python manage.py runserver
```

API base URL: `http://127.0.0.1:8000/api/`

Health check: `GET /api/health/`

Admin: `http://127.0.0.1:8000/admin/`

## API endpoints

### Authentication
- `POST /api/auth/register/` — `first_name`, `last_name`, `email`, `username`, `password`, `password_confirm`
- `POST /api/auth/token/` — `username`, `password`; returns JWT access and refresh tokens
- `POST /api/auth/token/refresh/` — `refresh`
- `GET/PATCH /api/auth/me/` — authenticated patient profile
- `GET/PUT /api/auth/consent/` — authenticated consent preferences

### Care
- `GET /api/providers/` — optional `?search=...&specialty=...`
- `GET/POST /api/appointments/` — authenticated; POST fields: `provider`, `preferred_date` (`YYYY-MM-DD`), `consultation_type`, `reason`

### Community
- `GET/POST /api/community/posts/` — read is public; create requires login
- `POST /api/community/posts/{id}/like/` — authenticated toggle-like endpoint

### Health information
- `GET /api/resources/` — published learning resources

## Frontend integration notes
The frontend currently stores demo users and appointment requests in `localStorage`. Replace those local operations with API calls:
1. On registration, POST to `/api/auth/register/`.
2. On login, POST to `/api/auth/token/`; keep tokens in an appropriately secured strategy. For a production healthcare system, prefer secure, HttpOnly cookies over localStorage and add refresh/logout handling.
3. Send `Authorization: Bearer <access>` for protected endpoints.
4. Load provider cards from `/api/providers/`.
5. Submit booking forms to `/api/appointments/`.
6. Load and create community posts from `/api/community/posts/`; like with `/like/`.
7. Load patient data from `/api/auth/me/` and appointments from `/api/appointments/`.

The supplied frontend fields will need small mapping changes: its appointment object currently uses `provider` as a provider name, `date`, and `type`; the API expects provider ID, `preferred_date`, and `consultation_type`. Registration also needs a unique `username` (you can derive it from email on the frontend or add a server-side username strategy).

CORS allows `http://localhost:5173` by default. Change `FRONTEND_ORIGIN` for another frontend origin.
