
import { useEffect, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  useNavigate,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

import {
  HeartPulse,
  Menu,
  X,
  UserRound,
  LogOut,
  Stethoscope,
  BookOpen,
  Users,
  FileHeart,
  Home,
  LayoutDashboard,
  Bell,
  CheckCheck,
  Check,
  Clock3,
  CalendarDays,
  ShieldCheck,
} from 'lucide-react';

import { useApp } from '../context/AppContext';

import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  getDoctorProfilePhoto,
} from '../api';

function normalizeNotifications(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function formatNotificationDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [updatingNotification, setUpdatingNotification] = useState(null);
  const [doctorProfilePhoto, setDoctorProfilePhoto] = useState(null);

  const notificationRef = useRef(null);

  const { user, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();

  const role = user?.role || 'guest';

  const isVideoConsultationPage =
    location.pathname.startsWith('/video-consultation');

  const loadNotifications = async (showLoading = false) => {
    if (!user) return;

    if (showLoading) {
      setNotificationsLoading(true);
    }

    try {
      const [notificationData, countData] = await Promise.all([
        getNotifications(),
        getUnreadNotificationCount(),
      ]);

      setNotifications(normalizeNotifications(notificationData));
      setUnreadCount(
        Number(countData?.unread_count ?? countData?.count ?? 0)
      );
      setNotificationsError('');
    } catch (error) {
      setNotificationsError(
        error.message || 'Unable to load notifications.'
      );
    } finally {
      if (showLoading) {
        setNotificationsLoading(false);
      }
    }
  };

  useEffect(() => {
    const handleAuthExpired = () => {
      setOpen(false);
      setNotificationsOpen(false);
      navigate('/login', { replace: true });
    };

    window.addEventListener('nvc:auth-expired', handleAuthExpired);

    return () => {
      window.removeEventListener('nvc:auth-expired', handleAuthExpired);
    };
  }, [navigate]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setNotificationsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target)
      ) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsideClick);

    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
    setNotificationsOpen(false);

    if (
      location.hash === '#doctor-appointments' ||
      location.hash === '#doctor-reschedule-requests'
    ) {
      return;
    }

    if (navigationType === 'POP') {
      return;
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
  }, [
    location.pathname,
    location.search,
    location.hash,
    navigationType,
  ]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationsOpen(false);
      return;
    }

    loadNotifications();

    const interval = window.setInterval(() => {
      loadNotifications();
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user?.id, user?.username, user?.role]);

  useEffect(() => {
    let isActive = true;

    if (!user || role !== 'doctor') {
      setDoctorProfilePhoto(null);

      return () => {
        isActive = false;
      };
    }

    const loadDoctorPhoto = async () => {
      try {
        const data = await getDoctorProfilePhoto();

        if (isActive) {
          setDoctorProfilePhoto(data?.profile_photo || null);
        }
      } catch (error) {
        console.error('Unable to load doctor profile photo:', error);

        if (isActive) {
          setDoctorProfilePhoto(null);
        }
      }
    };

    loadDoctorPhoto();

    return () => {
      isActive = false;
    };
  }, [user?.id, user?.username, role, location.pathname]);

  const commonLinks = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Virtual Care', path: '/virtual-care', icon: Stethoscope },
    {
      label: 'Health Information',
      path: '/health-information',
      icon: BookOpen,
    },
    { label: 'Community', path: '/community', icon: Users },
  ];

  const accountSecurityLink = {
    label: 'Account Security',
    path: '/account-security',
    icon: ShieldCheck,
  };

  const patientLinks = [
    ...commonLinks,
    { label: 'My Health Record', path: '/records', icon: FileHeart },
    accountSecurityLink,
    {
      label: 'Patient Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
    },
  ];

  const doctorLinks = [
    ...commonLinks,
    accountSecurityLink,
    {
      label: 'Doctor Dashboard',
      path: '/doctor-dashboard',
      icon: LayoutDashboard,
    },
  ];

  const adminLinks = [
    ...commonLinks,
    accountSecurityLink,
    {
      label: 'Admin Dashboard',
      path: '/admin-dashboard',
      icon: LayoutDashboard,
    },
  ];

  const links =
    role === 'admin'
      ? adminLinks
      : role === 'doctor'
        ? doctorLinks
        : role === 'patient'
          ? patientLinks
          : commonLinks;

  const closeMenu = () => setOpen(false);

  const toggleMenu = () => setOpen((previous) => !previous);

  const handleNavigationClick = () => {
    closeMenu();
    setNotificationsOpen(false);

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
  };

  const handleLogout = async () => {
    closeMenu();
    setNotificationsOpen(false);

    try {
      await logout();
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.name ||
    user?.username ||
    'My Account';

  const roleLabel = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'Account';

  const dashboardPath =
    role === 'admin'
      ? '/admin-dashboard'
      : role === 'doctor'
        ? '/doctor-dashboard'
        : '/dashboard';

  const accountPath =
    role === 'patient' || role === 'doctor'
      ? '/profile'
      : dashboardPath;

  const profilePhoto =
    role === 'doctor'
      ? doctorProfilePhoto
      : user?.profile_photo || null;

  const toggleNotifications = async () => {
    const nextState = !notificationsOpen;

    setNotificationsOpen(nextState);
    setOpen(false);

    if (nextState) {
      await loadNotifications(true);
    }
  };

  const handleMarkRead = async (notificationId) => {
    if (updatingNotification === notificationId) return;

    setUpdatingNotification(notificationId);

    try {
      await markNotificationRead(notificationId);

      setNotifications((previous) =>
        previous.map((notification) =>
          notification.id === notificationId
            ? { ...notification, is_read: true }
            : notification
        )
      );

      setUnreadCount((previous) => Math.max(0, previous - 1));
    } catch (error) {
      setNotificationsError(
        error.message || 'Unable to update this notification.'
      );
    } finally {
      setUpdatingNotification(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;

    try {
      await markAllNotificationsRead();

      setNotifications((previous) =>
        previous.map((notification) => ({
          ...notification,
          is_read: true,
        }))
      );

      setUnreadCount(0);
      setNotificationsError('');
    } catch (error) {
      setNotificationsError(
        error.message || 'Unable to mark notifications as read.'
      );
    }
  };

  const handleViewAppointment = async (notification) => {
    setNotificationsOpen(false);
    closeMenu();

    if (!notification.is_read) {
      try {
        await markNotificationRead(notification.id);

        setNotifications((previous) =>
          previous.map((item) =>
            item.id === notification.id
              ? { ...item, is_read: true }
              : item
          )
        );

        setUnreadCount((previous) => Math.max(0, previous - 1));
      } catch (error) {
        setNotificationsError(
          error.message || 'Unable to mark notification as read.'
        );
      }
    }

    const isRescheduleNotification =
      notification.notification_type === 'appointment_reschedule_requested';

    if (isRescheduleNotification) {
      navigate('/doctor-dashboard#doctor-reschedule-requests');
    } else {
      navigate('/doctor-dashboard#doctor-appointments');
    }
  };

  if (isVideoConsultationPage) {
    return (
      <main className="video-consultation-page">
        {children}
      </main>
    );
  }

  return (
    <>
      <header className="nvc-header">
        <div className="nvc-nav-container">
          <Link
            to="/"
            className="nvc-brand"
            onClick={handleNavigationClick}
            aria-label="Nepal Virtual Care home"
          >
            <span className="nvc-brand-icon">
              <HeartPulse size={27} strokeWidth={2.2} />
            </span>

            <span className="nvc-brand-text">
              <strong>
                Nepal<span>Virtual Care</span>
              </strong>
              <small>HEALTHCARE WITHOUT BORDERS</small>
            </span>
          </Link>

          <button
            type="button"
            className="nvc-menu-toggle"
            onClick={toggleMenu}
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={open}
            aria-controls="nvc-main-navigation"
          >
            {open ? <X size={23} /> : <Menu size={23} />}
          </button>

          <nav
            id="nvc-main-navigation"
            className={`nvc-navigation ${open ? 'nvc-navigation-open' : ''}`}
            aria-label="Main navigation"
          >
            <div className="nvc-nav-links">
              {links.map(({ label, path, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/'}
                  onClick={handleNavigationClick}
                  className={({ isActive }) =>
                    isActive ? 'nvc-nav-link active' : 'nvc-nav-link'
                  }
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>

            <div className="nvc-nav-actions">
              {user ? (
                <>
                  <div
                    ref={notificationRef}
                    className="nvc-notification-wrapper"
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="nvc-notification-button"
                      onClick={toggleNotifications}
                      aria-label={`Notifications, ${unreadCount} unread`}
                      aria-expanded={notificationsOpen}
                      title="Notifications"
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        border: '1px solid #e2e8f0',
                        background: notificationsOpen ? '#eff6ff' : '#ffffff',
                        color: '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      <Bell size={19} />

                      {unreadCount > 0 && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '-4px',
                            right: '-4px',
                            minWidth: '19px',
                            height: '19px',
                            padding: '0 4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '20px',
                            background: '#dc2626',
                            color: '#ffffff',
                            fontSize: '11px',
                            fontWeight: 700,
                            border: '2px solid #ffffff',
                          }}
                        >
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {notificationsOpen && (
                      <div
                        className="nvc-notification-panel"
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 12px)',
                          right: 0,
                          width: 'min(360px, calc(100vw - 28px))',
                          maxHeight: 'min(440px, calc(100vh - 100px))',
                          display: 'flex',
                          flexDirection: 'column',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '14px',
                          boxShadow: '0 12px 35px rgba(15, 23, 42, 0.16)',
                          zIndex: 10000,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            padding: '16px',
                            borderBottom: '1px solid #e2e8f0',
                          }}
                        >
                          <div>
                            <strong
                              style={{
                                display: 'block',
                                color: '#0f172a',
                                fontSize: '15px',
                              }}
                            >
                              Notifications
                            </strong>

                            <small style={{ color: '#64748b' }}>
                              {unreadCount} unread
                            </small>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            {unreadCount > 0 && (
                              <button
                                type="button"
                                onClick={handleMarkAllRead}
                                title="Mark all as read"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  border: 0,
                                  background: 'transparent',
                                  color: '#2563eb',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <CheckCheck size={15} />
                                Mark all read
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setNotificationsOpen(false)}
                              aria-label="Close notifications"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: 0,
                                background: 'transparent',
                                color: '#64748b',
                                cursor: 'pointer',
                              }}
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            overflowY: 'auto',
                            minHeight: 0,
                          }}
                        >
                          {notificationsLoading ? (
                            <div
                              style={{
                                padding: '28px 16px',
                                textAlign: 'center',
                                color: '#64748b',
                                fontSize: '13px',
                              }}
                            >
                              Loading notifications...
                            </div>
                          ) : notificationsError && notifications.length === 0 ? (
                            <div
                              style={{
                                padding: '24px 16px',
                                textAlign: 'center',
                                color: '#dc2626',
                                fontSize: '13px',
                              }}
                            >
                              {notificationsError}

                              <button
                                type="button"
                                onClick={() => loadNotifications(true)}
                                style={{
                                  display: 'block',
                                  margin: '12px auto 0',
                                  border: 0,
                                  background: 'transparent',
                                  color: '#2563eb',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                              >
                                Try again
                              </button>
                            </div>
                          ) : notifications.length === 0 ? (
                            <div
                              style={{
                                padding: '32px 16px',
                                textAlign: 'center',
                                color: '#64748b',
                              }}
                            >
                              <Bell
                                size={27}
                                style={{ marginBottom: '8px', opacity: 0.5 }}
                              />

                              <p
                                style={{
                                  margin: 0,
                                  fontSize: '13px',
                                }}
                              >
                                You're all caught up. No notifications yet.
                              </p>
                            </div>
                          ) : (
                            notifications.map((notification) => {
                              const isRescheduleNotification =
                                notification.notification_type ===
                                'appointment_reschedule_requested';

                              return (
                                <div
                                  key={notification.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px',
                                    padding: '14px 15px',
                                    borderBottom: '1px solid #f1f5f9',
                                    background: notification.is_read
                                      ? '#ffffff'
                                      : '#f0f7ff',
                                  }}
                                >
                                  <span
                                    style={{
                                      width: '30px',
                                      height: '30px',
                                      flexShrink: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: '50%',
                                      background: notification.is_read
                                        ? '#f1f5f9'
                                        : '#dbeafe',
                                      color: notification.is_read
                                        ? '#64748b'
                                        : '#2563eb',
                                    }}
                                  >
                                    <Bell size={15} />
                                  </span>

                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <strong
                                      style={{
                                        display: 'block',
                                        color: '#0f172a',
                                        fontSize: '13px',
                                        lineHeight: 1.4,
                                        marginBottom: '4px',
                                      }}
                                    >
                                      {notification.title}
                                    </strong>

                                    <p
                                      style={{
                                        margin: 0,
                                        color: '#475569',
                                        fontSize: '12px',
                                        lineHeight: 1.5,
                                        overflowWrap: 'anywhere',
                                      }}
                                    >
                                      {notification.message}
                                    </p>

                                    <small
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        marginTop: '7px',
                                        color: '#94a3b8',
                                        fontSize: '10px',
                                      }}
                                    >
                                      <Clock3 size={11} />
                                      {formatNotificationDate(
                                        notification.created_at
                                      )}
                                    </small>

                                    {role === 'doctor' && notification.appointment && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleViewAppointment(notification)
                                        }
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '5px',
                                          marginTop: '9px',
                                          padding: '6px 10px',
                                          border: '1px solid #bfdbfe',
                                          borderRadius: '6px',
                                          background: '#eff6ff',
                                          color: '#1d4ed8',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        <CalendarDays size={13} />
                                        {isRescheduleNotification
                                          ? 'Review reschedule'
                                          : 'View appointment'}
                                      </button>
                                    )}

                                    {!notification.is_read && (
                                      <button
                                        type="button"
                                        disabled={
                                          updatingNotification === notification.id
                                        }
                                        onClick={() =>
                                          handleMarkRead(notification.id)
                                        }
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          marginTop: '8px',
                                          marginRight: '12px',
                                          padding: 0,
                                          border: 0,
                                          background: 'transparent',
                                          color: '#2563eb',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        <Check size={13} />
                                        {updatingNotification === notification.id
                                          ? 'Updating...'
                                          : 'Mark as read'}
                                      </button>
                                    )}
                                  </div>

                                  {!notification.is_read && (
                                    <span
                                      aria-label="Unread"
                                      style={{
                                        width: '8px',
                                        height: '8px',
                                        flexShrink: 0,
                                        marginTop: '5px',
                                        borderRadius: '50%',
                                        background: '#2563eb',
                                      }}
                                    />
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <Link
                    to={accountPath}
                    className="nvc-account"
                    onClick={handleNavigationClick}
                    title={
                      role === 'patient' || role === 'doctor'
                        ? 'Open your profile'
                        : 'Open your dashboard'
                    }
                    aria-label={`Open ${displayName}'s ${
                      role === 'patient' || role === 'doctor'
                        ? 'profile'
                        : 'dashboard'
                    }`}
                  >
                    <span className="nvc-account-icon">
                      {profilePhoto ? (
                        <img
                          src={profilePhoto}
                          alt={`${displayName}'s profile`}
                          className="nvc-account-photo"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <UserRound size={18} />
                      )}
                    </span>

                    <span className="nvc-account-info">
                      <strong>{displayName}</strong>
                      <small>{roleLabel}</small>
                    </span>
                  </Link>

                  <button
                    type="button"
                    className="nvc-logout-button"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} aria-hidden="true" />
                    <span>Sign out</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="nvc-login-button"
                    onClick={handleNavigationClick}
                  >
                    <UserRound size={16} aria-hidden="true" />
                    Login
                  </Link>

                  <Link
                    to="/register"
                    className="nvc-cta-button"
                    onClick={handleNavigationClick}
                  >
                    Get started
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="brand footer-brand">
            <span className="brand-icon">
              <HeartPulse size={22} />
            </span>

            <span>
              Nepal Virtual Care
              <small>HEALTHCARE WITHOUT BORDERS</small>
            </span>
          </div>

          <p>
            Connecting people to care, wherever life takes them.
          </p>

          <span>
            Ã‚Â© {new Date().getFullYear()} Nepal Virtual Care.
            Demo prototype.
          </span>
        </div>
      </footer>
    </>
  );
}
