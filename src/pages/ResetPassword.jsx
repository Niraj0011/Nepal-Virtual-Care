
import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  HeartPulse,
  ShieldCheck,
  LockKeyhole,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';

import { confirmPasswordReset } from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;

    setError('');

    if (!uid || !token) {
      setError('This password reset link is incomplete or invalid.');
      return;
    }

    if (password.length < 8) {
      setError('Your new password must contain at least 8 characters.');
      return;
    }

    if (password !== passwordConfirm) {
      setError('Your passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await confirmPasswordReset({
        uid,
        token,
        password,
        password_confirm: passwordConfirm,
      });

      setSuccess(true);
      setPassword('');
      setPasswordConfirm('');
    } catch (err) {
      setError(
        err.message || 'Unable to reset your password. Please try again.'
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

        {!success ? (
          <>
            <div className="reset-password-icon">
              <LockKeyhole size={30} />
            </div>

            <h1>Create a new password</h1>

            <p className="muted">
              Choose a strong password to secure your Nepal Virtual Care
              account.
            </p>

            <form
              className="form-stack"
              onSubmit={handleSubmit}
              autoComplete="on"
            >
              <label>
                New password
                <input
                  type="password"
                  name="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your new password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>

              <label>
                Confirm new password
                <input
                  type="password"
                  name="confirm-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Enter your password again"
                  required
                  minLength={8}
                  autoComplete="new-password"
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
                disabled={loading || !uid || !token}
              >
                {loading ? 'Updating password...' : 'Reset password'}
              </button>
            </form>

            {(!uid || !token) && (
              <p className="reset-password-help">
                Please request a new password reset link.
              </p>
            )}
          </>
        ) : (
          <div className="reset-password-success">
            <div className="reset-password-success-icon">
              <CheckCircle2 size={40} />
            </div>

            <h1>Password updated!</h1>

            <p className="muted">
              Your password has been changed successfully.
              You can now sign in using your new password.
            </p>

            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/login', { replace: true })}
            >
              Continue to sign in
            </button>
          </div>
        )}

        {!success && (
          <Link to="/forgot-password" className="reset-password-back">
            <ArrowLeft size={17} />
            Request another reset link
          </Link>
        )}

        <div className="auth-note">
          <ShieldCheck size={17} />
          Your account is managed securely by Django.
        </div>
      </div>

      <style>
        {`
          .reset-password-icon,
          .reset-password-success-icon {
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

          .reset-password-success-icon {
            color: #24865b;
            background: #e6f5ec;
          }

          .reset-password-success {
            text-align: center;
          }

          .reset-password-success .btn-primary {
            width: 100%;
            margin-top: 22px;
          }

          .reset-password-back {
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

          .reset-password-back:hover {
            text-decoration: underline;
          }

          .reset-password-help {
            color: #687b89;
            font-size: 13px;
            line-height: 1.7;
            text-align: center;
          }
        `}
      </style>
    </section>
  );
}
