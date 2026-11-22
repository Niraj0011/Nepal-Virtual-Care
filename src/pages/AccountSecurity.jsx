
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Monitor,
  Smartphone,
  Laptop,
  Clock,
  CalendarDays,
  RefreshCw,
  Trash2,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  MapPin,
  LogOut,
  AlertTriangle,
  Check,
  X,
  Globe,
} from 'lucide-react';
import '../AccountSecurity.css';

import { useApp } from '../context/AppContext';

import {
  getAccountSessions,
  revokeAccountSession,
  recognizeAccountSession,
  reportUnrecognizedLogin,
  logoutAllDevices,
} from '../api';

function formatDate(value) {
  if (!value) return 'Unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Unavailable';

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getDeviceName(session) {
  if (session.browser_name || session.operating_system) {
    const browser = session.browser_name || 'Unknown browser';
    const operatingSystem =
      session.operating_system || 'Unknown device';

    return `${browser} on ${operatingSystem}`;
  }

  const value = (session.device_label || '').toLowerCase();

  let browser = 'Unknown browser';
  let operatingSystem = 'Unknown device';

  if (value.includes('edg/')) {
    browser = 'Microsoft Edge';
  } else if (value.includes('opr/') || value.includes('opera')) {
    browser = 'Opera';
  } else if (value.includes('firefox/')) {
    browser = 'Firefox';
  } else if (value.includes('chrome/') && !value.includes('chromium')) {
    browser = 'Chrome';
  } else if (value.includes('safari/') && !value.includes('chrome/')) {
    browser = 'Safari';
  }

  if (value.includes('iphone')) {
    operatingSystem = 'iPhone';
  } else if (value.includes('ipad')) {
    operatingSystem = 'iPad';
  } else if (value.includes('android')) {
    operatingSystem = 'Android';
  } else if (value.includes('windows')) {
    operatingSystem = 'Windows';
  } else if (value.includes('macintosh') || value.includes('mac os')) {
    operatingSystem = 'Mac';
  } else if (value.includes('linux')) {
    operatingSystem = 'Linux';
  }

  if (browser === 'Unknown browser' && operatingSystem === 'Unknown device') {
    return 'Unknown device';
  }

  if (browser === 'Unknown browser') return operatingSystem;
  if (operatingSystem === 'Unknown device') return browser;

  return `${browser} on ${operatingSystem}`;
}

function getDeviceIcon(session) {
  const value = [
    session.device_type,
    session.device_label,
    session.operating_system,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    value.includes('mobile') ||
    value.includes('android') ||
    value.includes('iphone') ||
    value.includes('ipad')
  ) {
    return Smartphone;
  }

  if (
    value.includes('desktop') ||
    value.includes('laptop') ||
    value.includes('windows') ||
    value.includes('mac') ||
    value.includes('linux')
  ) {
    return Laptop;
  }

  return Monitor;
}

function normalizeSessions(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.sessions)) return data.sessions;

  return [];
}

