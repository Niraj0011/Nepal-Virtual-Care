
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  HeartPulse,
  ShieldCheck,
  MailCheck,
  ArrowRight,
  Inbox,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  KeyRound,
} from 'lucide-react';

import { useApp } from '../context/AppContext';
import {
  registerPatient,
  loginPatient,
  verifyLoginOTP,
  resendVerificationEmail,
} from '../api';

function getDashboardPath(role) {
  if (role === 'doctor') return '/doctor-dashboard';
  if (role === 'admin') return '/admin-dashboard';
  if (role === 'patient') return '/dashboard';

  return '/account-unavailable';
}

export default function Auth({ mode = 'register' }) {
  const isRegister = mode === 'register';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');

  const [otpStep, setOtpStep] = useState(false);
  const [otpChallenge, setOtpChallenge] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);

  const { setUser } = useApp();
  const navigate = useNavigate();

  const completeSignIn = (profile) => {
    const role = (profile.role || '').toLowerCase();

    if (!['patient', 'doctor', 'admin'].includes(role)) {
      setUser(null);
      navigate('/account-unavailable', { replace: true });
      return;
    }

    const fullName = [
      profile.first_name,
      profile.last_name,
    ].filter(Boolean).join(' ');

    setUser({
      ...profile,
      id: profile.id,
      username: profile.username,
      name: fullName || profile.username,
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      date_joined: profile.date_joined,
      phone: profile.phone || '',
      city: profile.city || '',
      role,
    });

    navigate(getDashboardPath(role), { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (isRegister) {
        if (!name.trim()) {
          throw new Error('Please enter your full name.');
        }

        await registerPatient({
          name: name.trim(),
          email: normalizedEmail,
          password,
        });

        setRegisteredEmail(normalizedEmail);
        setRegistrationComplete(true);
        return;
      }

      const profile = await loginPatient(normalizedEmail, password);

      if (profile.requires_otp) {
        if (!profile.challenge) {
          throw new Error(
            'Unable to start email verification. Please try signing in again.'
          );
        }

        setOtpChallenge(profile.challenge);
        setOtpCode('');
        setRememberDevice(false);
        setOtpStep(true);
        return;
      }

      completeSignIn(profile);

    } catch (err) {
      setError(
        err.message || 'Unable to continue. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError('');

    const normalizedCode = otpCode.trim();

    if (!/^\d{6}$/.test(normalizedCode)) {
      setError('Please enter the complete six-digit verification code.');
      return;
    }

    setLoading(true);

    try {
      const profile = await verifyLoginOTP(
        otpChallenge,
        normalizedCode,
        rememberDevice
      );

      completeSignIn(profile);

    } catch (err) {
      setError(
        err.message || 'Unable to verify the code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const returnToPasswordLogin = () => {
    if (loading) return;

    setOtpStep(false);
    setOtpChallenge('');
    setOtpCode('');
    setRememberDevice(false);
    setError('');
  };

  const handleResendVerification = async () => {
    if (resending || !registeredEmail) return;

    setResending(true);
    setResendMessage('');
    setResendError('');

    try {
      const response = await resendVerificationEmail(registeredEmail);

      setResendMessage(
        response.detail ||
          'If your account requires verification, a new email has been sent.'
      );
    } catch (err) {
      setResendError(
        err.message ||
          'Unable to resend the verification email. Please try again.'
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <section className="auth-section">
      <div className="auth-card">
        <div className="auth-icon">
          <HeartPulse size={28} />
        </div>

        <span className="eyebrow">PATIENT PORTAL</span>

        {registrationComplete ? (
          <div className="registration-success">
            <div className="auth-success-icon">
              <MailCheck size={38} />
            </div>

            <h1>Check your email</h1>

            <p className="muted">
              Your account has been created successfully.
              Before signing in, please verify your email address.
            </p>

            <div className="registration-email-box">
              <div className="registration-email-icon">
                <Inbox size={22} />
              </div>

              <div>
                <strong>Verification email sent to</strong>
                <p>{registeredEmail}</p>
              </div>
            </div>

            <p className="registration-instructions">
              Open the verification link in your email to activate
              your account. The link expires after 24 hours.
            </p>

            <a
              href="/login"
              className="btn-primary registration-continue-button"
            >
              Continue to sign in
              <ArrowRight size={18} />
            </a>

            <div className="registration-resend">
              <p className="registration-help">
                Didn't receive the email? Check your spam or junk folder.
              </p>

              <button
                type="button"
                className="registration-resend-button"
                onClick={handleResendVerification}
                disabled={resending}
              >
                {resending ? (
                  <>
                    <RefreshCw
                      size={17}
                      className="registration-resend-spinner"
                    />
                    Sending...
                  </>
                ) : (
                  <>
                    <RefreshCw size={17} />
                    Resend verification email
                  </>
                )}
              </button>

              {resendMessage && (
                <p className="registration-resend-success" role="status">
                  <CheckCircle2 size={17} />
                  {resendMessage}
                </p>
              )}

              {resendError && (
                <p className="registration-resend-error" role="alert">
                  <AlertCircle size={17} />
                  {resendError}
                </p>
              )}
            </div>

            <div className="registration-divider">
              <span>ACCOUNT SECURITY</span>
            </div>

            <p className="registration-security">
              <ShieldCheck size={17} />
              Your account becomes active only after email verification.
            </p>
          </div>
        ) : otpStep ? (
          <div className="otp-verification">
            <div className="otp-verification-icon">
              <KeyRound size={34} />
            </div>

            <h1>Verify your identity</h1>

            <p className="muted">
              We sent a six-digit verification code to your
              registered email address.
            </p>

            <div className="otp-information">
              <MailCheck size={20} />
              <span>
                Email verification is required for doctor and administrator
                accounts.
              </span>
            </div>

            <form
              className="form-stack"
              onSubmit={handleOTPSubmit}
              autoComplete="off"
            >
              <label>
                Six-digit verification code

                <input
                  type="text"
                  name="otp"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(
                      e.target.value.replace(/\D/g, '').slice(0, 6)
                    );
                    setError('');
                  }}
                  placeholder="000000"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  autoFocus
                />
              </label>

              <label className="otp-remember-device">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  disabled={loading}
                />

                <span>
                  <strong>Remember this device for 30 days</strong>
                  <small>
                    You won't need an email verification code next time
                    you sign in on this browser.
                  </small>
                </span>
              </label>

              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}

              <button
                className="btn-primary"
                type="submit"
                disabled={loading || otpCode.length !== 6}
              >
                {loading ? 'Verifying...' : 'Verify and sign in'}
                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            <p className="otp-expiry-note">
              Your verification code expires after five minutes
              and can only be used once.
            </p>

            <button
              type="button"
              className="otp-back-button"
              onClick={returnToPasswordLogin}
              disabled={loading}
            >
              Back to password login
            </button>
          </div>
        ) : (
          <>
            <h1>
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h1>

            <p className="muted">
              {isRegister
                ? 'A more connected way to explore your health journey.'
                : 'Sign in to access your health dashboard.'}
            </p>

            <form
              className="form-stack"
              onSubmit={submit}
              autoComplete="on"
            >
              {isRegister && (
                <label>
                  Full name
                  <input
                    type="text"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    required
                    maxLength={150}
                    autoComplete="name"
                  />
                </label>
              )}

              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    isRegister ? 'Create a password' : 'Your password'
                  }
                  required
                  minLength={8}
                  autoComplete={
                    isRegister ? 'new-password' : 'current-password'
                  }
                />
              </label>

              {!isRegister && (
                <div className="forgot-password-link">
                  <Link to="/forgot-password">
                    Forgot password?
                  </Link>
                </div>
              )}

              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}

              <button
                className="btn-primary"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? 'Please wait...'
                  : isRegister
                    ? 'Create account'
                    : 'Sign in'}
              </button>
            </form>

            <p className="auth-switch">
              {isRegister
                ? 'Already have an account?'
                : 'New to Nepal Virtual Care?'}
              {' '}
              <Link to={isRegister ? '/login' : '/register'}>
                {isRegister ? 'Sign in' : 'Create an account'}
              </Link>
            </p>
          </>
        )}

        <div className="auth-note">
          <ShieldCheck size={17} />
          Your account is managed securely by Django.
        </div>
      </div>

      <style>
        {`
          .forgot-password-link {
            display: flex;
            justify-content: flex-end;
            margin-top: -12px;
            margin-bottom: 2px;
            font-size: 13px;
            font-weight: 600;
          }

          .forgot-password-link a {
            color: #087e8b;
            text-decoration: none;
          }

          .forgot-password-link a:hover {
            text-decoration: underline;
          }

          .registration-success,
          .otp-verification {
            text-align: center;
          }

          .registration-email-box {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 17px;
            margin: 25px 0 18px;
            background: #f0f8fa;
            border: 1px solid #d9ecef;
            border-radius: 13px;
            text-align: left;
          }

          .registration-email-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 45px;
            height: 45px;
            flex-shrink: 0;
            border-radius: 12px;
            color: #087e8b;
            background: #dff1f3;
          }

          .registration-email-box strong {
            display: block;
            color: #526b7b;
            font-size: 12px;
            margin-bottom: 5px;
          }

          .registration-email-box p {
            margin: 0;
            color: #183449;
            font-size: 14px;
            font-weight: 700;
            overflow-wrap: anywhere;
          }

          .registration-instructions {
            color: #687b89;
            font-size: 14px;
            line-height: 1.8;
            margin: 18px 0;
          }

          .registration-continue-button {
            width: 100%;
            min-height: 52px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            box-sizing: border-box;
            text-decoration: none;
            cursor: pointer;
          }

          .registration-help {
            color: #718390;
            font-size: 12px;
            line-height: 1.7;
            margin: 18px 0 10px;
          }

          .registration-resend {
            margin-top: 8px;
          }

          .registration-resend-button {
            width: 100%;
            min-height: 46px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 9px;
            border: 1px solid #cfe5e9;
            border-radius: 10px;
            background: #f0f8fa;
            color: #087e8b;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.2s ease;
          }

          .registration-resend-button:hover:not(:disabled) {
            background: #e2f2f4;
          }

          .registration-resend-button:disabled {
            opacity: 0.65;
            cursor: not-allowed;
          }

          .registration-resend-spinner {
            animation: registration-resend-spin 1s linear infinite;
          }

          @keyframes registration-resend-spin {
            to {
              transform: rotate(360deg);
            }
          }

          .registration-resend-success,
          .registration-resend-error {
            display: flex;
            align-items: flex-start;
            justify-content: center;
            gap: 8px;
            font-size: 12px;
            line-height: 1.7;
            margin: 13px 0 0;
            overflow-wrap: anywhere;
          }

          .registration-resend-success {
            color: #176b48;
          }

          .registration-resend-error {
            color: #bd4035;
          }

          .registration-resend-success svg,
          .registration-resend-error svg {
            flex-shrink: 0;
            margin-top: 2px;
          }

          .registration-divider {
            display: flex;
            align-items: center;
            gap: 12px;
            margin: 24px 0 15px;
            color: #9aa8b1;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1.2px;
          }

          .registration-divider::before,
          .registration-divider::after {
            content: "";
            height: 1px;
            flex: 1;
            background: #e8eef2;
          }

          .registration-security {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: #54816c;
            font-size: 12px;
            line-height: 1.6;
          }

          .otp-verification-icon {
            width: 66px;
            height: 66px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 8px auto 18px;
            border-radius: 20px;
            color: #087e8b;
            background: #e7f5f6;
          }

          .otp-information {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 14px;
            margin: 22px 0;
            border: 1px solid #d9ecef;
            border-radius: 12px;
            background: #f0f8fa;
            color: #526b7b;
            text-align: left;
            font-size: 13px;
            line-height: 1.7;
          }

          .otp-information svg {
            flex-shrink: 0;
            color: #087e8b;
            margin-top: 1px;
          }

          .otp-verification input[name="otp"] {
            text-align: center;
            font-size: 25px;
            font-weight: 800;
            letter-spacing: 9px;
            font-variant-numeric: tabular-nums;
          }

          .otp-verification input[name="otp"]::placeholder {
            color: #b6c5cc;
            letter-spacing: 9px;
          }

          .otp-remember-device {
            display: flex;
            align-items: flex-start;
            gap: 11px;
            margin: 2px 0 5px;
            padding: 13px;
            border: 1px solid #d9ecef;
            border-radius: 11px;
            background: #f7fbfc;
            text-align: left;
            cursor: pointer;
          }

          .otp-remember-device input[type="checkbox"] {
            width: 17px;
            height: 17px;
            flex-shrink: 0;
            margin: 2px 0 0;
            accent-color: #087e8b;
            cursor: pointer;
          }

          .otp-remember-device span {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .otp-remember-device strong {
            color: #183449;
            font-size: 13px;
            font-weight: 700;
          }

          .otp-remember-device small {
            color: #718390;
            font-size: 11px;
            line-height: 1.6;
            font-weight: 400;
          }

          .otp-verification .btn-primary {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 9px;
          }

          .otp-expiry-note {
            margin: 17px 0;
            color: #718390;
            font-size: 12px;
            line-height: 1.7;
          }

          .otp-back-button {
            border: none;
            background: transparent;
            color: #087e8b;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            padding: 9px 12px;
          }

          .otp-back-button:hover:not(:disabled) {
            text-decoration: underline;
          }

          .otp-back-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}
      </style>
    </section>
  );
}
