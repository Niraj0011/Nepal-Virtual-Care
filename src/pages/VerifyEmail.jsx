
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  HeartPulse,
  MailCheck,
  ShieldCheck,
  AlertCircle,
  LoaderCircle,
  ArrowRight,
  Mail,
  RefreshCw,
} from 'lucide-react';

import {
  verifyEmail as verifyEmailRequest,
  resendVerificationEmail,
} from '../api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');

  const requestRef = useRef({
    token: null,
    promise: null,
  });

  useEffect(() => {
    let active = true;

    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token.');
      return () => {
        active = false;
      };
    }

    if (requestRef.current.token !== token) {
      requestRef.current = {
        token,
        promise: verifyEmailRequest(token),
      };
    }

    requestRef.current.promise
      .then((response) => {
        if (!active) return;

        setStatus('success');
        setMessage(
          response.detail ||
            'Your email address has been verified successfully.'
        );
      })
      .catch((error) => {
        if (!active) return;

        setStatus('error');
        setMessage(
          error.message || 'Unable to verify your email address.'
        );
      });

    return () => {
      active = false;
    };
  }, [token]);

  const goToLogin = () => {
    navigate('/login', { replace: true });
  };

  const handleResend = async (e) => {
    e.preventDefault();

    if (resending) return;

    setResendError('');
    setResendMessage('');
    setResending(true);

    try {
      const response = await resendVerificationEmail(email);

      setResendMessage(
        response.detail ||
          'If verification is required, a new email has been sent.'
      );

      setEmail('');
    } catch (error) {
      setResendError(
        error.message || 'Unable to send a verification email. Please try again.'
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <section
      style={{
        minHeight: '75vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 20px',
        background: '#f4f8fb',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '510px',
          padding: '44px 36px',
          background: '#ffffff',
          border: '1px solid #e5edf2',
          borderRadius: '22px',
          boxShadow: '0 18px 55px rgba(20, 50, 75, 0.09)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '38px',
            color: '#087e8b',
            fontWeight: 800,
            fontSize: '18px',
          }}
        >
          <HeartPulse size={29} />
          <span>Nepal Virtual Care</span>
        </div>

        {status === 'loading' && (
          <>
            <div style={{ color: '#087e8b', marginBottom: '22px' }}>
              <LoaderCircle
                size={55}
                style={{
                  animation: 'nvc-verify-spin 1.2s linear infinite',
                  margin: 'auto',
                }}
              />
            </div>

            <p style={eyebrowStyle}>SECURE ACCOUNT VERIFICATION</p>
            <h1 style={headingStyle}>Verifying your email</h1>
            <p style={descriptionStyle}>
              Please wait while we securely verify your email address.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={successIconStyle}>
              <MailCheck size={42} />
            </div>

            <p style={eyebrowStyle}>VERIFICATION COMPLETE</p>
            <h1 style={headingStyle}>Your email is verified!</h1>

            <p style={descriptionStyle}>{message}</p>

            <div style={successNoticeStyle}>
              <ShieldCheck size={23} style={{ flexShrink: 0 }} />
              <span>
                Your account is active. You can now sign in securely.
              </span>
            </div>

            <button
              type="button"
              onClick={goToLogin}
              style={primaryButtonStyle}
            >
              Continue to sign in
              <ArrowRight size={18} />
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={errorIconStyle}>
              <AlertCircle size={42} />
            </div>

            <p style={eyebrowStyle}>VERIFICATION ISSUE</p>
            <h1 style={headingStyle}>We couldn't verify your email</h1>

            <p style={descriptionStyle}>{message}</p>

            <div style={resendSectionStyle}>
              <div style={resendHeadingStyle}>
                <Mail size={21} />
                <strong>Request a new verification link</strong>
              </div>

              <p style={resendDescriptionStyle}>
                Enter the email address you used when creating your account.
              </p>

              <form onSubmit={handleResend}>
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setResendError('');
                    setResendMessage('');
                  }}
                  placeholder="Enter your registered email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  style={emailInputStyle}
                />

                {resendError && (
                  <p style={resendErrorStyle} role="alert">
                    {resendError}
                  </p>
                )}

                {resendMessage && (
                  <p style={resendSuccessStyle} role="status">
                    <ShieldCheck size={17} />
                    {resendMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={resending}
                  style={{
                    ...primaryButtonStyle,
                    marginTop: '14px',
                    opacity: resending ? 0.7 : 1,
                    cursor: resending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {resending ? (
                    <>
                      <LoaderCircle
                        size={18}
                        style={{
                          animation: 'nvc-verify-spin 1.2s linear infinite',
                        }}
                      />
                      Sending...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={18} />
                      Resend verification email
                    </>
                  )}
                </button>
              </form>
            </div>

            <button
              type="button"
              onClick={goToLogin}
              style={secondaryButtonStyle}
            >
              Go to sign in
              <ArrowRight size={17} />
            </button>
          </>
        )}

        <div
          style={{
            borderTop: '1px solid #edf1f4',
            marginTop: '34px',
            paddingTop: '20px',
            color: '#8493a0',
            fontSize: '12px',
          }}
        >
          Nepal Virtual Care · Healthcare without borders
        </div>
      </div>

      <style>
        {`
          @keyframes nvc-verify-spin {
            to { transform: rotate(360deg); }
          }

          @media (max-width: 480px) {
            .auth-verification-card {
              padding: 30px 20px;
            }
          }
        `}
      </style>
    </section>
  );
}

const eyebrowStyle = {
  color: '#087e8b',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '1.5px',
  marginBottom: '12px',
};

const headingStyle = {
  color: '#183449',
  fontSize: '27px',
  fontWeight: 800,
  lineHeight: 1.3,
  margin: '0 0 14px',
};

const descriptionStyle = {
  color: '#687b89',
  fontSize: '15px',
  lineHeight: 1.8,
  margin: '0',
};

const successIconStyle = {
  width: '82px',
  height: '82px',
  borderRadius: '50%',
  background: '#e7f8ef',
  color: '#168653',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 25px',
};

const errorIconStyle = {
  width: '82px',
  height: '82px',
  borderRadius: '50%',
  background: '#fff0ed',
  color: '#d65b49',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 25px',
};

const primaryButtonStyle = {
  width: '100%',
  minHeight: '52px',
  border: 'none',
  borderRadius: '10px',
  background: '#087e8b',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  cursor: 'pointer',
  marginTop: '25px',
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: '#edf5f7',
  color: '#087e8b',
  marginTop: '14px',
};

const successNoticeStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  textAlign: 'left',
  background: '#effaf5',
  border: '1px solid #d5f0e1',
  borderRadius: '12px',
  padding: '15px',
  margin: '25px 0',
  color: '#176b48',
  fontSize: '14px',
  lineHeight: 1.6,
};

const resendSectionStyle = {
  textAlign: 'left',
  background: '#f6fafc',
  border: '1px solid #e5edf2',
  borderRadius: '14px',
  padding: '20px',
  marginTop: '26px',
};

const resendHeadingStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  color: '#183449',
  fontSize: '15px',
};

const resendDescriptionStyle = {
  color: '#687b89',
  fontSize: '13px',
  lineHeight: 1.7,
  margin: '12px 0 16px',
};

const emailInputStyle = {
  width: '100%',
  minHeight: '48px',
  padding: '0 13px',
  border: '1px solid #dce6ec',
  borderRadius: '9px',
  outlineColor: '#087e8b',
  fontSize: '14px',
  boxSizing: 'border-box',
  background: '#ffffff',
  color: '#183449',
};

const resendErrorStyle = {
  color: '#bd4035',
  fontSize: '12px',
  lineHeight: 1.6,
  margin: '10px 0 0',
};

const resendSuccessStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  color: '#176b48',
  fontSize: '12px',
  lineHeight: 1.6,
  margin: '12px 0 0',
};