export default function AccountSecurity() {
  const navigate = useNavigate();
  const { logout } = useApp();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revokingId, setRevokingId] = useState(null);
  const [recognizingId, setRecognizingId] = useState(null);
  const [reportingId, setReportingId] = useState(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const loadSessions = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const data = await getAccountSessions();
      setSessions(normalizeSessions(data));
    } catch (err) {
      setError(
        err.message ||
          'Unable to load your active sessions. Please try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleRevoke = async (session) => {
    const isCurrent = Boolean(session.is_current);

    const confirmed = window.confirm(
      isCurrent
        ? 'You are about to revoke the session you are currently using. You will be signed out immediately. Continue?'
        : 'Are you sure you want to revoke this session? That device will be signed out.'
    );

    if (!confirmed) return;

    try {
      setRevokingId(session.id);
      setError('');
      setSuccess('');

      await revokeAccountSession(session.id);

      if (isCurrent) {
        // The server has already revoked this session.
        // logout() clears local tokens and account state in its finally block.
        try {
          await logout();
        } catch (logoutError) {
          console.warn(
            'The server-side logout request was unnecessary because the session was already revoked:',
            logoutError
          );
        }

        navigate('/login', { replace: true });
        return;
      }

      setSessions((current) =>
        current.filter((item) => item.id !== session.id)
      );

      setSuccess('The selected session has been revoked.');
    } catch (err) {
      setError(
        err.message || 'Unable to revoke this session. Please try again.'
      );
    } finally {
      setRevokingId(null);
    }
  };

  const handleRecognize = async (session) => {
    try {
      setRecognizingId(session.id);
      setError('');
      setSuccess('');

      await recognizeAccountSession(session.id);

      setSessions((current) =>
        current.map((item) =>
          item.id === session.id
            ? { ...item, login_confirmed: true }
            : item
        )
      );

      setSuccess('You confirmed that this login was yours.');
    } catch (err) {
      setError(
        err.message || 'Unable to confirm this login. Please try again.'
      );
    } finally {
      setRecognizingId(null);
    }
  };

  const handleReport = async (session) => {
    const confirmed = window.confirm(
      'Do you NOT recognize this login? Reporting it will sign out all active sessions and revoke trusted devices on your account. You will need to reset your password before signing in again.'
    );

    if (!confirmed) return;

    try {
      setReportingId(session.id);
      setError('');

      await reportUnrecognizedLogin(session.id);

      navigate('/forgot-password', {
        replace: true,
        state: {
          securityMessage:
            'Your account sessions have been revoked. Reset your password before signing in again.',
        },
      });
    } catch (err) {
      setError(
        err.message ||
          'Unable to report this login. Please try again.'
      );
      setReportingId(null);
    }
  };

  const handleLogoutAll = async () => {
    const confirmed = window.confirm(
      'This will sign out every active session on your account, including this device. You will need to sign in again. Continue?'
    );

    if (!confirmed) return;

    try {
      setLoggingOutAll(true);
      setError('');

      await logoutAllDevices();

      navigate('/login', { replace: true });
    } catch (err) {
      setError(
        err.message ||
          'Unable to sign out all devices. Please try again.'
      );
      setLoggingOutAll(false);
    }
  };

  return (
    <main className="account-security-page">
      <div className="account-security-container">
        <button
          type="button"
          className="account-security-back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={17} />
          Back
        </button>

        <header className="account-security-header">
          <div className="account-security-heading">
            <div className="account-security-icon">
              <ShieldCheck size={27} />
            </div>

            <div>
              <h1>Account Security</h1>
              <p>
                Review the devices signed in to your account and
                manage your active sessions.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="account-security-refresh"
            onClick={() => loadSessions(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={16}
              className={
                refreshing ? 'account-security-spinning' : ''
              }
            />
            Refresh
          </button>
        </header>

        <section className="account-security-notice">
          <ShieldCheck size={21} />

          <div>
            <strong>Keep your account secure</strong>
            <p>
              Check this list regularly. If you see a device or login
              you do not recognize, report it immediately. Reporting
              an unknown login signs out all sessions and revokes
              trusted devices so you can reset your password.
            </p>
          </div>
        </section>

        <section className="account-security-warning">
          <AlertTriangle size={19} />

          <div>
            <strong>Active sessions and trusted devices are different</strong>
            <p>
              Revoking a session signs that device out. Revoking a
              trusted device only removes its email OTP exemption.
              Manage OTP exemptions separately from the Trusted
              Devices page.
            </p>
          </div>
        </section>

        {error && (
          <div className="account-security-message account-security-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="account-security-message account-security-success">
            <CheckCircle2 size={18} />
            <span>{success}</span>
          </div>
        )}

        <section className="account-security-sessions">
          <div className="account-security-list-heading">
            <div>
              <h2>Active sessions</h2>
              <p>
                {sessions.length}{' '}
                {sessions.length === 1 ? 'active session' : 'active sessions'}
              </p>
            </div>

            <button
              type="button"
              className="account-security-logout-all"
              onClick={handleLogoutAll}
              disabled={loggingOutAll || sessions.length === 0}
            >
              <LogOut size={16} />
              {loggingOutAll ? 'Signing out...' : 'Log out all devices'}
            </button>
          </div>

          {loading ? (
            <div className="account-security-state">
              <RefreshCw
                size={25}
                className="account-security-spinning"
              />
              <p>Loading your active sessions...</p>
            </div>
          ) : error && sessions.length === 0 ? (
            <div className="account-security-state">
              <AlertCircle size={28} />
              <p>We couldn't load your active sessions.</p>

              <button
                type="button"
                className="account-security-retry"
                onClick={() => loadSessions()}
              >
                Try again
              </button>
            </div>
          ) : sessions.length === 0 ? (
            <div className="account-security-state">
              <ShieldCheck size={35} />
              <h3>No active sessions found</h3>
              <p>
                Your active signed-in devices will appear here.
              </p>
            </div>
          ) : (
            <div className="account-security-list">
              {sessions.map((session) => {
                const DeviceIcon = getDeviceIcon(session);
                const deviceName = getDeviceName(session);
                const loginUnconfirmed =
                  session.login_confirmed !== true;

                return (
                  <article
                    className="account-session-card"
                    key={session.id}
                  >
                    <div className="account-session-top">
                      <div className="account-session-main">
                        <div className="account-session-device-icon">
                          <DeviceIcon size={23} />
                        </div>

                        <div className="account-session-device-details">
                          <h3>{deviceName}</h3>

                          <div className="account-session-badges">
                            {session.is_current && (
                              <span className="account-session-current">
                                <span />
                                This device
                              </span>
                            )}

                            {session.login_confirmed === true ? (
                              <span className="account-session-confirmed">
                                <Check size={12} />
                                Recognized
                              </span>
                            ) : (
                              <span className="account-session-unconfirmed">
                                <AlertTriangle size={12} />
                                Not confirmed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="account-session-revoke"
                        onClick={() => handleRevoke(session)}
                        disabled={
                          revokingId === session.id ||
                          reportingId === session.id
                        }
                      >
                        <Trash2 size={15} />
                        {revokingId === session.id
                          ? 'Revoking...'
                          : 'Revoke session'}
                      </button>
                    </div>

                    <div className="account-session-meta">
                      <div>
                        <CalendarDays size={16} />
                        <span>
                          <strong>Signed in</strong>
                          {formatDate(session.created_at)}
                        </span>
                      </div>

                      <div>
                        <Clock size={16} />
                        <span>
                          <strong>Last active</strong>
                          {formatDate(session.last_activity_at)}
                        </span>
                      </div>

                      <div>
                        <MapPin size={16} />
                        <span>
                          <strong>Location</strong>
                          {session.location_label || 'Unavailable'}
                        </span>
                      </div>

                      <div>
                        <Globe size={16} />
                        <span>
                          <strong>Session expires</strong>
                          {formatDate(session.expires_at)}
                        </span>
                      </div>
                    </div>

                    {loginUnconfirmed && (
                      <div className="account-session-verification">
                        <div className="account-session-verification-text">
                          <AlertTriangle size={17} />

                          <span>
                            <strong>Was this login yours?</strong>
                            Confirm it if you recognize this device.
                            Otherwise, report it immediately.
                          </span>
                        </div>

                        <div className="account-session-verification-actions">
                          <button
                            type="button"
                            className="account-session-recognize"
                            onClick={() => handleRecognize(session)}
                            disabled={
                              recognizingId === session.id ||
                              reportingId === session.id
                            }
                          >
                            <Check size={15} />
                            {recognizingId === session.id
                              ? 'Confirming...'
                              : 'Yes, it was me'}
                          </button>

                          <button
                            type="button"
                            className="account-session-report"
                            onClick={() => handleReport(session)}
                            disabled={
                              reportingId === session.id ||
                              recognizingId === session.id
                            }
                          >
                            <X size={15} />
                            {reportingId === session.id
                              ? 'Reporting...'
                              : 'No, report login'}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
