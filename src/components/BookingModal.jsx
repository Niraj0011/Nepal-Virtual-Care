
import { useEffect, useState } from 'react';
import {
  X,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Clock3,
  RefreshCw,
} from 'lucide-react';

import {
  createAppointment,
  getAvailableSlots,
} from '../api';

function getLocalDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function normalizeSlots(data) {
  const received = Array.isArray(data?.slots)
    ? data.slots
    : Array.isArray(data?.results)
      ? data.results
      : [];

  return received
    .map((slot) => {
      if (typeof slot === 'string') {
        return {
          start_time: slot.slice(0, 5),
          end_time: '',
        };
      }

      return {
        start_time: (
          slot.start_time ||
          slot.start ||
          slot.time ||
          ''
        ).slice(0, 5),
        end_time: (slot.end_time || slot.end || '').slice(0, 5),
      };
    })
    .filter((slot) => slot.start_time)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export default function BookingModal({ provider, onClose }) {
  const [date, setDate] = useState('');
  const [type, setType] = useState('Video consultation');
  const [reason, setReason] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');

  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDate('');
    setType('Video consultation');
    setReason('');
    setSelectedSlot('');
    setSlots([]);
    setSlotsLoading(false);
    setSlotsError('');
    setDone(false);
    setSaving(false);
    setError('');
  }, [provider?.id]);

  useEffect(() => {
    if (!provider?.id || !date) {
      setSlots([]);
      setSelectedSlot('');
      setSlotsError('');
      setSlotsLoading(false);
      return;
    }

    let active = true;

    const loadSlots = async () => {
      try {
        setSlotsLoading(true);
        setSlotsError('');
        setSlots([]);
        setSelectedSlot('');

        const data = await getAvailableSlots(provider.id, date);

        if (!active) return;

        setSlots(normalizeSlots(data));
      } catch (err) {
        if (!active) return;

        setSlotsError(
          err.message || 'Unable to load available appointment times.'
        );
      } finally {
        if (active) {
          setSlotsLoading(false);
        }
      }
    };

    loadSlots();

    return () => {
      active = false;
    };
  }, [provider?.id, date]);

  useEffect(() => {
    if (!provider) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [provider, saving, onClose]);

  if (!provider) return null;

  const handleClose = () => {
    if (!saving) {
      onClose();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!provider.id) {
      setError(
        'Doctor information is missing. Please select another provider.'
      );
      return;
    }

    if (!date) {
      setError('Please select your preferred appointment date.');
      return;
    }

    if (date < getLocalDate()) {
      setError('Please select today or a future date.');
      return;
    }

    if (slotsLoading) {
      setError('Please wait while we load available appointment times.');
      return;
    }

    if (slotsError) {
      setError('Please reload the available appointment times before booking.');
      return;
    }

    if (slots.length === 0) {
      setError('There are no available appointment times on this date.');
      return;
    }

    if (!selectedSlot) {
      setError('Please select an available appointment time.');
      return;
    }

    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      setError('Please briefly describe what you need help with.');
      return;
    }

    if (saving) return;

    try {
      setSaving(true);

      await createAppointment({
        provider: provider.id,
        preferred_date: date,
        start_time: selectedSlot,
        consultation_type: type,
        reason: trimmedReason,
      });

      setDone(true);
    } catch (err) {
      setError(
        err.message ||
        'We could not submit your appointment request. Please try again.'
      );

      try {
        const latest = await getAvailableSlots(provider.id, date);
        setSlots(normalizeSlots(latest));
        setSelectedSlot('');
      } catch {
        // Keep the original booking error visible.
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        style={{
          width: 'min(100%, 560px)',
          maxHeight: 'calc(100dvh - 24px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
          flexShrink: 0,
        }}
      >
        <button
          className="modal-close"
          type="button"
          onClick={handleClose}
          disabled={saving}
          aria-label="Close appointment form"
        >
          <X size={20} />
        </button>

        {done ? (
          <div
            className="success-state"
            style={{
              overflowY: 'auto',
              minHeight: 0,
              padding: '24px',
            }}
          >
            <CheckCircle2 size={48} />

            <h2 id="booking-modal-title">
              Appointment request submitted!
            </h2>

            <p>
              Your appointment request with {provider.name} has
              been successfully saved.
            </p>

            <p>
              <strong>Date:</strong> {date}
              <br />
              <strong>Time:</strong> {selectedSlot}
            </p>

            <button
              className="btn-primary"
              type="button"
              onClick={handleClose}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                flexShrink: 0,
                paddingRight: '36px',
              }}
            >
              <span className="eyebrow">
                VIRTUAL CONSULTATION
              </span>

              <h2 id="booking-modal-title">
                Request an appointment
              </h2>

              <p className="muted">
                With {provider.name} · {provider.specialty}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="form-stack"
              noValidate
              style={{
                minHeight: 0,
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                padding: '8px 6px 20px 0',
                boxSizing: 'border-box',
              }}
            >
              <label htmlFor="booking-date">
                Preferred date
              </label>

              <input
                id="booking-date"
                type="date"
                min={getLocalDate()}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSelectedSlot('');
                  setError('');
                }}
                disabled={saving}
                required
              />

              {date && (
                <>
                  <label htmlFor="booking-time">
                    Available appointment times
                  </label>

                  {slotsLoading ? (
                    <p className="form-note" role="status">
                      <RefreshCw size={15} />
                      Loading available times...
                    </p>
                  ) : slotsError ? (
                    <p className="booking-error" role="alert">
                      <AlertCircle size={17} />
                      {slotsError}
                    </p>
                  ) : slots.length === 0 ? (
                    <p className="form-note">
                      No appointment times are available on this date.
                      Please select another date.
                    </p>
                  ) : (
                    <>
                      <select
                        id="booking-time"
                        value={selectedSlot}
                        onChange={(event) => {
                          setSelectedSlot(event.target.value);
                          setError('');
                        }}
                        disabled={saving}
                        required
                      >
                        <option value="">
                          Choose an available time
                        </option>

                        {slots.map((slot) => (
                          <option
                            key={slot.start_time}
                            value={slot.start_time}
                          >
                            {slot.start_time}
                            {slot.end_time
                              ? ` – ${slot.end_time}`
                              : ''}
                          </option>
                        ))}
                      </select>

                      <small className="form-note">
                        <Clock3 size={15} />
                        Times are shown in Nepal local time.
                      </small>
                    </>
                  )}
                </>
              )}

              <label htmlFor="booking-type">
                Consultation type
              </label>

              <select
                id="booking-type"
                value={type}
                onChange={(event) => setType(event.target.value)}
                disabled={saving}
              >
                <option value="Video consultation">
                  Video consultation
                </option>
                <option value="Audio consultation">
                  Audio consultation
                </option>
                <option value="In-person visit">
                  In-person visit
                </option>
              </select>

              <label htmlFor="booking-reason">
                What would you like help with?
              </label>

              <textarea
                id="booking-reason"
                rows="4"
                maxLength={1000}
                placeholder="Briefly describe your concern..."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={saving}
                required
              />

              <small className="form-note">
                Please avoid including unnecessary sensitive personal
                information in this description.
              </small>

              {error && (
                <p className="booking-error" role="alert">
                  <AlertCircle size={17} />
                  {error}
                </p>
              )}

              <button
                className="btn-primary"
                type="submit"
                disabled={
                  saving ||
                  slotsLoading ||
                  !date ||
                  !selectedSlot ||
                  slots.length === 0
                }
                style={{
                  width: '100%',
                  flexShrink: 0,
                  marginTop: '8px',
                }}
              >
                <CalendarDays size={17} />
                {saving ? 'Submitting request...' : 'Submit request'}
              </button>

              <small className="form-note">
                Your request will be saved to your account.
                The appointment is not confirmed until its status
                is updated.
              </small>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
