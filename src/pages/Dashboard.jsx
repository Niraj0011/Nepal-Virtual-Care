
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HeartPulse,
  LayoutDashboard,
  CalendarDays,
  FileHeart,
  ShieldCheck,
  Stethoscope,
  Menu,
  X,
  Plus,
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  AlertCircle,
  UserRound,
  Home,
  Activity,
  Sparkles,
  Video,
  RefreshCw,
} from 'lucide-react';

import { useApp } from '../context/AppContext';
import {
  getAppointments,
  getAvailableSlots,
  createAppointmentRescheduleRequest,
  getMyAppointmentRescheduleRequests,
} from '../api';

function getVideoJoinState(appointment) {
  if (
    (appointment.status || '').toLowerCase() !== 'confirmed' ||
    (appointment.consultation_type || '').toLowerCase() !== 'video consultation'
  ) {
    return 'unavailable';
  }

  if (
    !appointment.preferred_date ||
    !appointment.start_time ||
    !appointment.end_time
  ) {
    return 'unavailable';
  }

  const start = new Date(
    `${appointment.preferred_date}T${appointment.start_time}`
  );

  const end = new Date(
    `${appointment.preferred_date}T${appointment.end_time}`
  );

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'unavailable';
  }

  const now = new Date();
  const allowedStart = new Date(start.getTime() - 15 * 60 * 1000);
  const allowedEnd = new Date(end.getTime() + 30 * 60 * 1000);

  if (now < allowedStart) return 'upcoming';
  if (now > allowedEnd) return 'expired';

  return 'available';
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.requests)) return data.requests;
  if (Array.isArray(data?.slots)) return data.slots;
  if (Array.isArray(data?.available_slots)) return data.available_slots;

  return [];
}

function getSlotStart(slot) {
  if (typeof slot === 'string') return slot;

  return (
    slot?.start_time ||
    slot?.start ||
    slot?.time ||
    ''
  );
}

function getSlotEnd(slot) {
  if (typeof slot === 'string') return '';

  return (
    slot?.end_time ||
    slot?.end ||
    ''
  );
}

function isSlotAvailable(slot) {
  if (typeof slot === 'string') return true;

  if (slot?.is_available === false) return false;
  if (slot?.available === false) return false;
  if (slot?.booked === true) return false;

  return true;
}

