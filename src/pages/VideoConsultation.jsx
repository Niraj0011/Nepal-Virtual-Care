
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  MeetingProvider,
  useMeeting,
  useParticipant,
} from '@videosdk.live/react-sdk';

import { getVideoConsultationToken } from '../api';

function CameraIcon({ off = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1" />
          <path d="m16 10 5-3v10l-5-3" />
        </>
      ) : (
        <>
          <rect x="3" y="6" width="12" height="12" rx="2" />
          <path d="m15 10 6-3v10l-6-3" />
        </>
      )}
    </svg>
  );
}

function MicIcon({ off = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {off ? (
        <>
          <path d="m3 3 18 18" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
          <path d="M15 9V5a3 3 0 0 0-5.83-.9" />
          <path d="M5 10v2a7 7 0 0 0 12 4.9" />
          <path d="M19 10v2" />
          <path d="M12 19v3" />
          <path d="M8 22h8" />
        </>
      ) : (
        <>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
          <path d="M12 19v3" />
          <path d="M8 22h8" />
        </>
      )}
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.08 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.69A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ParticipantVideo({ participantId }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  const {
    displayName,
    webcamOn,
    micOn,
    webcamStream,
    micStream,
    isLocal,
  } = useParticipant(participantId);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !webcamStream?.track) return;

    const stream = new MediaStream([webcamStream.track]);
    video.srcObject = stream;
    video.play().catch(() => {});

    return () => {
      video.srcObject = null;
    };
  }, [webcamStream]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !micStream?.track || isLocal) return;

    const stream = new MediaStream([micStream.track]);
    audio.srcObject = stream;
    audio.play().catch(() => {});

    return () => {
      audio.srcObject = null;
    };
  }, [micStream, isLocal]);

  const participantName = isLocal ? 'You' : (displayName || 'Participant');

  return (
    <article
      className={`vc-participant ${isLocal ? 'vc-participant-local' : 'vc-participant-remote'}`}
      aria-label={`${participantName} video`}
    >
      {webcamOn ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`vc-video ${isLocal ? 'vc-video-local' : ''}`}
        />
      ) : (
        <div className="vc-camera-off">
          <div className="vc-avatar">
            {(displayName || participantName).charAt(0).toUpperCase()}
          </div>
          <span>Camera is off</span>
        </div>
      )}

      {!isLocal && <audio ref={audioRef} autoPlay />}

      <div className="vc-participant-label">
        <span className="vc-participant-name">{participantName}</span>
        <span className={`vc-mic-indicator ${micOn ? 'is-on' : 'is-off'}`}>
          <MicIcon off={!micOn} />
          {micOn ? 'Microphone on' : 'Muted'}
        </span>
      </div>
    </article>
  );
}

