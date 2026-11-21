
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Monitor,
  Smartphone,
  Clock,
  CalendarDays,
  RefreshCw,
  Trash2,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Laptop,
} from 'lucide-react';

import {
  getTrustedDevices,
  revokeTrustedDevice,
} from '../api';

function formatDate(value) {
  if (!value) return 'Not used yet';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unavailable';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getDeviceName(label) {
  const value = (label || '').toLowerCase();

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

  if (browser === 'Unknown browser') {
    return operatingSystem;
  }

  if (operatingSystem === 'Unknown device') {
    return browser;
  }

  return `${browser} on ${operatingSystem}`;
}

function getDeviceIcon(label) {
  const value = (label || '').toLowerCase();

  if (
    value.includes('mobile') ||
    value.includes('android') ||
    value.includes('iphone') ||
    value.includes('ipad')
  ) {
    return Smartphone;
  }

  if (
    value.includes('windows') ||
    value.includes('macintosh') ||
    value.includes('linux')
  ) {
    return Laptop;
  }

  return Monitor;
}

export default function TrustedDevices() {
  const navigate = useNavigate();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revokingId, setRevokingId] = useState(null);

  const loadDevices = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const data = await getTrustedDevices();

      setDevices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err.message || 'Unable to load your trusted devices. Please try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleRevoke = async (device) => {
    const confirmed = window.confirm(
      'Are you sure you want to revoke this trusted device? It will need OTP verification the next time it signs in.'
    );

    if (!confirmed) return;

    try {
      setRevokingId(device.id);
      setError('');
      setSuccess('');

      await revokeTrustedDevice(device.id);

      setDevices((current) =>
        current.filter((item) => item.id !== device.id)
      );

      setSuccess('Trusted device revoked successfully.');
    } catch (err) {
      setError(
        err.message || 'Unable to revoke this device. Please try again.'
      );
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <main className="trusted-devices-page">
      <div className="trusted-devices-container">
        <button
          type="button"
          className="trusted-devices-back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={17} />
          Back
        </button>

        <header className="trusted-devices-header">
          <div className="trusted-devices-heading">
            <div className="trusted-devices-icon">
              <ShieldCheck size={27} />
            </div>

            <div>
              <h1>Trusted Devices</h1>
              <p>
                Manage the devices that can sign in without email OTP
                verification for up to 30 days.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="trusted-devices-refresh"
            onClick={() => loadDevices(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'trusted-devices-spinning' : ''}
            />
            Refresh
          </button>
        </header>

        <section className="trusted-devices-security-note">
          <ShieldCheck size={20} />
          <div>
            <strong>Your account security matters</strong>
            <p>
              Only trust devices you personally control. If you no
              longer use a device, revoke it here. That device will
              need email OTP verification at its next login.
            </p>
          </div>
        </section>

        {error && (
          <div className="trusted-devices-message trusted-devices-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="trusted-devices-message trusted-devices-success">
            <CheckCircle2 size={18} />
            <span>{success}</span>
          </div>
        )}

        <section className="trusted-devices-list-section">
          <div className="trusted-devices-list-heading">
            <div>
              <h2>Your trusted devices</h2>
              <p>
                {devices.length}{' '}
                {devices.length === 1 ? 'active device' : 'active devices'}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="trusted-devices-state">
              <RefreshCw size={24} className="trusted-devices-spinning" />
              <p>Loading your trusted devices...</p>
            </div>
          ) : error && devices.length === 0 ? (
            <div className="trusted-devices-state">
              <AlertCircle size={28} />
              <p>We couldn't load your devices.</p>
              <button
                type="button"
                className="trusted-devices-retry"
                onClick={() => loadDevices()}
              >
                Try again
              </button>
            </div>
          ) : devices.length === 0 ? (
            <div className="trusted-devices-state">
              <ShieldCheck size={34} />
              <h3>No trusted devices</h3>
              <p>
                Devices you choose to trust during OTP login will appear
                here.
              </p>
            </div>
          ) : (
            <div className="trusted-devices-list">
              {devices.map((device) => {
                const DeviceIcon = getDeviceIcon(device.device_label);
                const deviceName = getDeviceName(device.device_label);

                return (
                  <article
                    className="trusted-device-card"
                    key={device.id}
                  >
                    <div className="trusted-device-main">
                      <div className="trusted-device-icon">
                        <DeviceIcon size={23} />
                      </div>

                      <div className="trusted-device-details">
                        <h3>{deviceName}</h3>
                        <span className="trusted-device-status">
                          <span className="trusted-device-status-dot" />
                          Trusted
                        </span>
                      </div>
                    </div>

                    <div className="trusted-device-meta">
                      <div>
                        <CalendarDays size={16} />
                        <span>
                          <strong>Added</strong>
                          {formatDate(device.created_at)}
                        </span>
                      </div>

                      <div>
                        <Clock size={16} />
                        <span>
                          <strong>Last used</strong>
                          {formatDate(device.last_used_at)}
                        </span>
                      </div>

                      <div>
                        <ShieldCheck size={16} />
                        <span>
                          <strong>Trust expires</strong>
                          {formatDate(device.expires_at)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="trusted-device-revoke"
                      onClick={() => handleRevoke(device)}
                      disabled={revokingId === device.id}
                    >
                      <Trash2 size={16} />
                      {revokingId === device.id
                        ? 'Revoking...'
                        : 'Revoke device'}
                    </button>
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
