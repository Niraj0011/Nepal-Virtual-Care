
from pathlib import Path
from datetime import timedelta

from decouple import config, Csv
from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).resolve().parent.parent


# =========================================
# SECURITY
# =========================================

SECRET_KEY = config(
    "SECRET_KEY",
    default="unsafe-development-key-change-me",
)

DEBUG = config("DEBUG", default=True, cast=bool)

if not DEBUG and SECRET_KEY == "unsafe-development-key-change-me":
    raise ImproperlyConfigured(
        "Set a secure SECRET_KEY in your environment before production."
    )

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="127.0.0.1,localhost",
    cast=Csv(),
)


# =========================================
# APPLICATIONS
# =========================================

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",

    "accounts",
    "care",
    "community",
    "resources",
]


# =========================================
# MIDDLEWARE
# =========================================

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


# =========================================
# URLS AND APPLICATION CONFIGURATION
# =========================================

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"


# =========================================
# DATABASE
# =========================================

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME", default="nepal_virtual_care"),
        "USER": config("DB_USER", default="postgres"),
        "PASSWORD": config("DB_PASSWORD", default=""),
        "HOST": config("DB_HOST", default="127.0.0.1"),
        "PORT": config("DB_PORT", default="5432"),
    }
}


# =========================================
# PASSWORD VALIDATION
# =========================================

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "MinimumLengthValidator"
        ),
        "OPTIONS": {
            "min_length": 8,
        },
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "CommonPasswordValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "NumericPasswordValidator"
        ),
    },
]


# =========================================
# INTERNATIONALIZATION
# =========================================

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Asia/Kathmandu"

USE_I18N = True
USE_TZ = True


# =========================================
# STATIC AND MEDIA FILES
# =========================================

STATIC_URL = "static/"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# =========================================
# CORS AND CSRF
# =========================================

CORS_ALLOWED_ORIGINS = config(
    "FRONTEND_ORIGIN",
    default="http://localhost:5173,http://127.0.0.1:5173",
    cast=Csv(),
)

CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="",
    cast=Csv(),
)


# =========================================
# DJANGO REST FRAMEWORK
# =========================================

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "login": "5/minute",
        "otp_verify": "5/minute",
    },
}


# =========================================
# JWT AUTHENTICATION
# =========================================

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}


# =========================================
# EMAIL CONFIGURATION
# =========================================

EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend",
)

EMAIL_HOST = config("EMAIL_HOST", default="smtp.gmail.com")

EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)

EMAIL_USE_TLS = config(
    "EMAIL_USE_TLS",
    default=True,
    cast=bool,
)

EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")

EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")

DEFAULT_FROM_EMAIL = config(
    "DEFAULT_FROM_EMAIL",
    default="Nepal Virtual Care <noreply@nepalvirtualcare.local>",
)

FRONTEND_URL = config(
    "FRONTEND_URL",
    default="http://localhost:5173",
).rstrip("/")

EMAIL_VERIFICATION_TOKEN_TTL_HOURS = config(
    "EMAIL_VERIFICATION_TOKEN_TTL_HOURS",
    default=24,
    cast=int,
)


# =========================================
# BROWSER SECURITY
# =========================================

SECURE_CONTENT_TYPE_NOSNIFF = True

X_FRAME_OPTIONS = "DENY"

SECURE_REFERRER_POLICY = "same-origin"

SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

SECURE_SSL_REDIRECT = config(
    "SECURE_SSL_REDIRECT",
    default=False,
    cast=bool,
)

SECURE_HSTS_SECONDS = config(
    "SECURE_HSTS_SECONDS",
    default=0,
    cast=int,
)

SECURE_HSTS_INCLUDE_SUBDOMAINS = config(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=False,
    cast=bool,
)

SECURE_HSTS_PRELOAD = config(
    "SECURE_HSTS_PRELOAD",
    default=False,
    cast=bool,
)
# =========================================
# VIDEOSDK VIDEO CONSULTATIONS
# =========================================

VIDEOSDK_API_KEY = config("VIDEOSDK_API_KEY", default="")
VIDEOSDK_SECRET = config("VIDEOSDK_SECRET", default="")