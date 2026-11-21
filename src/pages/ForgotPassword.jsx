
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HeartPulse,
  ShieldCheck,
  Mail,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';

import { requestPasswordReset } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError('');
    setLoading(true);

    try {
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      setError(
        err.message || 'Unable to process your request. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-section">
      <div className="auth-card">
        <div className="auth-icon">
          <HeartPulse size={28} />
        </div>

        <span className="eyebrow">PATIENT PORTAL</span>

        {!submitted ? (
          <>
            <div className="forgot-password-icon">
              <Mail size={30} />
            </div>

            <h1>Forgot your password?</h1>

            <p className="muted">
              Don't worry. Enter the email address associated with
              your account and we'll help you reset your password.
            </p>

            <form
              className="form-stack"
              onSubmit={handleSubmit}
              autoComplete="on"
            >
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  inputMode="email"
                  spellCheck={false}
                />
              </label>

              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Please wait...' : 'Send reset link'}
              </button>
            </form>
          </>
        ) : (
          <div className="forgot-password-success">
            <div className="forgot-password-success-icon">
              <CheckCircle2 size={38} />
            </div>

            <h1>Check your email</h1>

            <p className="muted">
              If an active account exists with this email address,
              a password reset link has been sent.
            </p>

            <div className="forgot-password-email">
              <Mail size={20} />
              <strong>{email.trim().toLowerCase()}</strong>
            </div>

            <p className="forgot-password-help">
              Follow the instructions in the reset email to create
              a new password. If you don't see it, check your spam
              or junk folder.
            </p>
          </div>
        )}

        <Link to="/login" className="forgot-password-back">
          <ArrowLeft size={17} />
          Back to sign in
        </Link>

        <div className="auth-note">
          <ShieldCheck size={17} />
          Your account is managed securely by Django.
        </div>
      </div>

      <style>
        {`
          .forgot-password-icon,
          .forgot-password-success-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 64px;
            height: 64px;
            margin: 24px auto 18px;
            border-radius: 18px;
            color: #087e8b;
            background: #e5f4f5;
          }

          .forgot-password-success-icon {
            color: #24865b;
            background: #e6f5ec;
          }

          .forgot-password-success {
            text-align: center;
          }

          .forgot-password-email {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 15px;
            margin: 22px 0;
            border: 1px solid #d9ecef;
            border-radius: 12px;
            background: #f0f8fa;
            color: #183449;
            overflow-wrap: anywhere;
          }

          .forgot-password-email svg {
            flex-shrink: 0;
            color: #087e8b;
          }

          .forgot-password-email strong {
            font-size: 14px;
          }

          .forgot-password-help {
            color: #687b89;
            font-size: 13px;
            line-height: 1.8;
            margin: 18px 0;
          }

          .forgot-password-back {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin: 24px 0 8px;
            color: #087e8b;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
          }

          .forgot-password-back:hover {
            text-decoration: underline;
          }
        `}
      </style>
    </section>
  );
}
