
import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Save,
  Info,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

import {
  getConsentPreferences,
  updateConsentPreferences,
} from '../api';

const DEFAULT_PREFERENCES = {
  information_sharing: false,
  understood_demo_notice: false,
};

export default function Consent() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setLoadError('');
      setError('');
      setSuccess('');

      const data = await getConsentPreferences();

      setPreferences({
        information_sharing: Boolean(data.information_sharing),
        understood_demo_notice: Boolean(data.understood_demo_notice),
      });
    } catch (err) {
      setLoadError(
        err.message || 'Unable to load your privacy preferences.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const data = await getConsentPreferences();

        if (active) {
          setPreferences({
            information_sharing: Boolean(data.information_sharing),
            understood_demo_notice: Boolean(data.understood_demo_notice),
          });
        }
      } catch (err) {
        if (active) {
          setLoadError(
            err.message || 'Unable to load your privacy preferences.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  const handleChange = (field) => {
    setPreferences((previous) => ({
      ...previous,
      [field]: !previous[field],
    }));

    setSuccess('');
    setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const data = await updateConsentPreferences(preferences);

      setPreferences({
        information_sharing: Boolean(data.information_sharing),
        understood_demo_notice: Boolean(data.understood_demo_notice),
      });

      setSuccess('Your privacy preferences have been saved successfully.');
    } catch (err) {
      setError(err.message || 'Unable to save your preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">PRIVACY & SECURITY</span>

        <h1>
          Your privacy, <em>your choice.</em>
        </h1>

        <p>
          Review and manage your information-sharing preferences.
          Your choices remain associated with your account.
        </p>
      </section>

      <section className="section">
        <div className="section-heading">
          <span className="eyebrow">CONSENT SETTINGS</span>

          <h2>Manage your preferences</h2>

          <p>
            You are in control of your consent choices.
            You can review and update them whenever you need.
          </p>
        </div>

        {loading ? (
          <div className="consent-card consent-loading">
            <RefreshCw size={23} className="consent-loading-icon" />
            <p>Loading your privacy preferences...</p>
          </div>
        ) : loadError ? (
          <div className="consent-card consent-load-error">
            <div className="consent-message-icon">
              <AlertCircle size={23} />
            </div>

            <h3>Unable to load preferences</h3>

            <p>{loadError}</p>

            <button
              type="button"
              className="btn-primary"
              onClick={loadPreferences}
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        ) : (
          <div className="consent-card">
            <div className="consent-intro">
              <ShieldCheck size={30} />

              <div>
                <h3>Your privacy matters</h3>

                <p>
                  Review each preference carefully before saving
                  your changes.
                </p>
              </div>
            </div>

            <form onSubmit={handleSave}>
              <div className="consent-options">

                <label className="consent-option">
                  <input
                    type="checkbox"
                    checked={preferences.information_sharing}
                    onChange={() => handleChange('information_sharing')}
                    disabled={saving}
                  />

                  <span>
                    <strong>Information sharing consent</strong>

                    <small>
                      I consent to information sharing as described
                      by the platform's privacy information. This
                      setting records my preference and does not
                      itself grant access to medical records.
                    </small>
                  </span>
                </label>

                <label className="consent-option">
                  <input
                    type="checkbox"
                    checked={preferences.understood_demo_notice}
                    onChange={() => handleChange('understood_demo_notice')}
                    disabled={saving}
                  />

                  <span>
                    <strong>Demo platform notice</strong>

                    <small>
                      I understand that Nepal Virtual Care is a
                      demonstration project and should not be
                      relied upon as a replacement for emergency
                      medical services or professional healthcare.
                    </small>
                  </span>
                </label>

              </div>

              {error && (
                <div className="form-error" role="alert">
                  <AlertCircle size={17} />
                  {error}
                </div>
              )}

              {success && (
                <div className="consent-success" role="status">
                  <CheckCircle2 size={17} />
                  {success}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
              >
                <Save size={17} />
                {saving ? 'Saving preferences...' : 'Save preferences'}
              </button>
            </form>

            <div className="consent-notice">
              <Lock size={19} />

              <p>
                Your preferences are saved against your authenticated
                account. The backend restricts access to the consent
                preferences of the logged-in user.
              </p>
            </div>
          </div>
        )}

        <div className="notice">
          <Info size={20} />

          <p>
            <b>Important</b>
            <br />
            This page records your consent preferences. It does not
            replace a complete privacy policy, and information-sharing
            permissions must also be enforced by the relevant backend
            features.
          </p>
        </div>
      </section>
    </>
  );
}