function formatTime(value) {
  if (!value) return '';

  const [hours, minutes] = value.split(':');
  const date = new Date();

  date.setHours(Number(hours), Number(minutes || 0), 0, 0);

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getFriendlyRescheduleError(error) {
  const messages = [];

  function collectMessages(value) {
    if (!value) return;

    if (typeof value === 'string') {
      messages.push(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(collectMessages);
      return;
    }

    if (typeof value === 'object') {
      Object.values(value).forEach(collectMessages);
    }
  }

  collectMessages(error?.message);
  collectMessages(error?.data);
  collectMessages(error?.errors);
  collectMessages(error?.response?.data);

  const message = messages.join(' ').trim();

  if (
    message.toLowerCase().includes(
      'appointment has already been rescheduled twice'
    )
  ) {
    return 'This appointment has already been rescheduled twice. If you need to change your appointment again, please contact the clinic.';
  }

  if (
    message.toLowerCase().includes(
      'at least 12 hours before your appointment'
    ) ||
    message.toLowerCase().includes(
      'rescheduling must be requested at least'
    )
  ) {
    return 'Online rescheduling is available only up to 12 hours before your appointment. Please contact the clinic if you need to make a change.';
  }

  if (
    message.toLowerCase().includes(
      'pending reschedule request'
    ) ||
    message.toLowerCase().includes(
      'one pending reschedule'
    )
  ) {
    return 'You already have a rescheduling request awaiting review for this appointment. Please wait for the clinic to respond.';
  }

  if (
    message.toLowerCase().includes('no longer available') ||
    message.toLowerCase().includes('already booked') ||
    message.toLowerCase().includes('overlap')
  ) {
    return 'That appointment time is no longer available. Please choose another available time.';
  }

  if (message) {
    return message
      .replace(/^appointment\s*:\s*/i, '')
      .replace(/[\[\]"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return 'Unable to submit your rescheduling request. Please try again.';
}

function getRequestStatusClass(status) {
  const value = (status || '').toLowerCase();

  if (value === 'approved') return 'dashboard-status success';
  if (value === 'rejected') return 'dashboard-status danger';

  return 'dashboard-status pending';
}

export default function Dashboard() {
  const { user } = useApp();

  const [appointments, setAppointments] = useState([]);
  const [rescheduleRequests, setRescheduleRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [requestedDate, setRequestedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [reason, setReason] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSuccess, setRescheduleSuccess] = useState('');

  const role = (user?.role || 'patient').toLowerCase();

  const firstName =
    user?.first_name ||
    user?.name ||
    user?.username ||
    'there';

  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.name ||
    user?.username ||
    'Your account';

  const isNewPatient = (() => {
    if (!user?.date_joined) return false;

    const createdAt = new Date(user.date_joined);

    if (Number.isNaN(createdAt.getTime())) return false;

    const today = new Date();

    return (
      createdAt.getFullYear() === today.getFullYear() &&
      createdAt.getMonth() === today.getMonth() &&
      createdAt.getDate() === today.getDate()
    );
  })();

  async function loadRescheduleRequests() {
    try {
      const data = await getMyAppointmentRescheduleRequests();
      setRescheduleRequests(normalizeList(data));
    } catch {
      setRescheduleRequests([]);
    }
  }

  async function loadAppointments() {
    try {
      setLoading(true);
      setError('');

      const data = await getAppointments();

      setAppointments(
        Array.isArray(data) ? data : data.results || []
      );
    } catch (err) {
      setError(err.message || 'Unable to load appointments.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError('');

        const data = await getAppointments();

        if (active) {
          setAppointments(
            Array.isArray(data) ? data : data.results || []
          );
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to load appointments.');
        }
      } finally {
        if (active) setLoading(false);
      }

      try {
        const requests = await getMyAppointmentRescheduleRequests();

        if (active) {
          setRescheduleRequests(normalizeList(requests));
        }
      } catch {
        if (active) setRescheduleRequests([]);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSlots() {
      if (!rescheduleOpen || !selectedAppointment || !requestedDate) {
        setAvailableSlots([]);
        return;
      }

      const providerId =
        selectedAppointment.provider_id ||
        selectedAppointment.provider?.id ||
        selectedAppointment.provider;

      if (!providerId) {
        setRescheduleError(
          'The provider information for this appointment is unavailable.'
        );
        setAvailableSlots([]);
        return;
      }

      try {
        setSlotsLoading(true);
        setRescheduleError('');
        setSelectedSlot('');

        const data = await getAvailableSlots(providerId, requestedDate);

        if (active) {
          const slots = normalizeList(data).filter(isSlotAvailable);
          setAvailableSlots(slots);
        }
      } catch (err) {
        if (active) {
          setAvailableSlots([]);
          setRescheduleError(
            err.message || 'Unable to load available appointment slots.'
          );
        }
      } finally {
        if (active) setSlotsLoading(false);
      }
    }

    loadSlots();

    return () => {
      active = false;
    };
  }, [rescheduleOpen, selectedAppointment, requestedDate]);

  const closeSidebar = () => setSidebarOpen(false);

  const navigation = [
    {
      label: 'Overview',
      icon: LayoutDashboard,
      path: '/dashboard',
      active: true,
    },
    {
      label: 'My Health Records',
      icon: FileHeart,
      path: '/records',
    },
    {
      label: 'Appointments',
      icon: CalendarDays,
      path: '/virtual-care',
    },
    {
      label: 'Privacy & Consent',
      icon: ShieldCheck,
      path: '/consent',
    },
  ];

  const quickActions = [
    {
      title: 'My profile',
      description: 'View and update your personal details.',
      icon: UserRound,
      path: '/profile',
      color: 'green',
      label: 'YOUR PROFILE',
    },
    {
      title: 'Book a consultation',
      description: 'Connect with a healthcare provider.',
      icon: CalendarDays,
      path: '/virtual-care',
      color: 'green',
      label: 'GET STARTED',
    },
    {
      title: 'View health records',
      description: 'Access your personal health information.',
      icon: FileHeart,
      path: '/records',
      color: 'blue',
      label: 'YOUR RECORDS',
    },
    {
      title: 'Privacy preferences',
      description: 'Manage how your information is used.',
      icon: ShieldCheck,
      path: '/consent',
      color: 'purple',
      label: 'YOUR PRIVACY',
    },
    {
      title: 'Account security',
      description: 'Review active sessions and secure your account.',
      icon: ShieldCheck,
      path: '/account-security',
      color: 'purple',
      label: 'ACCOUNT SECURITY',
    },
  ];

  const getStatusClass = (status) => {
    const value = (status || '').toLowerCase();

    if (['approved', 'confirmed', 'completed'].includes(value)) {
      return 'dashboard-status success';
    }

    if (['cancelled', 'rejected'].includes(value)) {
      return 'dashboard-status danger';
    }

    return 'dashboard-status pending';
  };

  const getStatusIcon = (status) => {
    const value = (status || '').toLowerCase();

    if (['approved', 'confirmed', 'completed'].includes(value)) {
      return <CheckCircle2 size={14} />;
    }

    if (['cancelled', 'rejected'].includes(value)) {
      return <AlertCircle size={14} />;
    }

    return <Clock3 size={14} />;
  };

  const confirmedAppointments = appointments.filter((appointment) =>
    ['approved', 'confirmed', 'completed'].includes(
      (appointment.status || '').toLowerCase()
    )
  ).length;

  const pendingAppointments = appointments.filter((appointment) =>
    !['approved', 'confirmed', 'completed', 'cancelled', 'rejected'].includes(
      (appointment.status || '').toLowerCase()
    )
  ).length;

  function getAppointmentRescheduleRequest(appointmentId) {
    return rescheduleRequests.find(
      (request) =>
        Number(request.appointment) === Number(appointmentId) &&
        (request.status || '').toLowerCase() === 'pending'
    );
  }

  function isRescheduleEligibleStatus(appointment) {
    return ['pending', 'confirmed'].includes(
      (appointment.status || '').toLowerCase()
    );
  }

  function canReschedule(appointment) {
    return isRescheduleEligibleStatus(appointment);
  }

  function openRescheduleModal(appointment) {
    if (!canReschedule(appointment)) return;

    setSelectedAppointment(appointment);
    setRequestedDate('');
    setAvailableSlots([]);
    setSelectedSlot('');
    setReason('');
    setRescheduleError('');
    setRescheduleSuccess('');
    setRescheduleOpen(true);
  }

  function closeRescheduleModal() {
    if (submitting) return;

    setRescheduleOpen(false);
    setSelectedAppointment(null);
    setRequestedDate('');
    setAvailableSlots([]);
    setSelectedSlot('');
    setReason('');
    setRescheduleError('');
  }

  async function submitRescheduleRequest(event) {
    event.preventDefault();

    if (!selectedAppointment) return;

    if (!selectedSlot) {
      setRescheduleError('Please select an available time slot.');
      return;
    }

    if (!reason.trim()) {
      setRescheduleError('Please provide a reason for rescheduling.');
      return;
    }

    const selectedSlotData = availableSlots.find(
      (slot) => getSlotStart(slot) === selectedSlot
    );

    const endTime = getSlotEnd(selectedSlotData);

    if (!endTime) {
      setRescheduleError(
        'The selected time slot is missing its end time. Please choose another date.'
      );
      return;
    }

    try {
      setSubmitting(true);
      setRescheduleError('');

      await createAppointmentRescheduleRequest({
        appointment: selectedAppointment.id,
        requested_date: requestedDate,
        requested_start_time: selectedSlot,
        requested_end_time: endTime,
        reason: reason.trim(),
      });

      setRescheduleSuccess(
        'Your rescheduling request has been submitted. Your existing appointment will remain unchanged until it is reviewed.'
      );

      await Promise.all([
        loadRescheduleRequests(),
        loadAppointments(),
      ]);

      setRescheduleOpen(false);
      setSelectedAppointment(null);
      setRequestedDate('');
      setAvailableSlots([]);
      setSelectedSlot('');
      setReason('');
    } catch (err) {
      setRescheduleError(getFriendlyRescheduleError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-layout patient-dashboard">

      {sidebarOpen && (
        <button
          className="dashboard-overlay"
          onClick={closeSidebar}
          aria-label="Close navigation"
        />
      )}

      <aside
        className={`dashboard-sidebar ${
          sidebarOpen ? 'sidebar-open' : ''
        }`}
      >
        <button
          className="dashboard-close dashboard-sidebar-close"
          onClick={closeSidebar}
          aria-label="Close sidebar"
        >
          <X size={21} />
        </button>

        <div className="dashboard-sidebar-profile">
          <div className="dashboard-sidebar-profile-avatar">
            {user?.profile_photo || user?.patient_profile?.profile_photo || user?.profile?.profile_photo ? (
              <img
                src={user?.profile_photo || user?.patient_profile?.profile_photo || user?.profile?.profile_photo}
                alt="Account profile"
              />
            ) : (
              <UserRound size={21} />
            )}
          </div>
          <div className="dashboard-sidebar-profile-info">
            <strong>{fullName}</strong>
            <span>Patient account</span>
          </div>
          <span className="dashboard-sidebar-online" />
        </div>

        <div className="dashboard-nav-label">
          WORKSPACE
        </div>

        <nav className="dashboard-nav">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={closeSidebar}
                className={`dashboard-nav-link ${
                  item.active ? 'active' : ''
                }`}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {item.active && (
                  <span className="dashboard-nav-indicator" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="dashboard-sidebar-bottom">
          <div className="dashboard-help-card">
            <div className="dashboard-help-icon">
              <Stethoscope size={21} />
            </div>

            <strong>Need medical care?</strong>

            <p>
              Find a trusted healthcare provider and request a consultation.
            </p>

            <Link to="/virtual-care" onClick={closeSidebar}>
              Find a provider <ArrowUpRight size={15} />
            </Link>
          </div>

          <Link
            to="/"
            className="dashboard-home-link"
            onClick={closeSidebar}
          >
            <Home size={18} />
            Back to website
          </Link>
        </div>
      </aside>

      <main className="dashboard-main">

        <header className="dashboard-topbar">
          <div className="dashboard-topbar-left">
            <button
              className="dashboard-menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>

            <div>
              <span className="dashboard-breadcrumb">
                Workspace / Overview
              </span>

              <h2>My Dashboard</h2>
            </div>
          </div>

        </header>

        <div className="dashboard-content">

          <section className="dashboard-welcome patient-welcome">
            <div className="dashboard-welcome-text">
              <span className="dashboard-eyebrow">
                <Sparkles size={13} />
                NEPAL VIRTUAL CARE
              </span>

              <h1>
                {isNewPatient ? (
                  <>
                    Welcome to Nepal Virtual Care, <em>{firstName}!</em>
                  </>
                ) : (
                  <>
                    Welcome back, <em>{firstName}!</em>
                  </>
                )}
              </h1>

              <p>
                {isNewPatient
                  ? 'Your account is ready. Start exploring healthcare services, connect with providers and keep your health information organised.'
                  : 'Your health matters. Stay connected with your healthcare journey, appointments and personal medical records.'}
              </p>

              {role === 'patient' && (
                <Link
                  to="/virtual-care"
                  className="dashboard-primary-button"
                >
                  <Plus size={18} />
                  Book a consultation
                  <ArrowUpRight size={16} />
                </Link>
              )}
            </div>

            <div className="dashboard-welcome-art">
              <div className="dashboard-art-circle">
                <HeartPulse size={68} strokeWidth={1.5} />
              </div>

              <span className="dashboard-art-badge">
                <ShieldCheck size={18} />
                Your health matters
              </span>
            </div>
          </section>

          <section className="dashboard-stats patient-dashboard-stats">

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon green">
                <CalendarDays size={21} />
              </div>

              <div>
                <span>Total appointments</span>

                <strong>
                  {loading ? '...' : appointments.length}
                </strong>

                <small>All consultation requests</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon blue">
                <CheckCircle2 size={21} />
              </div>

              <div>
                <span>Confirmed & completed</span>

                <strong>
                  {loading ? '...' : confirmedAppointments}
                </strong>

                <small>Approved consultations</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon purple">
                <Clock3 size={21} />
              </div>

              <div>
                <span>Awaiting response</span>

                <strong>
                  {loading ? '...' : pendingAppointments}
                </strong>

                <small>Pending requests</small>
              </div>
            </div>

          </section>

          {rescheduleSuccess && (
            <div
              role="status"
              style={{
                marginBottom: 18,
                padding: '13px 16px',
                borderRadius: 12,
                background: '#ecfdf5',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <CheckCircle2 size={19} />
              <span>{rescheduleSuccess}</span>
              <button
                type="button"
                onClick={() => setRescheduleSuccess('')}
                aria-label="Dismiss message"
                style={{
                  marginLeft: 'auto',
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <X size={17} />
              </button>
            </div>
          )}

          <section className="dashboard-lower-grid">

            <div className="dashboard-section-card">
              <div className="dashboard-card-heading">
                <div>
                  <span className="dashboard-section-kicker">
                    YOUR HEALTHCARE ACTIVITY
                  </span>

                  <h3>Recent appointments</h3>

                  <p className="dashboard-heading-description">
                    Keep track of your consultation requests.
                  </p>
                </div>

                <Link to="/virtual-care">
                  View all <ArrowUpRight size={15} />
                </Link>
              </div>

              {error && (
                <p className="dashboard-error">{error}</p>
              )}

              {loading ? (
                <div className="dashboard-empty">
                  Loading your appointments...
                </div>
              ) : appointments.length > 0 ? (
                <div className="dashboard-appointments">
                  {appointments.slice(0, 5).map((appointment) => {
                    const videoJoinState = getVideoJoinState(appointment);
                    const pendingRequest =
                      getAppointmentRescheduleRequest(appointment.id);

                    const rescheduleEligible =
                      isRescheduleEligibleStatus(appointment);

                    return (
                      <article
                        className="dashboard-appointment"
                        key={appointment.id}
                      >
                        <div className="dashboard-appointment-icon">
                          <Stethoscope size={21} />
                        </div>

                        <div className="dashboard-appointment-info">
                          <strong>
                            {appointment.provider_name || 'Healthcare provider'}
                          </strong>

                          <span>
                            {appointment.preferred_date || 'Date not specified'}
                            {appointment.start_time
                              ? ` Â· ${formatTime(appointment.start_time)}`
                              : ''}
                            {appointment.end_time
                              ? ` â€“ ${formatTime(appointment.end_time)}`
                              : ''}
                          </span>

                          <small>
                            {appointment.consultation_type || 'Consultation'}
                          </small>

                          {videoJoinState === 'available' && (
                            <Link
                              to={`/video-consultation/${appointment.id}`}
                              className="dashboard-video-join"
                            >
                              <Video size={15} />
                              Join consultation
                            </Link>
                          )}

                          {videoJoinState === 'upcoming' && (
                            <span className="dashboard-video-upcoming">
                              <Clock3 size={14} />
                              Join available 15 minutes before your appointment
                            </span>
                          )}

                          {videoJoinState === 'expired' && (
                            <span className="dashboard-video-expired">
                              Consultation access window has ended
                            </span>
                          )}

                          {pendingRequest && (
                            <span
                              className="dashboard-video-upcoming"
                              style={{ marginTop: 7 }}
                            >
                              <RefreshCw size={14} />
                              Rescheduling request awaiting review
                            </span>
                          )}

                          {rescheduleEligible && !pendingRequest && (
                            <button
                              type="button"
                              onClick={() => openRescheduleModal(appointment)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 7,
                                marginTop: 10,
                                padding: '8px 12px',
                                border: '1px solid #cfe5dc',
                                borderRadius: 9,
                                background: '#f0faf5',
                                color: '#16734b',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              <RefreshCw size={13} />
                              Request reschedule
                            </button>
                          )}

                          {rescheduleRequests
                            .filter(
                              (request) =>
                                Number(request.appointment) ===
                                Number(appointment.id)
                            )
                            .filter(
                              (request) =>
                                (request.status || '').toLowerCase() !==
                                'pending'
                            )
                            .slice(0, 1)
                            .map((request) => (
                              <div
                                key={request.id}
                                style={{
                                  marginTop: 8,
                                  fontSize: 12,
                                  color: '#64748b',
                                }}
                              >
                                <span
                                  className={getRequestStatusClass(request.status)}
                                >
                                  {request.status}
                                </span>

                                {request.status === 'Rejected' &&
                                  request.admin_response && (
                                    <p style={{ marginTop: 5 }}>
                                      Response: {request.admin_response}
                                    </p>
                                  )}
                              </div>
                            ))}
                        </div>

                        <span className={getStatusClass(appointment.status)}>
                          {getStatusIcon(appointment.status)}
                          {appointment.status || 'Pending'}
                        </span>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="dashboard-empty">
                  <div className="dashboard-empty-icon">
                    <CalendarDays size={27} />
                  </div>

                  <strong>No appointments yet</strong>

                  <p>
                    You haven't requested a consultation yet.
                    Start by finding a healthcare provider.
                  </p>

                  <Link to="/virtual-care">
                    Find a provider <ArrowUpRight size={15} />
                  </Link>
                </div>
              )}
            </div>

            <div className="dashboard-section-card">
              <div className="dashboard-card-heading">
                <div>
                  <span className="dashboard-section-kicker">
                    PERSONAL HEALTHCARE
                  </span>

                  <h3>Quick actions</h3>

                  <p className="dashboard-heading-description">
                    Everything you need, in one place.
                  </p>
                </div>
              </div>

              <div className="dashboard-quick-actions">
                {quickActions.map((action) => {
                  const Icon = action.icon;

                  return (
                    <Link
                      to={action.path}
                      className="dashboard-action"
                      key={action.title}
                    >
                      <span className={`dashboard-action-icon ${action.color}`}>
                        <Icon size={21} />
                      </span>

                      <span className="dashboard-action-text">
                        <strong>{action.title}</strong>
                        <small>{action.description}</small>
                      </span>

                      <ArrowUpRight
                        className="dashboard-action-arrow"
                        size={18}
                      />
                    </Link>
                  );
                })}
              </div>
            </div>

          </section>

          <section className="patient-dashboard-note">
            <div className="patient-dashboard-note-icon">
              <Activity size={21} />
            </div>

            <div>
              <strong>Your healthcare, connected.</strong>

              <p>
                Keep your health information organised and stay informed
                about your consultation activity.
              </p>
            </div>

            <ShieldCheck size={23} className="patient-dashboard-note-shield" />
          </section>

          <footer className="dashboard-footer">
            <HeartPulse size={17} />
            <span>
              Healthcare without borders. Your health, our priority.
            </span>
          </footer>

        </div>
      </main>

      {rescheduleOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeRescheduleModal();
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.58)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-title"
            style={{
              width: '100%',
              maxWidth: 490,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 18,
              padding: 24,
              boxShadow: '0 24px 70px rgba(0,0,0,0.22)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: '#ecfdf5',
                    color: '#16734b',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw size={20} />
                </div>

                <div>
                  <h3
                    id="reschedule-title"
                    style={{
                      margin: 0,
                      fontSize: 19,
                      color: '#172b25',
                    }}
                  >
                    Request rescheduling
                  </h3>

                  <p
                    style={{
                      margin: '4px 0 0',
                      color: '#64748b',
                      fontSize: 12,
                    }}
                  >
                    Choose a new appointment time
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeRescheduleModal}
                disabled={submitting}
                aria-label="Close rescheduling form"
                style={{
                  border: 0,
                  background: '#f1f5f9',
                  color: '#475569',
                  borderRadius: 8,
                  cursor: 'pointer',
                  padding: 7,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <X size={19} />
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 9,
                padding: 12,
                background: '#f0fdf4',
                border: '1px solid #dcfce7',
                borderRadius: 10,
                marginBottom: 18,
                color: '#166534',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              <ShieldCheck size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Your current appointment will remain unchanged until your
                rescheduling request is reviewed and approved.
              </span>
            </div>

            {selectedAppointment && (
              <div
                style={{
                  padding: 15,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 11,
                  marginBottom: 21,
                }}
              >
                <span
                  style={{
                    display: 'block',
                    color: '#64748b',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    marginBottom: 6,
                  }}
                >
                  CURRENT APPOINTMENT
                </span>

                <strong
                  style={{
                    display: 'block',
                    fontSize: 14,
                    color: '#1e293b',
                  }}
                >
                  {selectedAppointment.provider_name || 'Healthcare provider'}
                </strong>

                <p
                  style={{
                    margin: '5px 0 0',
                    color: '#64748b',
                    fontSize: 12,
                  }}
                >
                  {selectedAppointment.preferred_date}
                  {selectedAppointment.start_time
                    ? ` Â· ${formatTime(selectedAppointment.start_time)}`
                    : ''}
                </p>
              </div>
            )}

            <form onSubmit={submitRescheduleRequest}>
              <label
                htmlFor="reschedule-date"
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#334155',
                  marginBottom: 8,
                }}
              >
                1. Choose a new date
              </label>

              <input
                id="reschedule-date"
                type="date"
                value={requestedDate}
                min={getLocalDateString()}
                onChange={(event) => setRequestedDate(event.target.value)}
                required
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '12px 13px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 9,
                  marginBottom: 20,
                  font: 'inherit',
                  fontSize: 13,
                  boxSizing: 'border-box',
                  color: '#334155',
                  background: '#fff',
                }}
              />

              <label
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#334155',
                  marginBottom: 8,
                }}
              >
                2. Select an available time
              </label>

              {!requestedDate ? (
                <div
                  style={{
                    padding: 15,
                    borderRadius: 10,
                    background: '#f8fafc',
                    color: '#64748b',
                    fontSize: 12,
                    textAlign: 'center',
                    marginBottom: 20,
                  }}
                >
                  Choose a date to see available appointment times.
                </div>
              ) : slotsLoading ? (
                <div
                  style={{
                    padding: 18,
                    textAlign: 'center',
                    color: '#64748b',
                    fontSize: 12,
                    marginBottom: 20,
                  }}
                >
                  Loading available times...
                </div>
              ) : availableSlots.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                    gap: 9,
                    marginBottom: 20,
                  }}
                >
                  {availableSlots.map((slot, index) => {
                    const start = getSlotStart(slot);
                    const end = getSlotEnd(slot);
                    const isSelected = selectedSlot === start;

                    return (
                      <button
                        key={`${start}-${index}`}
                        type="button"
                        onClick={() => setSelectedSlot(start)}
                        disabled={submitting || !start || !end}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 7,
                          padding: '12px 9px',
                          borderRadius: 9,
                          border: isSelected
                            ? '2px solid #16845b'
                            : '1px solid #e2e8f0',
                          background: isSelected ? '#ecfdf5' : '#fff',
                          color: isSelected ? '#166534' : '#334155',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isSelected && <CheckCircle2 size={14} />}
                        {formatTime(start)}
                        {end ? ` â€“ ${formatTime(end)}` : ''}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: 13,
                    borderRadius: 10,
                    background: '#f8fafc',
                    color: '#64748b',
                    fontSize: 12,
                    marginBottom: 20,
                  }}
                >
                  No available slots were found for this date. Please choose
                  another date.
                </div>
              )}

              <label
                htmlFor="reschedule-reason"
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#334155',
                  marginBottom: 8,
                }}
              >
                3. Reason for rescheduling
              </label>

              <textarea
                id="reschedule-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Briefly explain why you need to reschedule..."
                maxLength={1000}
                rows={3}
                required
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 12,
                  border: '1px solid #cbd5e1',
                  borderRadius: 9,
                  resize: 'vertical',
                  font: 'inherit',
                  fontSize: 13,
                  boxSizing: 'border-box',
                  marginBottom: 5,
                  lineHeight: 1.5,
                }}
              />

              <p
                style={{
                  textAlign: 'right',
                  color: '#94a3b8',
                  fontSize: 11,
                  margin: '0 0 16px',
                }}
              >
                {reason.length}/1000
              </p>

              {rescheduleError && (
                <div
                  role="alert"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    color: '#9a3412',
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    padding: 12,
                    borderRadius: 9,
                    fontSize: 12,
                    lineHeight: 1.6,
                    marginBottom: 16,
                  }}
                >
                  <AlertCircle
                    size={17}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  <div>
                    {rescheduleError.toLowerCase().includes(
                      'already been rescheduled twice'
                    ) ? (
                      <>
                        <strong
                          style={{
                            display: 'block',
                            marginBottom: 3,
                            color: '#9a3412',
                          }}
                        >
                          Rescheduling limit reached
                        </strong>
                        {rescheduleError}
                      </>
                    ) : (
                      rescheduleError
                    )}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 9,
                  flexWrap: 'wrap',
                  paddingTop: 14,
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <button
                  type="button"
                  onClick={closeRescheduleModal}
                  disabled={submitting}
                  style={{
                    padding: '11px 17px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 9,
                    background: '#fff',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    slotsLoading ||
                    !requestedDate ||
                    !selectedSlot ||
                    !reason.trim()
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 18px',
                    border: 0,
                    borderRadius: 9,
                    background: '#16734b',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: submitting ? 'wait' : 'pointer',
                    opacity:
                      submitting ||
                      slotsLoading ||
                      !requestedDate ||
                      !selectedSlot ||
                      !reason.trim()
                        ? 0.55
                        : 1,
                  }}
                >
                  {submitting ? 'Submitting...' : 'Submit request'}
                  {!submitting && <ArrowUpRight size={15} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