function MeetingRoom({ consultation, onExit }) {
  const [meetingStatus, setMeetingStatus] = useState('ready');
  const [meetingError, setMeetingError] = useState('');
  const [entryRequest, setEntryRequest] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const endRequestedRef = useRef(false);

  const isDoctor = consultation.role === 'doctor';

  const {
    join,
    end,
    participants,
    localMicOn,
    localWebcamOn,
    toggleMic,
    toggleWebcam,
  } = useMeeting({
    onMeetingJoined: () => {
      const deadline = Date.parse(consultation.available_until);

      if (Number.isFinite(deadline) && Date.now() >= deadline) {
        setMeetingStatus('time_expired');
        return;
      }

      setMeetingStatus('joined');
      setMeetingError('');
    },

    onMeetingLeft: () => {
      setMeetingStatus((current) => {
        if (current === 'denied') return 'denied';
        if (current === 'time_expired') return 'time_expired';
        return 'ended';
      });
    },

    onEntryRequested: (request) => {
      setEntryRequest(request);
    },

    onEntryResponded: (participantId, decision) => {
      if (
        participantId === consultation.participant_id &&
        decision === 'denied'
      ) {
        setMeetingStatus('denied');
        setMeetingError(
          'Your request to join was declined by the doctor.'
        );
      }
    },

    onError: ({ code, message }) => {
      setMeetingError(
        `Video consultation error (${code}): ${message}`
      );
      setMeetingStatus('error');
    },
  });

  /*
   * End the entire VideoSDK meeting, not just this participant's connection.
   * VideoSDK's end() operation is different from leave():
   * end() terminates the meeting for everyone in the room.
   */
  async function endEntireConsultation(reason = 'manual') {
    if (endRequestedRef.current) return;

    endRequestedRef.current = true;
    setActionLoading(true);
    setMeetingError('');

    try {
      await end();

      setMeetingStatus(
        reason === 'time' ? 'time_expired' : 'ended'
      );
    } catch (error) {
      endRequestedRef.current = false;

      setMeetingError(
        error?.message ||
        'Unable to end the consultation for everyone. Please try again.'
      );

      setActionLoading(false);
    }
  }

  /*
   * Automatically end the consultation when the agreed access window
   * expires: scheduled end time plus the 30-minute grace period.
   */
  useEffect(() => {
    const deadline = Date.parse(consultation.available_until);

    if (!Number.isFinite(deadline)) {
      setMeetingError(
        'The consultation end time could not be verified.'
      );
      return;
    }

    function handleExpiry() {
      if (endRequestedRef.current) return;

      if (meetingStatus === 'joined') {
        endEntireConsultation('time');
        return;
      }

      if (
        meetingStatus === 'ready' ||
        meetingStatus === 'waiting'
      ) {
        setMeetingStatus('time_expired');
      }
    }

    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      handleExpiry();
      return;
    }

    const timer = window.setTimeout(handleExpiry, remaining);

    return () => window.clearTimeout(timer);
  }, [consultation.available_until, meetingStatus]);

  async function handleJoin() {
    const deadline = Date.parse(consultation.available_until);

    if (Number.isFinite(deadline) && Date.now() >= deadline) {
      setMeetingStatus('time_expired');
      return;
    }

    setActionLoading(true);
    setMeetingError('');

    if (!isDoctor) {
      setMeetingStatus('waiting');
    }

    try {
      await join();
    } catch (error) {
      setMeetingError(
        error.message || 'Unable to join the consultation.'
      );
      setMeetingStatus('error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAdmission(allow) {
    if (!entryRequest) return;

    setActionLoading(true);

    try {
      if (allow) {
        entryRequest.allow();
      } else {
        entryRequest.deny();
      }

      setEntryRequest(null);
    } catch {
      setMeetingError('Unable to process the admission request.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleMic() {
    setActionLoading(true);
    setMeetingError('');

    try {
      await toggleMic();
    } catch {
      setMeetingError(
        'Unable to change microphone settings. Check your browser permissions.'
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleCamera() {
    setActionLoading(true);
    setMeetingError('');

    try {
      await toggleWebcam();
    } catch {
      setMeetingError(
        'Unable to change camera settings. Check your browser permissions and make sure another app is not using your camera.'
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeave() {
    await endEntireConsultation('manual');
  }

  const participantIds = [...participants.keys()];

  return (
    <main className="vc-page">
      <div className="vc-content">
        <div className="vc-heading">
          <div>
            <div className="vc-session-details">
              <span className="vc-appointment-number">
                Appointment #{consultation.appointment_id}
              </span>
              <span className="vc-private-status">
                <span className="vc-status-dot" />
                Private consultation
              </span>
            </div>

            <span className="vc-overline">VIRTUAL CARE</span>
            <h1>Video consultation</h1>
            <p>
              A private space to connect with your healthcare provider,
              wherever you are.
            </p>
          </div>

          {meetingStatus === 'joined' && (
            <span className="vc-live-status">
              <span className="vc-live-dot" />
              In consultation
            </span>
          )}
        </div>

        {meetingError && (
          <div className="vc-alert" role="alert">
            <span className="vc-alert-icon">!</span>
            <span>{meetingError}</span>
            <button
              type="button"
              onClick={() => setMeetingError('')}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {meetingStatus === 'ready' && (
          <section className="vc-lobby vc-lobby-redesigned">
            <div className="vc-lobby-main">
              <div className="vc-lobby-copy">
                <span className="vc-overline">YOUR APPOINTMENT</span>
                <h2>Your care, just a click away.</h2>
                <p>
                  You're about to enter your private video consultation.
                  Find a comfortable, quiet place and join when you're ready.
                </p>

                <div className="vc-lobby-appointment-card">
                  <div className="vc-lobby-appointment-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="17" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </div>
                  <div>
                    <span>Appointment reference</span>
                    <strong>#{consultation.appointment_id}</strong>
                  </div>
                  <span className="vc-lobby-appointment-status">
                    <span className="vc-status-dot" />
                    Secure room
                  </span>
                </div>

                <button
                  type="button"
                  className="vc-primary-button vc-join-button"
                  onClick={handleJoin}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Connecting...' : 'Join consultation'}
                  {!actionLoading && (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </button>

                <span className="vc-join-caption">
                  You'll be able to control your camera and microphone
                  during the call.
                </span>
              </div>

              <div className="vc-lobby-visual">
                <div className="vc-lobby-visual-glow" />
                <div className="vc-lobby-video-card">
                  <div className="vc-lobby-video-top">
                    <span className="vc-lobby-video-dot" />
                    PRIVATE VIDEO ROOM
                  </div>
                  <div className="vc-lobby-video-art">
                    <div className="vc-lobby-art-circle">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="6" width="13" height="12" rx="2" />
                        <path d="m16 10 5-3v10l-5-3" />
                      </svg>
                    </div>
                    <span>Connecting care, wherever you are</span>
                  </div>
                  <div className="vc-lobby-video-bottom">
                    <span><MicIcon /> Audio controls</span>
                    <span><CameraIcon /> Video controls</span>
                  </div>
                </div>
                <div className="vc-lobby-floating-shield">
                  <ShieldIcon />
                  <span>Private session</span>
                </div>
              </div>
            </div>

            <div className="vc-preparation-section">
              <div className="vc-preparation-heading">
                <div>
                  <span className="vc-overline">BEFORE YOU JOIN</span>
                  <h3>A quick check for a smooth consultation</h3>
                </div>
                <span className="vc-preparation-time">Takes less than a minute</span>
              </div>

              <div className="vc-preparation-grid">
                <div className="vc-preparation-card">
                  <span className="vc-preparation-icon">
                    <CameraIcon />
                  </span>
                  <div>
                    <strong>Camera</strong>
                    <p>Allow camera access when your browser asks.</p>
                  </div>
                </div>

                <div className="vc-preparation-card">
                  <span className="vc-preparation-icon">
                    <MicIcon />
                  </span>
                  <div>
                    <strong>Microphone</strong>
                    <p>Allow microphone access so your doctor can hear you.</p>
                  </div>
                </div>

                <div className="vc-preparation-card">
                  <span className="vc-preparation-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </span>
                  <div>
                    <strong>Private space</strong>
                    <p>Choose a quiet place where you feel comfortable.</p>
                  </div>
                </div>
              </div>

              <div className="vc-privacy-note">
                <ShieldIcon />
                <p>
                  <strong>Your consultation is private.</strong>
                  {' '}Only the authorised participants can enter this
                  appointment's consultation room.
                </p>
              </div>
            </div>
          </section>
        )}

        {meetingStatus === 'waiting' && (
          <section className="vc-lobby vc-waiting-lobby">
            <div className="vc-waiting-animation">
              <div className="vc-waiting-ring" />
              <div className="vc-waiting-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 8v4l3 2" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </div>
            </div>

            <span className="vc-overline">PLEASE WAIT</span>
            <h2>Waiting for your doctor</h2>
            <p>
              Your request has been sent securely. Your doctor will admit
              you when they are ready.
            </p>

            <div className="vc-waiting-status">
              <span className="vc-waiting-pulse" />
              Waiting for admission
            </div>
          </section>
        )}

        {meetingStatus === 'joined' && (
          <section className="vc-call-section">
            <div className="vc-call-stage">
              {participantIds.length > 0 ? (
                participantIds.map((participantId) => (
                  <ParticipantVideo
                    key={participantId}
                    participantId={participantId}
                  />
                ))
              ) : (
                <div className="vc-empty-call">
                  <div className="vc-waiting-animation">
                    <div className="vc-waiting-ring" />
                    <div className="vc-waiting-icon">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 8v4l3 2" />
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                    </div>
                  </div>
                  <h2>Connecting your consultation</h2>
                  <p>Waiting for the other participant to join...</p>
                </div>
              )}
            </div>

            <div className="vc-control-panel">
              <div className="vc-control-caption">
                <span>CALL CONTROLS</span>
                <small>Manage your audio and video</small>
              </div>

              <div className="vc-controls">
                <button
                  type="button"
                  className={`vc-control-button ${!localMicOn ? 'is-muted' : ''}`}
                  onClick={handleToggleMic}
                  disabled={actionLoading}
                  aria-label={localMicOn ? 'Mute microphone' : 'Unmute microphone'}
                >
                  <span className="vc-control-icon">
                    <MicIcon off={!localMicOn} />
                  </span>
                  <span>{localMicOn ? 'Mute' : 'Unmute'}</span>
                </button>

                <button
                  type="button"
                  className={`vc-control-button ${!localWebcamOn ? 'is-muted' : ''}`}
                  onClick={handleToggleCamera}
                  disabled={actionLoading}
                  aria-label={localWebcamOn ? 'Turn camera off' : 'Turn camera on'}
                >
                  <span className="vc-control-icon">
                    <CameraIcon off={!localWebcamOn} />
                  </span>
                  <span>{localWebcamOn ? 'Stop video' : 'Start video'}</span>
                </button>

                <button
                  type="button"
                  className="vc-control-button vc-leave-button"
                  onClick={handleLeave}
                  disabled={actionLoading}
                >
                  <span className="vc-control-icon">
                    <PhoneIcon />
                  </span>
                  <span>
                    {actionLoading ? 'Ending...' : 'End consultation'}
                  </span>
                </button>
              </div>
            </div>
          </section>
        )}

        {isDoctor && entryRequest && meetingStatus === 'joined' && (
          <div className="vc-admission-backdrop">
            <section
              className="vc-admission-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Patient admission request"
            >
              <div className="vc-admission-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="10" cy="7" r="4" />
                  <path d="M20 8v6M23 11h-6" />
                </svg>
              </div>

              <span className="vc-overline">ADMISSION REQUEST</span>
              <h2>Patient is waiting</h2>
              <p>
                <strong>{entryRequest.name || 'A patient'}</strong> is
                requesting to join your consultation.
              </p>

              <div className="vc-admission-actions">
                <button
                  type="button"
                  className="vc-primary-button"
                  onClick={() => handleAdmission(true)}
                  disabled={actionLoading}
                >
                  Admit patient
                </button>

                <button
                  type="button"
                  className="vc-secondary-button"
                  onClick={() => handleAdmission(false)}
                  disabled={actionLoading}
                >
                  Decline request
                </button>
              </div>
            </section>
          </div>
        )}

        {meetingStatus === 'denied' && (
          <section className="vc-lobby vc-ended-lobby">
            <div className="vc-ended-icon">×</div>
            <span className="vc-overline">CONSULTATION ACCESS</span>
            <h2>Entry declined</h2>
            <p>
              {meetingError || 'Your request to join was declined by the doctor.'}
            </p>
            <button
              type="button"
              onClick={onExit}
              className="vc-primary-button"
            >
              Return to dashboard
            </button>
          </section>
        )}

        {meetingStatus === 'ended' && (
          <section className="vc-lobby vc-ended-lobby">
            <div className="vc-ended-icon">✓</div>
            <span className="vc-overline">CONSULTATION ENDED</span>
            <h2>This consultation has ended</h2>
            <p>
              The consultation room has been closed for both participants.
              Thank you for using Nepal Virtual Care.
            </p>
            <button
              type="button"
              onClick={onExit}
              className="vc-primary-button"
            >
              Return to dashboard
            </button>
          </section>
        )}

        {meetingStatus === 'time_expired' && (
          <section className="vc-lobby vc-ended-lobby">
            <div className="vc-ended-icon">✓</div>
            <span className="vc-overline">TIME WINDOW COMPLETED</span>
            <h2>Consultation time has ended</h2>
            <p>
              The permitted consultation time has expired and the room
              is no longer available.
            </p>
            <button
              type="button"
              onClick={onExit}
              className="vc-primary-button"
            >
              Return to dashboard
            </button>
          </section>
        )}

        {meetingStatus === 'error' && (
          <section className="vc-lobby vc-ended-lobby">
            <div className="vc-ended-icon">!</div>
            <span className="vc-overline">CONNECTION ISSUE</span>
            <h2>Unable to connect</h2>
            <p>
              Check your internet connection and browser permissions,
              then return to your dashboard.
            </p>
            <button
              type="button"
              onClick={onExit}
              className="vc-primary-button"
            >
              Return to dashboard
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

export default function VideoConsultation() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();

  const [consultation, setConsultation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadConsultation() {
      try {
        setLoading(true);
        setError('');

        const data = await getVideoConsultationToken(appointmentId);

        if (active) {
          setConsultation(data);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError.message ||
            'Unable to prepare the video consultation.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadConsultation();

    return () => {
      active = false;
    };
  }, [appointmentId]);

  function handleExit() {
    navigate(
      consultation?.role === 'doctor'
        ? '/doctor-dashboard'
        : '/dashboard'
    );
  }

  if (loading) {
    return (
      <main className="vc-page vc-state-page">
        <div className="vc-state-card">
          <div className="vc-loading-spinner" />
          <h1>Preparing your consultation</h1>
          <p>
            Please wait while we securely connect to your appointment.
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="vc-page vc-state-page">
        <div className="vc-state-card">
          <div className="vc-ended-icon">!</div>
          <h1>Unable to open consultation</h1>
          <p className="vc-state-error">{error}</p>
          <button
            type="button"
            className="vc-primary-button"
            onClick={handleExit}
          >
            Return to dashboard
          </button>
        </div>
      </main>
    );
  }

  if (!consultation?.room_id || !consultation?.token) {
    return (
      <main className="vc-page vc-state-page">
        <div className="vc-state-card">
          <div className="vc-ended-icon">!</div>
          <h1>Consultation unavailable</h1>
          <p>
            The server did not return the required secure room details.
          </p>
          <button
            type="button"
            onClick={handleExit}
            className="vc-primary-button"
          >
            Return to dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <MeetingProvider
      key={`${consultation.room_id}-${consultation.participant_id}`}
      config={{
        meetingId: consultation.room_id,
        name: consultation.participant_name,
        participantId: consultation.participant_id,
        micEnabled: false,
        webcamEnabled: false,
        multistream: false,
      }}
      token={consultation.token}
    >
      <MeetingRoom
        consultation={consultation}
        onExit={handleExit}
      />
    </MeetingProvider>
  );
}
