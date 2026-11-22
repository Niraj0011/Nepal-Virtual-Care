import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  HeartPulse,
  LayoutDashboard,
  Users,
  Stethoscope,
  UserPlus,
  ShieldCheck,
  Menu,
  Settings,
  X,
  Home,
  UserRound,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Mail,
  Activity,
  Pencil,
  ArrowLeft,
  Search,
  CalendarDays,
  Calendar,
  UserCheck,
  ClipboardList,
  Clock3,
  CalendarClock,
  Save,
  CalendarCheck,
  Check,
  XCircle,
  Star,
  Flag,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';

import { useApp } from '../context/AppContext';

import {
  getAdminDoctors,
  getProviders,
  createDoctorAccount,
  updateDoctorAccount,
  getAdminPatients,
  updatePatientAccount,
  getAppointments,
  updateAppointmentStatus,
  getAdminActivity,
  getAdminDoctorAvailability,
  updateAdminDoctorAvailability,
  getAdminLeaveRequests,
  reviewAdminLeaveRequest,
  getAdminScheduleChangeRequests,
  reviewAdminScheduleChangeRequest,
  getAdminReviews,
  moderateDoctorReview,
  getAdminReviewReports,
  updateAdminReviewReport,
} from '../api';

const WEEKDAYS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

const createDefaultSchedule = () =>
  WEEKDAYS.map((day) => ({
    weekday: day.value,
    weekday_name: day.label,
    start_time: '09:00',
    end_time: '17:00',
    slot_duration: 30,
    is_available: false,
  }));

function normalizeSchedule(data) {
  const rows = Array.isArray(data)
    ? data
    : data?.availability || data?.results || [];

  const defaults = createDefaultSchedule();

  return defaults.map((day) => {
    const saved = rows.find(
      (item) => Number(item.weekday) === day.weekday
    );

    if (!saved) return day;

    return {
      ...day,
      ...saved,
      weekday: day.weekday,
      weekday_name: day.weekday_name,
      start_time: saved.start_time || '09:00',
      end_time: saved.end_time || '17:00',
      slot_duration: Number(saved.slot_duration) || 30,
      is_available: Boolean(saved.is_available),
    };
  });
}

function getRequestedScheduleRows(schedule) {
  if (Array.isArray(schedule)) return schedule;

  const rows =
    schedule?.availability ||
    schedule?.schedule ||
    schedule?.requested_schedule ||
    schedule?.days ||
    [];

  return Array.isArray(rows) ? rows : [];
}

function formatRequestedTime(time) {
  return time ? String(time).slice(0, 5) : '';
}

function getReviewList(data) {
  if (Array.isArray(data)) return data;
  return data?.results || data?.reviews || [];
}

function getReviewPatientName(review) {
  return (
    review.patient_name ||
    review.patient_display_name ||
    review.reviewer_name ||
    review.patient?.name ||
    review.patient?.username ||
    'Patient'
  );
}

function getReviewDoctorName(review) {
  return (
    review.provider_name ||
    review.doctor_name ||
    review.provider?.name ||
    review.doctor?.name ||
    'Doctor'
  );
}

function getReportReview(report) {
  return (
    report.review_details ||
    report.review_data ||
    (typeof report.review === 'object' ? report.review : null)
  );
}

function formatReviewDate(date) {
  if (!date) return 'Date unavailable';

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Date unavailable';
  }

  return parsedDate.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminDashboard() {
  const { user } = useApp();

  const [doctors, setDoctors] = useState([]);
  const [providers, setProviders] = useState([]);
  const [allPatients, setAllPatients] = useState([]);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');
  const [activityExpanded, setActivityExpanded] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingDoctor, setUpdatingDoctor] = useState(false);
  const [updatingPatient, setUpdatingPatient] = useState(false);
  const [updatingAppointment, setUpdatingAppointment] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedNavigationGroups, setExpandedNavigationGroups] =
  useState({});

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editingDoctor, setEditingDoctor] = useState(null);
  const [editingPatient, setEditingPatient] = useState(null);

  const [patientSearch, setPatientSearch] = useState('');
  const [appointmentFilter, setAppointmentFilter] = useState('All');
  const [appointmentDateRange, setAppointmentDateRange] = useState('All');
  const [appointmentStatusDrafts, setAppointmentStatusDrafts] = useState({});

  // Doctor availability management.
  const [selectedAvailabilityDoctor, setSelectedAvailabilityDoctor] =
    useState('');
  const [availabilitySchedule, setAvailabilitySchedule] = useState(
    createDefaultSchedule
  );
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityMessage, setAvailabilityMessage] = useState('');

  // Doctor leave requests.
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = useState(true);
  const [leaveRequestsError, setLeaveRequestsError] = useState('');
  const [leaveRequestsMessage, setLeaveRequestsMessage] = useState('');
  const [reviewingLeaveId, setReviewingLeaveId] = useState(null);
  const [leaveResponses, setLeaveResponses] = useState({});

  // Doctor weekly schedule change requests.
  const [scheduleRequests, setScheduleRequests] = useState([]);
  const [scheduleRequestsLoading, setScheduleRequestsLoading] = useState(true);
  const [scheduleRequestsError, setScheduleRequestsError] = useState('');
  const [scheduleRequestsMessage, setScheduleRequestsMessage] = useState('');
  const [reviewingScheduleId, setReviewingScheduleId] = useState(null);
  const [scheduleResponses, setScheduleResponses] = useState({});

  // Doctor reviews and review reports.
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsError, setReviewsError] = useState('');
  const [reviewsMessage, setReviewsMessage] = useState('');
  const [reviewFilter, setReviewFilter] = useState('All');
  const [reviewNotes, setReviewNotes] = useState({});
  const [reviewingReviewId, setReviewingReviewId] = useState(null);

  const [reviewReports, setReviewReports] = useState([]);
  const [reviewReportsLoading, setReviewReportsLoading] = useState(true);
  const [reviewReportsError, setReviewReportsError] = useState('');
  const [reviewReportsMessage, setReviewReportsMessage] = useState('');
  const [reportNotes, setReportNotes] = useState({});
  const [updatingReportId, setUpdatingReportId] = useState(null);

  const [activeNavigation, setActiveNavigation] = useState(
    window.location.hash === '#doctor-management'
      ? 'Doctor Management'
      : window.location.hash === '#patient-management'
        ? 'Patient Management'
        : window.location.hash === '#appointment-management'
          ? 'Appointment Management'
          : window.location.hash === '#doctor-availability'
            ? 'Doctor Availability'
            : window.location.hash === '#leave-requests'
              ? 'Leave Requests'
              : window.location.hash === '#schedule-change-requests'
                ? 'Schedule Requests'
                : window.location.hash === '#review-management'
                  ? 'Review Management'
                  : 'Overview'
  );

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    provider: '',
  });

  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.name ||
    user?.username ||
    'Administrator';

  const firstName =
    user?.first_name ||
    user?.name ||
    user?.username ||
    'Administrator';

  const getList = (data) =>
    Array.isArray(data) ? data : data?.results || [];

  const loadDashboard = async () => {
    try {
      setError('');

      const [
        doctorData,
        providerData,
        patientData,
        appointmentData,
      ] = await Promise.all([
        getAdminDoctors(),
        getProviders(),
        getAdminPatients(),
        getAppointments(),
      ]);

      const patientList = getList(patientData);

      setDoctors(getList(doctorData));
      setProviders(getList(providerData));
      setAllPatients(patientList);
      setPatients(patientList);
      setAppointments(getList(appointmentData));
    } catch (err) {
      setError(
        err.message || 'Unable to load administrator dashboard.'
      );
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async () => {
    setActivityLoading(true);
    setActivityError('');

    try {
      const data = await getAdminActivity();
      setActivity(getList(data));
    } catch (err) {
      setActivityError(
        err.message || 'Unable to load recent activity.'
      );
    } finally {
      setActivityLoading(false);
    }
  };

  const loadAdminLeaveRequests = async () => {
    setLeaveRequestsLoading(true);
    setLeaveRequestsError('');

    try {
      const data = await getAdminLeaveRequests();
      setLeaveRequests(getList(data));
    } catch (err) {
      setLeaveRequestsError(
        err.message || 'Unable to load doctor leave requests.'
      );
    } finally {
      setLeaveRequestsLoading(false);
    }
  };

  const loadAdminScheduleChangeRequests = async () => {
    setScheduleRequestsLoading(true);
    setScheduleRequestsError('');

    try {
      const data = await getAdminScheduleChangeRequests();
      setScheduleRequests(getList(data));
    } catch (err) {
      setScheduleRequestsError(
        err.message || 'Unable to load doctor schedule requests.'
      );
    } finally {
      setScheduleRequestsLoading(false);
    }
  };

  const loadAdminReviews = async (status = reviewFilter) => {
    setReviewsLoading(true);
    setReviewsError('');

    try {
      const data = await getAdminReviews(
        status === 'All' ? '' : status
      );

      setReviews(getReviewList(data));
    } catch (err) {
      setReviewsError(
        err.message || 'Unable to load doctor reviews.'
      );
    } finally {
      setReviewsLoading(false);
    }
  };

  const loadAdminReviewReports = async () => {
    setReviewReportsLoading(true);
    setReviewReportsError('');

    try {
      const data = await getAdminReviewReports();
      setReviewReports(getReviewList(data));
    } catch (err) {
      setReviewReportsError(
        err.message || 'Unable to load review reports.'
      );
    } finally {
      setReviewReportsLoading(false);
    }
  };

  const handleReviewFilterChange = (event) => {
    const nextFilter = event.target.value;
    setReviewFilter(nextFilter);
    loadAdminReviews(nextFilter);
  };

  const handleReviewNoteChange = (reviewId, value) => {
    setReviewNotes((previous) => ({
      ...previous,
      [reviewId]: value,
    }));
  };

  const handleReviewModeration = async (reviewId, moderationStatus) => {
    if (reviewingReviewId !== null) return;

    const note = (reviewNotes[reviewId] || '').trim();

    if (moderationStatus === 'Rejected' && !note) {
      setReviewsError(
        'Please provide a moderation note before rejecting this review.'
      );
      setReviewsMessage('');
      return;
    }

    setReviewingReviewId(reviewId);
    setReviewsError('');
    setReviewsMessage('');

    try {
      await moderateDoctorReview(
        reviewId,
        moderationStatus,
        note
      );

      setReviewNotes((previous) => {
        const updated = { ...previous };
        delete updated[reviewId];
        return updated;
      });

      setReviewsMessage(
        `Review #${reviewId} ${moderationStatus.toLowerCase()} successfully.`
      );

      await Promise.all([
        loadAdminReviews(),
        loadAdminReviewReports(),
      ]);
    } catch (err) {
      setReviewsError(
        err.message || 'Unable to update this review.'
      );
    } finally {
      setReviewingReviewId(null);
    }
  };

  const handleReportNoteChange = (reportId, value) => {
    setReportNotes((previous) => ({
      ...previous,
      [reportId]: value,
    }));
  };

  const handleMarkReportReviewed = async (reportId) => {
    if (updatingReportId !== null) return;

    const note = (reportNotes[reportId] || '').trim();

    setUpdatingReportId(reportId);
    setReviewReportsError('');
    setReviewReportsMessage('');

    try {
      await updateAdminReviewReport(
        reportId,
        'Reviewed',
        note
      );

      setReportNotes((previous) => {
        const updated = { ...previous };
        delete updated[reportId];
        return updated;
      });

      setReviewReportsMessage(
        `Report #${reportId} marked as reviewed.`
      );

      await loadAdminReviewReports();
    } catch (err) {
      setReviewReportsError(
        err.message || 'Unable to update this report.'
      );
    } finally {
      setUpdatingReportId(null);
    }
  };

  const handleLeaveResponseChange = (requestId, value) => {
    setLeaveResponses((previous) => ({
      ...previous,
      [requestId]: value,
    }));
  };

  const handleLeaveReview = async (requestId, status) => {
    if (reviewingLeaveId !== null) return;

    const response =
      status === 'Rejected'
        ? (leaveResponses[requestId] || '').trim()
        : '';

    if (status === 'Rejected' && !response) {
      setLeaveRequestsError(
        'Please explain why this leave request is being rejected.'
      );
      setLeaveRequestsMessage('');
      return;
    }

    setReviewingLeaveId(requestId);
    setLeaveRequestsError('');
    setLeaveRequestsMessage('');

    try {
      await reviewAdminLeaveRequest(requestId, status, response);

      setLeaveResponses((previous) => {
        const updated = { ...previous };
        delete updated[requestId];
        return updated;
      });

      setLeaveRequestsMessage(
        `Leave request #${requestId} ${status.toLowerCase()}.`
      );

      await loadAdminLeaveRequests();
    } catch (err) {
      setLeaveRequestsError(
        err.message || 'Unable to review this leave request.'
      );
    } finally {
      setReviewingLeaveId(null);
    }
  };

  const handleScheduleResponseChange = (requestId, value) => {
    setScheduleResponses((previous) => ({
      ...previous,
      [requestId]: value,
    }));
  };

  const handleScheduleReview = async (requestId, status) => {
    if (reviewingScheduleId !== null) return;

    const response =
      status === 'Rejected'
        ? (scheduleResponses[requestId] || '').trim()
        : '';

    if (status === 'Rejected' && !response) {
      setScheduleRequestsError(
        'Please explain why this schedule change request is being rejected.'
      );
      setScheduleRequestsMessage('');
      return;
    }

    setReviewingScheduleId(requestId);
    setScheduleRequestsError('');
    setScheduleRequestsMessage('');

    try {
      await reviewAdminScheduleChangeRequest(
        requestId,
        status,
        response
      );

      setScheduleResponses((previous) => {
        const updated = { ...previous };
        delete updated[requestId];
        return updated;
      });

      setScheduleRequestsMessage(
        `Schedule change request #${requestId} ${status.toLowerCase()}.`
      );

      await Promise.all([
        loadAdminScheduleChangeRequests(),
        loadAdminLeaveRequests(),
      ]);

      if (selectedAvailabilityDoctor) {
        await loadDoctorAvailability(selectedAvailabilityDoctor);
      }
    } catch (err) {
      setScheduleRequestsError(
        err.message || 'Unable to review this schedule change request.'
      );
    } finally {
      setReviewingScheduleId(null);
    }
  };

  useEffect(() => {
    loadDashboard();
    loadActivity();
    loadAdminLeaveRequests();
    loadAdminScheduleChangeRequests();
    loadAdminReviews('All');
    loadAdminReviewReports();
  }, []);
    // Automatically dismiss schedule-request feedback.
  useEffect(() => {
    if (!scheduleRequestsError && !scheduleRequestsMessage) {
      return undefined;
    }

    const dismissDelay = scheduleRequestsError ? 6000 : 4000;

    const timeoutId = window.setTimeout(() => {
      setScheduleRequestsError('');
      setScheduleRequestsMessage('');
    }, dismissDelay);

    return () => window.clearTimeout(timeoutId);
  }, [scheduleRequestsError, scheduleRequestsMessage]);

  const closeSidebar = () => setSidebarOpen(false);

  const handleNavigation = (event, item) => {
    if (item.routeOnly) {
      closeSidebar();
      return;
    }

    event.preventDefault();

    setActiveNavigation(item.label);
    closeSidebar();

    if (item.section) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${item.section}`
      );

      requestAnimationFrame(() => {
        document.getElementById(item.section)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    } else {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const availableProviders = providers.filter(
    (provider) =>
      !doctors.some(
        (doctor) => String(doctor.provider) === String(provider.id)
      )
  );

  const activeDoctors = doctors.filter(
    (doctor) => doctor.is_active
  ).length;

  const assignedProviders = new Set(
    doctors.map((doctor) => doctor.provider)
  ).size;

  const activePatients = allPatients.filter(
    (patient) => patient.is_active
  ).length;

  const getLocalDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  const today = new Date();
  const todayKey = getLocalDateKey(today);

  const rangeStart = new Date(today);
  rangeStart.setHours(0, 0, 0, 0);

  if (appointmentDateRange === '7') {
    rangeStart.setDate(rangeStart.getDate() - 6);
  } else if (appointmentDateRange === '30') {
    rangeStart.setDate(rangeStart.getDate() - 29);
  }

  const rangeStartKey = getLocalDateKey(rangeStart);

  const dashboardAppointments =
    appointmentDateRange === 'All'
      ? appointments
      : appointments.filter((appointment) => {
          if (!appointment.preferred_date) return false;

          const appointmentDate = String(
            appointment.preferred_date
          ).slice(0, 10);

          return (
            appointmentDate >= rangeStartKey &&
            appointmentDate <= todayKey
          );
        });

  const pendingAppointments = dashboardAppointments.filter(
    (appointment) => appointment.status === 'Pending'
  ).length;

  const appointmentStatusSummary = [
    {
      label: 'Pending',
      count: dashboardAppointments.filter(
        (item) => item.status === 'Pending'
      ).length,
      color: '#d99a28',
      background: '#fbf4e6',
    },
    {
      label: 'Confirmed',
      count: dashboardAppointments.filter(
        (item) => item.status === 'Confirmed'
      ).length,
      color: '#16866f',
      background: '#e8f5f0',
    },
    {
      label: 'Completed',
      count: dashboardAppointments.filter(
        (item) => item.status === 'Completed'
      ).length,
      color: '#4776b8',
      background: '#edf3fb',
    },
    {
      label: 'Cancelled',
      count: dashboardAppointments.filter(
        (item) => item.status === 'Cancelled'
      ).length,
      color: '#c65e5e',
      background: '#faeeee',
    },
  ];

  const filteredAppointments =
    appointmentFilter === 'All'
      ? appointments
      : appointments.filter(
          (appointment) => appointment.status === appointmentFilter
        );

  const loadDoctorAvailability = async (providerId) => {
    if (!providerId) {
      setAvailabilitySchedule(createDefaultSchedule());
      setAvailabilityLoaded(false);
      return;
    }

    setAvailabilityLoading(true);
    setAvailabilityError('');
    setAvailabilityMessage('');
    setAvailabilityLoaded(false);

    try {
      const data = await getAdminDoctorAvailability(providerId);

      setAvailabilitySchedule(normalizeSchedule(data));
      setAvailabilityLoaded(true);
    } catch (err) {
      setAvailabilityError(
        err.message || 'Unable to load this doctor’s availability.'
      );
      setAvailabilitySchedule(createDefaultSchedule());
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleAvailabilityDoctorChange = async (event) => {
    const providerId = event.target.value;

    setSelectedAvailabilityDoctor(providerId);
    await loadDoctorAvailability(providerId);
  };

  const handleAvailabilityChange = (weekday, field, value) => {
    setAvailabilitySchedule((previous) =>
      previous.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              [field]:
                field === 'slot_duration'
                  ? Number(value)
                  : field === 'is_available'
                    ? Boolean(value)
                    : value,
            }
          : day
      )
    );

    setAvailabilityMessage('');
    setAvailabilityError('');
  };

  const handleSaveAvailability = async (event) => {
    event.preventDefault();

    if (!selectedAvailabilityDoctor || !availabilityLoaded) return;

    setAvailabilityError('');
    setAvailabilityMessage('');

    for (const day of availabilitySchedule) {
      if (!day.is_available) continue;

      if (!day.start_time || !day.end_time) {
        setAvailabilityError(
          `Please enter working hours for ${day.weekday_name}.`
        );
        return;
      }

      if (day.start_time >= day.end_time) {
        setAvailabilityError(
          `The closing time must be later than the opening time on ${day.weekday_name}.`
        );
        return;
      }

      if (![15, 30, 45, 60].includes(Number(day.slot_duration))) {
        setAvailabilityError(
          `Choose a valid appointment duration for ${day.weekday_name}.`
        );
        return;
      }
    }

    setAvailabilitySaving(true);

    try {
      const payload = availabilitySchedule.map((day) => ({
        weekday: day.weekday,
        start_time: day.is_available ? day.start_time : null,
        end_time: day.is_available ? day.end_time : null,
        slot_duration: Number(day.slot_duration),
        is_available: day.is_available,
      }));

      const data = await updateAdminDoctorAvailability(
        selectedAvailabilityDoctor,
        payload
      );

      setAvailabilitySchedule(normalizeSchedule(data));
      setAvailabilityLoaded(true);
      setAvailabilityMessage(
        'Doctor availability updated successfully.'
      );
    } catch (err) {
      setAvailabilityError(
        err.message || 'Unable to save the doctor’s availability.'
      );
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const selectedDoctor = doctors.find(
    (doctor) =>
      String(doctor.provider) === String(selectedAvailabilityDoctor)
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError('');
    setMessage('');
    setSaving(true);

    try {
      await createDoctorAccount({
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        provider: Number(form.provider),
      });

      setMessage('Doctor account created successfully.');

      setForm({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        provider: '',
      });

      setLoading(true);
      await loadDashboard();
    } catch (err) {
      setError(
        err.message || 'Unable to create doctor account.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEditDoctor = (doctor) => {
    setEditingDoctor({
      id: doctor.id,
      first_name: doctor.first_name || '',
      last_name: doctor.last_name || '',
      provider: String(doctor.provider),
      is_active: doctor.is_active,
    });

    setError('');
    setMessage('');
  };

  const handleCancelEdit = () => {
    setEditingDoctor(null);
    setError('');
    setMessage('');
  };

  const handleUpdateDoctor = async (event) => {
    event.preventDefault();

    if (!editingDoctor) return;

    setError('');
    setMessage('');
    setUpdatingDoctor(true);

    try {
      await updateDoctorAccount(editingDoctor.id, {
        first_name: editingDoctor.first_name.trim(),
        last_name: editingDoctor.last_name.trim(),
        provider: Number(editingDoctor.provider),
        is_active: editingDoctor.is_active,
      });

      setMessage('Doctor account updated successfully.');
      setEditingDoctor(null);

      setLoading(true);
      await loadDashboard();
    } catch (err) {
      setError(
        err.message || 'Unable to update doctor account.'
      );
    } finally {
      setUpdatingDoctor(false);
    }
  };

  const handlePatientSearch = async (event) => {
    event.preventDefault();

    setError('');
    setMessage('');
    setLoadingPatients(true);

    try {
      const data = await getAdminPatients(patientSearch);
      setPatients(getList(data));
    } catch (err) {
      setError(err.message || 'Unable to search patients.');
    } finally {
      setLoadingPatients(false);
    }
  };

  const refreshPatients = async () => {
    setError('');
    setLoadingPatients(true);

    try {
      const allData = await getAdminPatients();

      const searchData = patientSearch.trim()
        ? await getAdminPatients(patientSearch)
        : allData;

      setAllPatients(getList(allData));
      setPatients(getList(searchData));
    } catch (err) {
      setError(err.message || 'Unable to refresh patients.');
    } finally {
      setLoadingPatients(false);
    }
  };

  const handleEditPatient = (patient) => {
    setEditingPatient({
      id: patient.id,
      first_name: patient.first_name || '',
      last_name: patient.last_name || '',
      is_active: patient.is_active,
    });

    setError('');
    setMessage('');
  };

  const handleCancelPatientEdit = () => {
    setEditingPatient(null);
    setError('');
    setMessage('');
  };

  const handleUpdatePatient = async (event) => {
    event.preventDefault();

    if (!editingPatient) return;

    setError('');
    setMessage('');
    setUpdatingPatient(true);

    try {
      await updatePatientAccount(editingPatient.id, {
        first_name: editingPatient.first_name.trim(),
        last_name: editingPatient.last_name.trim(),
        is_active: editingPatient.is_active,
      });

      setMessage('Patient account updated successfully.');

      setEditingPatient(null);

      await refreshPatients();
    } catch (err) {
      setError(
        err.message || 'Unable to update patient account.'
      );
    } finally {
      setUpdatingPatient(false);
    }
  };

  const handleAppointmentStatusChange = (appointmentId, status) => {
    setAppointmentStatusDrafts((previous) => ({
      ...previous,
      [appointmentId]: status,
    }));
  };

  const handleUpdateAppointmentStatus = async (appointment) => {
    const newStatus =
      appointmentStatusDrafts[appointment.id] || appointment.status;

    if (newStatus === appointment.status) return;

    setError('');
    setMessage('');
    setUpdatingAppointment(appointment.id);

    try {
      await updateAppointmentStatus(appointment.id, newStatus);

      setAppointments((previous) =>
        previous.map((item) =>
          item.id === appointment.id
            ? { ...item, status: newStatus }
            : item
        )
      );

      setAppointmentStatusDrafts((previous) => {
        const updated = { ...previous };
        delete updated[appointment.id];
        return updated;
      });

      setMessage('Appointment status updated successfully.');
      await loadActivity();
    } catch (err) {
      setError(
        err.message || 'Unable to update appointment status.'
      );
    } finally {
      setUpdatingAppointment(null);
    }
  };

  const refreshAppointments = async () => {
    setError('');
    setLoadingAppointments(true);

    try {
      const data = await getAppointments();

      setAppointments(getList(data));
      setAppointmentStatusDrafts({});
    } catch (err) {
      setError(err.message || 'Unable to refresh appointments.');
    } finally {
      setLoadingAppointments(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Not available';

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return 'Not available';
    }

    return parsedDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatActivityTime = (date) => {
    if (!date) return 'Time unavailable';

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return 'Time unavailable';
    }

    return parsedDate.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'patient_registered':
        return UserPlus;
      case 'appointment_booked':
        return CalendarDays;
      case 'appointment_status_changed':
        return Activity;
      default:
        return Clock3;
    }
  };

  const getActivityLabel = (type) => {
    switch (type) {
      case 'patient_registered':
        return 'Patient registration';
      case 'appointment_booked':
        return 'New appointment';
      case 'appointment_status_changed':
        return 'Status update';
      default:
        return 'Platform activity';
    }
  };

  const visibleActivity = activityExpanded
    ? activity
    : activity.slice(0, 3);

  const pendingReviewCount = reviews.filter(
    (review) => review.moderation_status === 'Pending'
  ).length;

  const approvedReviewCount = reviews.filter(
    (review) => review.moderation_status === 'Approved'
  ).length;

  const rejectedReviewCount = reviews.filter(
    (review) => review.moderation_status === 'Rejected'
  ).length;

  const pendingReportCount = reviewReports.filter(
    (report) => (report.status || 'Pending') === 'Pending'
  ).length;


const navigation = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    path: '/admin-dashboard',
  },
  {
    label: 'People Management',
    icon: Users,
    items: [
      {
        label: 'Doctor Management',
        icon: Stethoscope,
        path: '/admin-dashboard#doctor-management',
        section: 'doctor-management',
      },
      {
        label: 'Patient Management',
        icon: Users,
        path: '/admin-dashboard#patient-management',
        section: 'patient-management',
      },
    ],
  },
  {
    label: 'Appointments & Scheduling',
    icon: Calendar,
    items: [
      {
        label: 'Appointment Management',
        icon: ClipboardList,
        path: '/admin-dashboard#appointment-management',
        section: 'appointment-management',
      },
      {
        label: 'Doctor Availability',
        icon: CalendarClock,
        path: '/admin-dashboard#doctor-availability',
        section: 'doctor-availability',
      },
      {
        label: 'Schedule Requests',
        icon: CalendarClock,
        path: '/admin-dashboard#schedule-change-requests',
        section: 'schedule-change-requests',
      },
      {
        label: 'Leave Requests',
        icon: CalendarCheck,
        path: '/admin-dashboard#leave-requests',
        section: 'leave-requests',
      },
    ],
  },
  {
    label: 'Trust & Safety',
    icon: ShieldCheck,
    items: [
      {
        label: 'Review Management',
        icon: Star,
        path: '/admin-dashboard#review-management',
        section: 'review-management',
      },
    ],
  },
  {
    label: 'System',
    icon: Settings,
    items: [
      {
        label: 'Trusted Devices',
        icon: ShieldCheck,
        path: '/trusted-devices',
        routeOnly: true,
      },
      {
        label: 'Analytics & Reports',
        icon: LayoutDashboard,
        path: '/admin-analytics',
        routeOnly: true,
      },
    ],
  },
];


  return (
    <div className="dashboard-layout admin-dashboard-layout">
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
            {user?.profile_photo || user?.profile?.profile_photo ? (
              <img
                src={user?.profile_photo || user?.profile?.profile_photo}
                alt="Administrator profile"
              />
            ) : (
              <UserRound size={21} />
            )}
          </div>
          <div className="dashboard-sidebar-profile-info">
            <strong>{fullName}</strong>
            <span>Administrator</span>
          </div>
          <span className="dashboard-sidebar-online" />
        </div>

        <div className="dashboard-nav-label">
          ADMINISTRATION
        </div>

               <nav className="dashboard-nav">
  {navigation.map((item) => {
    if (!item.items) {
      const Icon = item.icon;

      return (
        <Link
          key={item.label}
          to={item.path}
          onClick={(event) => handleNavigation(event, item)}
          className={`dashboard-nav-link ${
            activeNavigation === item.label ? 'active' : ''
          }`}
        >
          <Icon size={19} />
          <span>{item.label}</span>
        </Link>
      );
    }
const GroupIcon = item.icon;
    const isExpanded =
      expandedNavigationGroups[item.label] ??
      item.items.some((child) => child.label === activeNavigation);

    return (
      <div className="dashboard-nav-group" key={item.label}>
        <button
          type="button"
          className={`dashboard-nav-group-toggle ${
            isExpanded ? 'expanded' : ''
          }`}
          onClick={() =>
            setExpandedNavigationGroups((previous) => ({
              ...previous,
              [item.label]: !(
                previous[item.label] ??
                item.items.some(
                  (child) => child.label === activeNavigation
                )
              ),
            }))
          }
          aria-expanded={isExpanded}
        >
         <span className="dashboard-nav-group-label">
<GroupIcon size={18} />
  <span>{item.label}</span>
</span>
<ChevronDown size={16} />
        </button>

        {isExpanded && (
          <div className="dashboard-nav-group-items">
            {item.items.map((child) => {
              const Icon = child.icon;

              return (
                <Link
                  key={child.label}
                  to={child.path}
                  onClick={(event) => handleNavigation(event, child)}
                  className={`dashboard-nav-link ${
                    activeNavigation === child.label ? 'active' : ''
                  }`}
                >
                  <Icon size={18} />
                  <span>{child.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  })}
</nav>

        <div className="dashboard-sidebar-bottom">
          <div className="dashboard-help-card">
            <div className="dashboard-help-icon">
              <ShieldCheck size={21} />
            </div>

            <strong>Platform management</strong>

            <p>
              Manage doctor accounts, patient accounts and provider
              profiles across Nepal Virtual Care.
            </p>
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
                Administration / {activeNavigation}
              </span>

              <h2>Administrator Dashboard</h2>
            </div>
          </div>

        </header>

        <div className="dashboard-content">
          <section className="admin-welcome-section">
  <div className="admin-welcome-content">
    <span className="admin-welcome-eyebrow">
      ADMIN WORKSPACE
    </span>

    <h2>Welcome back, {firstName}!</h2>

    <p>
      Manage healthcare providers, doctor accounts, patient
      accounts and appointments across Nepal Virtual Care.
    </p>
  </div>

  <div className="admin-welcome-date">
    <CalendarDays size={19} />
    <span>
      {new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}
    </span>
  </div>
</section>

          {/* Statistics */}
          <section className="dashboard-stats admin-dashboard-stats">
            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon green">
                <Users size={21} />
              </div>
              <div>
                <span>Total doctors</span>
                <strong>{loading ? '...' : doctors.length}</strong>
                <small>Registered doctor accounts</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon purple">
                <Stethoscope size={21} />
              </div>
              <div>
                <span>Available providers</span>
                <strong>{loading ? '...' : availableProviders.length}</strong>
                <small>Profiles not yet assigned</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon blue">
                <Activity size={21} />
              </div>
              <div>
                <span>Active doctors</span>
                <strong>{loading ? '...' : activeDoctors}</strong>
                <small>Active doctor accounts</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon green">
                <ShieldCheck size={21} />
              </div>
              <div>
                <span>Assigned providers</span>
                <strong>{loading ? '...' : assignedProviders}</strong>
                <small>Linked to doctor accounts</small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon purple">
                <UserCheck size={21} />
              </div>
              <div>
                <span>Total patients</span>
                <strong>{loading ? '...' : allPatients.length}</strong>
                <small>
                  {loading ? '...' : activePatients} active patient accounts
                </small>
              </div>
            </div>

            <div className="dashboard-stat-card">
              <div className="dashboard-stat-icon blue">
                <ClipboardList size={21} />
              </div>
              <div>
                <span>Total appointments</span>
                <strong>
                  {loading ? '...' : dashboardAppointments.length}
                </strong>
                <small>
                  {loading ? '...' : pendingAppointments} pending appointments
                </small>
              </div>
            </div>
          </section>

          {/* Appointment status overview */}
          <section className="dashboard-section-card">
            <div
              className="dashboard-card-heading"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div>
                <span className="dashboard-section-kicker">
                  APPOINTMENT INSIGHTS
                </span>
                <h3>Appointment status overview</h3>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <label
                  htmlFor="appointment-date-range"
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#71827b',
                  }}
                >
                  Date range
                </label>

                <select
                  id="appointment-date-range"
                  value={appointmentDateRange}
                  onChange={(event) =>
                    setAppointmentDateRange(event.target.value)
                  }
                  style={{
                    padding: '9px 12px',
                    border: '1px solid #dce7e2',
                    borderRadius: '9px',
                    background: '#fff',
                    color: '#183b3b',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <option value="Today">Today</option>
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="All">All Time</option>
                </select>

                <div className="admin-heading-icon">
                  <Activity size={21} />
                </div>
              </div>
            </div>

            <p className="admin-card-description">
              A breakdown of appointments by their current status
              within the selected date range.
            </p>

            {loading ? (
              <div className="dashboard-empty">
                Loading appointment statistics...
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                    gap: '14px',
                    marginBottom: '24px',
                  }}
                >
                  {appointmentStatusSummary.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        padding: '17px',
                        borderRadius: '12px',
                        background: item.background,
                        border: `1px solid ${item.color}20`,
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: item.color,
                          marginBottom: '8px',
                        }}
                      >
                        {item.label}
                      </span>

                      <strong
                        style={{
                          display: 'block',
                          fontSize: '27px',
                          lineHeight: 1.2,
                          color: '#183b3b',
                        }}
                      >
                        {item.count}
                      </strong>

                      <small style={{ color: '#71827b' }}>
                        {dashboardAppointments.length
                          ? `${Math.round(
                              (item.count / dashboardAppointments.length) * 100
                            )}% of appointments`
                          : '0% of appointments'}
                      </small>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    height: '12px',
                    width: '100%',
                    overflow: 'hidden',
                    borderRadius: '20px',
                    background: '#edf1ef',
                    marginBottom: '18px',
                  }}
                  aria-label="Appointment status distribution"
                >
                  {appointmentStatusSummary.map((item) => (
                    <div
                      key={item.label}
                      title={`${item.label}: ${item.count}`}
                      style={{
                        width: dashboardAppointments.length
                          ? `${(item.count / dashboardAppointments.length) * 100}%`
                          : '0%',
                        height: '100%',
                        background: item.color,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                  }}
                >
                  {appointmentStatusSummary.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '7px',
                        fontSize: '12px',
                        color: '#71827b',
                      }}
                    >
                      <span
                        style={{
                          width: '9px',
                          height: '9px',
                          borderRadius: '50%',
                          background: item.color,
                        }}
                      />
                      {item.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Compact Recent Activity */}
          <section
            className="dashboard-section-card admin-recent-activity"
            id="recent-activity"
          >
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-section-kicker">
                  PLATFORM UPDATES
                </span>
                <h3>Recent activity</h3>
                <span className="admin-activity-count">
                  {activity.length} recent {activity.length === 1 ? 'event' : 'events'}
                </span>
              </div>

              <button
                type="button"
                className="doctor-refresh-button"
                onClick={loadActivity}
                disabled={activityLoading}
                aria-label="Refresh recent activity"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {activityError && (
              <div
                className="admin-feedback admin-feedback-error"
                role="alert"
              >
                <AlertCircle size={18} />
                <span>{activityError}</span>
              </div>
            )}

            {activityLoading ? (
              <div className="dashboard-empty">
                Loading recent activity...
              </div>
            ) : activity.length === 0 ? (
              <div className="dashboard-empty admin-activity-empty">
                <div className="dashboard-empty-icon">
                  <Clock3 size={27} />
                </div>
                <strong>No recent activity yet</strong>
                <p>
                  New patient registrations, appointment bookings and
                  status updates will appear here.
                </p>
              </div>
            ) : (
              <>
                <div className="admin-activity-list">
                  {visibleActivity.map((item) => {
                    const Icon = getActivityIcon(item.type);

                    return (
                      <article
                        className="admin-activity-row"
                        key={item.id}
                      >
                        <div className="admin-activity-icon">
                          <Icon size={18} />
                        </div>

                        <div className="admin-activity-details">
                          <strong>
                            {item.title || getActivityLabel(item.type)}
                          </strong>

                          <p>
                            {item.description || 'A platform activity was recorded.'}
                          </p>

                          <div className="admin-activity-meta">
                            {item.patient_name && (
                              <span>
                                <UserRound size={13} />
                                {item.patient_name}
                              </span>
                            )}

                            {item.provider_name && (
                              <span>
                                <Stethoscope size={13} />
                                {item.provider_name}
                              </span>
                            )}

                            {item.appointment_id && (
                              <span>
                                Appointment #{item.appointment_id}
                              </span>
                            )}

                            {item.type === 'appointment_status_changed' && (
                              <span>
                                {item.old_status || 'Unknown'} →{' '}
                                {item.new_status || item.status || 'Unknown'}
                                {item.changed_by
                                  ? ` · ${item.changed_by}`
                                  : ''}
                              </span>
                            )}
                          </div>

                          <small>
                            <Clock3 size={12} />
                            {formatActivityTime(item.timestamp)}
                          </small>
                        </div>

                        <span className="admin-activity-type">
                          {getActivityLabel(item.type)}
                        </span>
                      </article>
                    );
                  })}
                </div>

                {activity.length > 3 && (
                  <button
                    type="button"
                    className="admin-activity-toggle"
                    onClick={() =>
                      setActivityExpanded((previous) => !previous)
                    }
                  >
                    {activityExpanded
                      ? 'Show less'
                      : `View all activity (${activity.length})`}
                  </button>
                )}
              </>
            )}
          </section>

          {/* General dashboard feedback */}
          {error && (
            <div
              className="admin-feedback admin-feedback-error"
              role="alert"
            >
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div
              className="admin-feedback admin-feedback-success"
              role="status"
            >
              <CheckCircle2 size={18} />
              <span>{message}</span>
            </div>
          )}

          {/* Doctor management */}
          <section
            className="admin-management-grid"
            id="doctor-management"
          >
            <div className="dashboard-section-card admin-management-card">
              <div className="dashboard-card-heading">
                <div>
                  <span className="dashboard-section-kicker">
                    ACCOUNT MANAGEMENT
                  </span>
                  <h3>Create doctor account</h3>
                </div>

                <div className="admin-heading-icon">
                  <UserPlus size={21} />
                </div>
              </div>

              <p className="admin-card-description">
                Create login credentials and connect a doctor
                to an existing healthcare provider profile.
              </p>

              <form
                onSubmit={handleSubmit}
                className="admin-doctor-form"
              >
                <div className="admin-form-grid">
                  <div className="admin-form-field">
                    <label htmlFor="first_name">First name</label>
                    <input
                      id="first_name"
                      name="first_name"
                      value={form.first_name}
                      onChange={handleChange}
                      placeholder="e.g. Asha"
                      autoComplete="given-name"
                      required
                    />
                  </div>

                  <div className="admin-form-field">
                    <label htmlFor="last_name">Last name</label>
                    <input
                      id="last_name"
                      name="last_name"
                      value={form.last_name}
                      onChange={handleChange}
                      placeholder="e.g. Sharma"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>

                <div className="admin-form-field">
                  <label htmlFor="doctor_email">Email address</label>
                  <div className="admin-input-with-icon">
                    <Mail size={17} />
                    <input
                      id="doctor_email"
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="doctor@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="admin-form-field">
                  <label htmlFor="doctor_password">
                    Temporary password
                  </label>
                  <input
                    id="doctor_password"
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Create a secure password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <small>
                    Share the login credentials securely with the doctor.
                  </small>
                </div>

                <div className="admin-form-field">
                  <label htmlFor="doctor_provider">
                    Assign provider profile
                  </label>
                  <select
                    id="doctor_provider"
                    name="provider"
                    value={form.provider}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select a provider</option>
                    {availableProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} — {provider.specialty}
                      </option>
                    ))}
                  </select>

                  {!loading && availableProviders.length === 0 && (
                    <small>
                      No unassigned provider profiles are currently available.
                    </small>
                  )}
                </div>

                <button
                  type="submit"
                  className="admin-submit-button"
                  disabled={
                    saving ||
                    loading ||
                    availableProviders.length === 0
                  }
                >
                  <UserPlus size={18} />
                  {saving ? 'Creating account...' : 'Create doctor account'}
                </button>
              </form>
            </div>

            {/* Doctor directory and editor */}
            <div className="dashboard-section-card admin-management-card">
              <div className="dashboard-card-heading">
                <div>
                  <span className="dashboard-section-kicker">
                    PROVIDER DIRECTORY
                  </span>
                  <h3>
                    {editingDoctor
                      ? 'Edit doctor account'
                      : 'Doctor accounts'}
                  </h3>
                </div>

                {!editingDoctor && (
                  <button
                    type="button"
                    className="doctor-refresh-button"
                    onClick={() => {
                      setLoading(true);
                      loadDashboard();
                    }}
                    disabled={loading}
                    aria-label="Refresh doctor accounts"
                  >
                    <RefreshCw size={16} />
                  </button>
                )}
              </div>

              {editingDoctor ? (
                <>
                  <p className="admin-card-description">
                    Update the account details and provider assignment for
                    Dr. {editingDoctor.first_name} {editingDoctor.last_name}.
                  </p>

                  <form
                    className="admin-doctor-form"
                    onSubmit={handleUpdateDoctor}
                  >
                    <div className="admin-form-grid">
                      <div className="admin-form-field">
                        <label htmlFor="edit_first_name">First name</label>
                        <input
                          id="edit_first_name"
                          value={editingDoctor.first_name}
                          onChange={(event) =>
                            setEditingDoctor((previous) => ({
                              ...previous,
                              first_name: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>

                      <div className="admin-form-field">
                        <label htmlFor="edit_last_name">Last name</label>
                        <input
                          id="edit_last_name"
                          value={editingDoctor.last_name}
                          onChange={(event) =>
                            setEditingDoctor((previous) => ({
                              ...previous,
                              last_name: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                    </div>

                    <div className="admin-form-field">
                      <label htmlFor="edit_provider">Assigned provider</label>
                      <select
                        id="edit_provider"
                        value={editingDoctor.provider}
                        onChange={(event) =>
                          setEditingDoctor((previous) => ({
                            ...previous,
                            provider: event.target.value,
                          }))
                        }
                        required
                      >
                        {providers
                          .filter((provider) =>
                            !doctors.some(
                              (doctor) =>
                                doctor.id !== editingDoctor.id &&
                                String(doctor.provider) === String(provider.id)
                            )
                          )
                          .map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.name} — {provider.specialty}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="admin-form-field">
                      <label htmlFor="edit_status">Account status</label>
                      <select
                        id="edit_status"
                        value={
                          editingDoctor.is_active ? 'active' : 'inactive'
                        }
                        onChange={(event) =>
                          setEditingDoctor((previous) => ({
                            ...previous,
                            is_active: event.target.value === 'active',
                          }))
                        }
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>

                    <div className="admin-form-grid">
                      <button
                        type="submit"
                        className="admin-submit-button"
                        disabled={updatingDoctor}
                      >
                        {updatingDoctor ? 'Saving changes...' : 'Save changes'}
                      </button>

                      <button
                        type="button"
                        className="doctor-refresh-button"
                        onClick={handleCancelEdit}
                        disabled={updatingDoctor}
                      >
                        <ArrowLeft size={15} />
                        Cancel
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <p className="admin-card-description">
                    Registered doctors and their assigned provider profiles.
                  </p>

                  {loading ? (
                    <div className="dashboard-empty">
                      Loading doctor accounts...
                    </div>
                  ) : doctors.length === 0 ? (
                    <div className="dashboard-empty">
                      <div className="dashboard-empty-icon">
                        <Users size={27} />
                      </div>
                      <strong>No doctor accounts yet</strong>
                      <p>
                        Create your first doctor account using the form.
                      </p>
                    </div>
                  ) : (
                    <div className="admin-doctor-directory">
                      {doctors.map((doctor) => (
                        <article
                          className="admin-doctor-row"
                          key={doctor.id}
                        >
                          <div className="admin-doctor-avatar">
                            {doctor.first_name?.charAt(0)}
                            {doctor.last_name?.charAt(0)}
                          </div>

                          <div className="admin-doctor-details">
                            <strong>
                              Dr. {doctor.first_name} {doctor.last_name}
                            </strong>
                            <span>{doctor.email}</span>

                            <span className="admin-doctor-specialty">
                              <Stethoscope size={14} />
                              {doctor.provider_name || 'Provider not assigned'}
                              {' · '}
                              {doctor.specialty || 'Specialty unavailable'}
                            </span>

                            <small>
                              <MapPin size={13} />
                              {doctor.city || 'Location unavailable'}
                            </small>

                            <button
                              type="button"
                              className="doctor-refresh-button"
                              onClick={() => handleEditDoctor(doctor)}
                            >
                              <Pencil size={14} />
                              Edit doctor
                            </button>
                          </div>

                          <span
                            className={
                              doctor.is_active
                                ? 'admin-doctor-status active'
                                : 'admin-doctor-status inactive'
                            }
                          >
                            {doctor.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Doctor availability management */}
          <section
            className="dashboard-section-card admin-availability-section"
            id="doctor-availability"
          >
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-section-kicker">
                  SCHEDULING MANAGEMENT
                </span>
                <h3>Doctor availability</h3>
              </div>

              <div className="admin-heading-icon">
                <CalendarClock size={21} />
              </div>
            </div>

            <p className="admin-card-description">
              Set each doctor's weekly working days, consultation hours
              and appointment slot duration. Doctors can view their
              schedules, but only administrators can change them.
            </p>

            <div className="admin-form-field">
              <label htmlFor="availability-doctor">
                Select doctor
              </label>

              <select
                id="availability-doctor"
                value={selectedAvailabilityDoctor}
                onChange={handleAvailabilityDoctorChange}
                disabled={loading || availabilityLoading || availabilitySaving}
              >
                <option value="">Choose a doctor to manage</option>

                {doctors.map((doctor) => (
                  <option
                    key={doctor.id}
                    value={doctor.provider}
                    disabled={!doctor.provider}
                  >
                    Dr. {doctor.first_name} {doctor.last_name}
                    {doctor.provider_name
                      ? ` — ${doctor.provider_name}`
                      : ''}
                  </option>
                ))}
              </select>

              {!loading && doctors.length === 0 && (
                <small>
                  Create a doctor account before setting availability.
                </small>
              )}
            </div>

            {availabilityError && (
              <div
                className="admin-feedback admin-feedback-error"
                role="alert"
              >
                <AlertCircle size={18} />
                <span>{availabilityError}</span>
              </div>
            )}

            {availabilityMessage && (
              <div
                className="admin-feedback admin-feedback-success"
                role="status"
              >
                <CheckCircle2 size={18} />
                <span>{availabilityMessage}</span>
              </div>
            )}

            {!selectedAvailabilityDoctor ? (
              <div className="dashboard-empty">
                <div className="dashboard-empty-icon">
                  <CalendarClock size={27} />
                </div>
                <strong>Select a doctor to begin</strong>
                <p>
                  Their weekly schedule will appear here once selected.
                </p>
              </div>
            ) : availabilityLoading ? (
              <div className="dashboard-empty">
                <RefreshCw size={20} />
                <p>Loading doctor's weekly schedule...</p>
              </div>
            ) : availabilityLoaded ? (
              <form
                className="admin-doctor-form"
                onSubmit={handleSaveAvailability}
              >
                {selectedDoctor && (
                  <div className="admin-availability-doctor">
                    <div className="admin-doctor-avatar">
                      {selectedDoctor.first_name?.charAt(0)}
                      {selectedDoctor.last_name?.charAt(0)}
                    </div>

                    <div>
                      <strong>
                        Dr. {selectedDoctor.first_name}{' '}
                        {selectedDoctor.last_name}
                      </strong>
                      <span>
                        {selectedDoctor.specialty || 'Healthcare provider'}
                        {selectedDoctor.city
                          ? ` · ${selectedDoctor.city}`
                          : ''}
                      </span>
                    </div>
                  </div>
                )}

                <div className="admin-availability-note">
                  <Clock3 size={17} />
                  <span>
                    All times use Nepal local time (NPT, UTC+5:45).
                    Unavailable days will not show appointment slots to patients.
                  </span>
                </div>

                <div className="admin-availability-list">
                  {availabilitySchedule.map((day) => (
                    <div
                      className={`admin-availability-day ${
                        day.is_available ? 'is-working' : 'is-off'
                      }`}
                      key={day.weekday}
                    >
                      <div className="admin-availability-day-heading">
                        <div>
                          <strong>{day.weekday_name}</strong>
                          <span>
                            {day.is_available
                              ? 'Working day'
                              : 'Day off'}
                          </span>
                        </div>

                        <label className="admin-availability-toggle">
                          <input
                            type="checkbox"
                            checked={day.is_available}
                            onChange={(event) =>
                              handleAvailabilityChange(
                                day.weekday,
                                'is_available',
                                event.target.checked
                              )
                            }
                          />
                          <span>
                            {day.is_available ? 'Available' : 'Unavailable'}
                          </span>
                        </label>
                      </div>

                      {day.is_available && (
                        <div className="admin-availability-fields">
                          <div className="admin-form-field">
                            <label htmlFor={`availability-start-${day.weekday}`}>
                              Opening time
                            </label>
                            <input
                              id={`availability-start-${day.weekday}`}
                              type="time"
                              value={day.start_time}
                              onChange={(event) =>
                                handleAvailabilityChange(
                                  day.weekday,
                                  'start_time',
                                  event.target.value
                                )
                              }
                              required
                            />
                          </div>

                          <div className="admin-form-field">
                            <label htmlFor={`availability-end-${day.weekday}`}>
                              Closing time
                            </label>
                            <input
                              id={`availability-end-${day.weekday}`}
                              type="time"
                              value={day.end_time}
                              onChange={(event) =>
                                handleAvailabilityChange(
                                  day.weekday,
                                  'end_time',
                                  event.target.value
                                )
                              }
                              required
                            />
                          </div>

                          <div className="admin-form-field">
                            <label htmlFor={`availability-duration-${day.weekday}`}>
                              Appointment duration
                            </label>
                            <select
                              id={`availability-duration-${day.weekday}`}
                              value={day.slot_duration}
                              onChange={(event) =>
                                handleAvailabilityChange(
                                  day.weekday,
                                  'slot_duration',
                                  event.target.value
                                )
                              }
                            >
                              <option value={15}>15 minutes</option>
                              <option value={30}>30 minutes</option>
                              <option value={45}>45 minutes</option>
                              <option value={60}>60 minutes</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="admin-submit-button"
                  disabled={availabilitySaving || !availabilityLoaded}
                >
                  <Save size={18} />
                  {availabilitySaving
                    ? 'Saving weekly schedule...'
                    : 'Save doctor availability'}
                </button>
              </form>
            ) : null}
          </section>

          {/* Schedule change requests */}
          <section
            className="dashboard-section-card admin-schedule-requests-section"
            id="schedule-change-requests"
          >
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-section-kicker">
                  WEEKLY AVAILABILITY CHANGES
                </span>
                <h3>Schedule change requests</h3>
                <p className="admin-card-description">
                  Review and manage doctors' requested weekly working hours.
                </p>
              </div>

              <div className="admin-heading-icon">
                <CalendarClock size={21} />
              </div>
            </div>

                  {(scheduleRequestsError || scheduleRequestsMessage) && (
        <div className="admin-schedule-toast-container">
          {scheduleRequestsError && (
            <div
              className="admin-schedule-toast admin-schedule-toast-error"
              role="alert"
            >
              <AlertCircle size={19} />
              <span>{scheduleRequestsError}</span>
              <button
                type="button"
                aria-label="Dismiss error message"
                onClick={() => setScheduleRequestsError('')}
              >
                <X size={17} />
              </button>
            </div>
          )}

          {scheduleRequestsMessage && (
            <div
              className="admin-schedule-toast admin-schedule-toast-success"
              role="status"
            >
              <CheckCircle2 size={19} />
              <span>{scheduleRequestsMessage}</span>
              <button
                type="button"
                aria-label="Dismiss success message"
                onClick={() => setScheduleRequestsMessage('')}
              >
                <X size={17} />
              </button>
            </div>
          )}
        </div>
      )}

            <div className="admin-schedule-requests-toolbar">
              <div>
                <strong>
                  {scheduleRequests.filter(
                    (item) => item.status === 'Pending'
                  ).length}
                </strong>
                <span> pending requests</span>
              </div>

              <button
                type="button"
                className="doctor-refresh-button"
                onClick={loadAdminScheduleChangeRequests}
                disabled={scheduleRequestsLoading}
              >
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>

            {scheduleRequestsLoading ? (
              <div className="dashboard-empty">
                <RefreshCw size={20} />
                <p>Loading schedule requests...</p>
              </div>
            ) : scheduleRequests.length === 0 ? (
              <div className="dashboard-empty">
                <div className="dashboard-empty-icon">
                  <CalendarClock size={27} />
                </div>
                <strong>No schedule requests yet</strong>
                <p>New requests from doctors will appear here.</p>
              </div>
            ) : (
              <div className="admin-schedule-request-list">
                {scheduleRequests.map((item) => {
                  const requestedDays = getRequestedScheduleRows(
                    item.requested_schedule
                  );

                  const doctorName =
                    item.doctor_name ||
                    item.doctor_display_name ||
                    item.doctor?.name ||
                    'Doctor';

                  const submittedDate = item.created_at
                    ? new Date(item.created_at).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Date unavailable';

                  return (
                    <article
                      className="admin-schedule-request-card"
                      key={item.id}
                    >
                      <div className="admin-schedule-request-header">
                        <div className="admin-schedule-request-identity">
                          <div className="admin-schedule-request-avatar">
                            <Stethoscope size={22} />
                          </div>

                          <div>
                            <span className="admin-schedule-request-number">
                              REQUEST #{item.id}
                            </span>
                            <h4>{doctorName}</h4>
                            <span className="admin-schedule-request-provider">
                              {item.provider_name ||
                                item.provider?.name ||
                                'Healthcare provider'}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`doctor-schedule-request-status ${String(
                            item.status || 'Pending'
                          ).toLowerCase()}`}
                        >
                          <span className="admin-schedule-status-dot" />
                          {item.status || 'Pending'}
                        </span>
                      </div>

                      <div className="admin-schedule-request-submitted">
                        <Clock3 size={15} />
                        <span>Submitted {submittedDate}</span>
                      </div>

                      <div className="admin-schedule-week">
                        <div className="admin-schedule-week-heading">
                          <div>
                            <span>REQUESTED HOURS</span>
                            <strong>Weekly schedule</strong>
                          </div>
                          <CalendarDays size={19} />
                        </div>

                        {requestedDays.length === 0 ? (
                          <p className="admin-schedule-no-days">
                            No schedule details were included in this request.
                          </p>
                        ) : (
                          <div className="admin-schedule-week-grid">
                            {WEEKDAYS.map((weekday) => {
                              const day = requestedDays.find(
                                (entry) =>
                                  Number(entry.weekday) === weekday.value
                              );

                              if (!day) {
                                return (
                                  <div
                                    className="admin-schedule-week-day is-missing"
                                    key={weekday.value}
                                  >
                                    <span>{weekday.label.slice(0, 3)}</span>
                                    <strong>—</strong>
                                    <small>Not provided</small>
                                  </div>
                                );
                              }

                              const isAvailable = Boolean(day.is_available);

                              return (
                                <div
                                  className={`admin-schedule-week-day ${
                                    isAvailable ? 'is-working' : 'is-off'
                                  }`}
                                  key={weekday.value}
                                >
                                  <span>{weekday.label.slice(0, 3)}</span>

                                  <strong>
                                    {isAvailable
                                      ? `${formatRequestedTime(day.start_time)} – ${formatRequestedTime(day.end_time)}`
                                      : 'Day off'}
                                  </strong>

                                  <small>
                                    {isAvailable
                                      ? `${Number(day.slot_duration) || 30} min slots`
                                      : 'Unavailable'}
                                  </small>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="admin-schedule-request-notes">
                        <div className="admin-schedule-note">
                          <span className="admin-schedule-note-label">
                            DOCTOR'S REASON
                          </span>
                          <p>{item.reason || 'No reason provided.'}</p>
                        </div>

                        {item.status !== 'Pending' && item.admin_response && (
                          <div className="admin-schedule-note admin-schedule-note-response">
                            <span className="admin-schedule-note-label">
                              REJECTION EXPLANATION
                            </span>
                            <p>{item.admin_response}</p>
                          </div>
                        )}
                      </div>

                      {item.status === 'Pending' && (
                        <div className="admin-schedule-review">
                          <label htmlFor={`schedule-response-${item.id}`}>
                            Rejection explanation
                            <span>Required only when rejecting</span>
                          </label>

                          <textarea
                            id={`schedule-response-${item.id}`}
                            rows={3}
                            maxLength={1000}
                            value={scheduleResponses[item.id] || ''}
                            onChange={(event) =>
                              handleScheduleResponseChange(
                                item.id,
                                event.target.value
                              )
                            }
                            placeholder="Explain why this schedule request cannot be approved..."
                            disabled={reviewingScheduleId !== null}
                          />

                          <div className="admin-schedule-review-actions">
                            <button
                              type="button"
                              className="admin-leave-reject-button"
                              onClick={() =>
                                handleScheduleReview(item.id, 'Rejected')
                              }
                              disabled={reviewingScheduleId !== null}
                            >
                              <XCircle size={16} />
                              {reviewingScheduleId === item.id
                                ? 'Processing...'
                                : 'Reject request'}
                            </button>

                            <button
                              type="button"
                              className="admin-leave-approve-button"
                              onClick={() =>
                                handleScheduleReview(item.id, 'Approved')
                              }
                              disabled={reviewingScheduleId !== null}
                            >
                              <Check size={16} />
                              {reviewingScheduleId === item.id
                                ? 'Processing...'
                                : 'Approve schedule'}
                            </button>
                          </div>
                        </div>
                      )}

                      {item.status !== 'Pending' && !item.admin_response && (
                        <div className="admin-schedule-reviewed-label">
                          <CheckCircle2 size={15} />
                          This request has been reviewed.
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Doctor leave requests */}
          <section
            className="dashboard-section-card admin-leave-requests-section"
            id="leave-requests"
          >
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-section-kicker">
                  DOCTOR TIME OFF
                </span>
                <h3>Leave requests</h3>
              </div>
              <div className="admin-heading-icon">
                <CalendarCheck size={21} />
              </div>
            </div>

            <p className="admin-card-description">
              Review date-specific leave requests from doctors. Approving a
              request blocks overlapping appointment slots; requests that
              conflict with existing appointments cannot be approved until
              those conflicts are resolved.
            </p>

            {leaveRequestsError && (
              <div
                className="admin-feedback admin-feedback-error"
                role="alert"
              >
                <AlertCircle size={18} />
                <span>{leaveRequestsError}</span>
              </div>
            )}

            {leaveRequestsMessage && (
              <div
                className="admin-feedback admin-feedback-success"
                role="status"
              >
                <CheckCircle2 size={18} />
                <span>{leaveRequestsMessage}</span>
              </div>
            )}

            <div className="admin-leave-toolbar">
              <span>
                {leaveRequests.filter(
                  (item) => item.status === 'Pending'
                ).length}{' '}
                pending request(s)
              </span>

              <button
                type="button"
                className="doctor-refresh-button"
                onClick={loadAdminLeaveRequests}
                disabled={leaveRequestsLoading}
              >
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>

            {leaveRequestsLoading ? (
              <div className="dashboard-empty">
                <RefreshCw size={20} />
                <p>Loading doctor leave requests...</p>
              </div>
            ) : leaveRequests.length === 0 ? (
              <div className="dashboard-empty">
                <CalendarCheck size={24} />
                <strong>No leave requests yet</strong>
                <p>
                  Doctor leave requests will appear here for review.
                </p>
              </div>
            ) : (
              <div className="admin-leave-request-list">
                {leaveRequests.map((item) => (
                  <article
                    className="admin-leave-request-card"
                    key={item.id}
                  >
                    <div className="admin-leave-request-top">
                      <div>
                        <span className="dashboard-section-kicker">
                          REQUEST #{item.id}
                        </span>
                        <h4>
                          {item.doctor_name ||
                            item.doctor_display_name ||
                            'Doctor'}
                        </h4>
                        <p>
                          {item.provider_name || 'Healthcare provider'}
                        </p>
                      </div>

                      <span
                        className={`doctor-schedule-request-status ${String(
                          item.status || 'Pending'
                        ).toLowerCase()}`}
                      >
                        {item.status || 'Pending'}
                      </span>
                    </div>

                    <div className="admin-leave-request-details">
                      <div>
                        <span>Leave date</span>
                        <strong>{item.leave_date || '—'}</strong>
                      </div>
                      <div>
                        <span>Leave type</span>
                        <strong>
                          {item.leave_type_display ||
                            item.leave_type ||
                            '—'}
                        </strong>
                      </div>
                      <div>
                        <span>Requested hours</span>
                        <strong>
                          {item.start_time && item.end_time
                            ? `${String(item.start_time).slice(0, 5)} – ${String(
                                item.end_time
                              ).slice(0, 5)}`
                            : '—'}
                        </strong>
                      </div>
                      <div>
                        <span>Submitted</span>
                        <strong>
                          {item.created_at
                            ? new Date(item.created_at).toLocaleString()
                            : '—'}
                        </strong>
                      </div>
                    </div>

                    <div className="admin-leave-reason">
                      <strong>Doctor's reason</strong>
                      <p>{item.reason}</p>
                    </div>

                    {item.status === 'Pending' ? (
                      <div className="admin-leave-review">
                        <label>
                          <span>
                            Rejection explanation (required only when rejecting)
                          </span>
                          <textarea
                            rows={2}
                            maxLength={1000}
                            value={leaveResponses[item.id] || ''}
                            onChange={(event) =>
                              handleLeaveResponseChange(
                                item.id,
                                event.target.value
                              )
                            }
                            placeholder="Explain why this leave request cannot be approved..."
                            disabled={reviewingLeaveId !== null}
                          />
                        </label>

                        <div className="admin-leave-review-actions">
                          <button
                            type="button"
                            className="admin-leave-reject-button"
                            onClick={() =>
                              handleLeaveReview(item.id, 'Rejected')
                            }
                            disabled={reviewingLeaveId !== null}
                          >
                            <XCircle size={16} />
                            {reviewingLeaveId === item.id
                              ? 'Processing...'
                              : 'Reject'}
                          </button>

                          <button
                            type="button"
                            className="admin-leave-approve-button"
                            onClick={() =>
                              handleLeaveReview(item.id, 'Approved')
                            }
                            disabled={reviewingLeaveId !== null}
                          >
                            <Check size={16} />
                            {reviewingLeaveId === item.id
                              ? 'Processing...'
                              : 'Approve leave'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      item.admin_response && (
                        <div className="doctor-schedule-admin-response">
                          <strong>Rejection explanation</strong>
                          <p>{item.admin_response}</p>
                        </div>
                      )
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Patient and appointment management */}
          <section className="admin-management-grid">
            {/* Patient management */}
            <div
              className="dashboard-section-card admin-management-card"
              id="patient-management"
            >
              <div className="dashboard-card-heading">
                <div>
                  <span className="dashboard-section-kicker">
                    PATIENT DIRECTORY
                  </span>
                  <h3>
                    {editingPatient
                      ? 'Edit patient account'
                      : 'Patient accounts'}
                  </h3>
                </div>

                {!editingPatient && (
                  <button
                    type="button"
                    className="doctor-refresh-button"
                    onClick={refreshPatients}
                    disabled={loadingPatients}
                    aria-label="Refresh patient accounts"
                  >
                    <RefreshCw size={16} />
                  </button>
                )}
              </div>

              {editingPatient ? (
                <>
                  <p className="admin-card-description">
                    Update the details and account status for{' '}
                    {editingPatient.first_name} {editingPatient.last_name}.
                  </p>

                  <form
                    className="admin-doctor-form"
                    onSubmit={handleUpdatePatient}
                  >
                    <div className="admin-form-grid">
                      <div className="admin-form-field">
                        <label htmlFor="patient_first_name">First name</label>
                        <input
                          id="patient_first_name"
                          value={editingPatient.first_name}
                          onChange={(event) =>
                            setEditingPatient((previous) => ({
                              ...previous,
                              first_name: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>

                      <div className="admin-form-field">
                        <label htmlFor="patient_last_name">Last name</label>
                        <input
                          id="patient_last_name"
                          value={editingPatient.last_name}
                          onChange={(event) =>
                            setEditingPatient((previous) => ({
                              ...previous,
                              last_name: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                    </div>

                    <div className="admin-form-field">
                      <label htmlFor="patient_status">Account status</label>
                      <select
                        id="patient_status"
                        value={
                          editingPatient.is_active ? 'active' : 'inactive'
                        }
                        onChange={(event) =>
                          setEditingPatient((previous) => ({
                            ...previous,
                            is_active: event.target.value === 'active',
                          }))
                        }
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <small>
                        Inactive patients will not be able to log in.
                      </small>
                    </div>

                    <div className="admin-form-grid">
                      <button
                        type="submit"
                        className="admin-submit-button"
                        disabled={updatingPatient}
                      >
                        {updatingPatient ? 'Saving changes...' : 'Save changes'}
                      </button>

                      <button
                        type="button"
                        className="doctor-refresh-button"
                        onClick={handleCancelPatientEdit}
                        disabled={updatingPatient}
                      >
                        <ArrowLeft size={15} />
                        Cancel
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <p className="admin-card-description">
                    View registered patients, search their accounts and
                    manage account status.
                  </p>

                  <form
                    className="admin-doctor-form"
                    onSubmit={handlePatientSearch}
                  >
                    <div className="admin-form-field">
                      <label htmlFor="patient_search">Search patients</label>
                      <div className="admin-input-with-icon">
                        <Search size={17} />
                        <input
                          id="patient_search"
                          type="search"
                          value={patientSearch}
                          onChange={(event) =>
                            setPatientSearch(event.target.value)
                          }
                          placeholder="Search by name, email or username"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="admin-submit-button"
                      disabled={loadingPatients}
                    >
                      <Search size={17} />
                      {loadingPatients ? 'Searching...' : 'Search patients'}
                    </button>
                  </form>

                  {loadingPatients ? (
                    <div className="dashboard-empty">
                      Loading patients...
                    </div>
                  ) : patients.length === 0 ? (
                    <div className="dashboard-empty">
                      <div className="dashboard-empty-icon">
                        <Users size={27} />
                      </div>
                      <strong>No patients found</strong>
                      <p>
                        Try another search or check back when patients
                        have registered.
                      </p>
                    </div>
                  ) : (
                    <div className="admin-doctor-directory">
                      {patients.map((patient) => (
                        <article
                          className="admin-doctor-row"
                          key={patient.id}
                        >
                          <div className="admin-doctor-avatar">
                            {patient.first_name?.charAt(0) ||
                              patient.username?.charAt(0) ||
                              'P'}
                            {patient.last_name?.charAt(0) || ''}
                          </div>

                          <div className="admin-doctor-details">
                            <strong>
                              {[patient.first_name, patient.last_name]
                                .filter(Boolean)
                                .join(' ') || patient.username}
                            </strong>

                            <span>
                              <Mail size={14} />
                              {patient.email || 'No email available'}
                            </span>

                            <span className="admin-doctor-specialty">
                              <UserRound size={14} />
                              Username: {patient.username}
                            </span>

                            <small>
                              <CalendarDays size={13} />
                              Joined: {formatDate(patient.date_joined)}
                            </small>

                            <small>
                              <Activity size={13} />
                              Appointments: {patient.appointments_count ?? 0}
                            </small>

                            <button
                              type="button"
                              className="doctor-refresh-button"
                              onClick={() => handleEditPatient(patient)}
                            >
                              <Pencil size={14} />
                              Edit patient
                            </button>
                          </div>

                          <span
                            className={
                              patient.is_active
                                ? 'admin-doctor-status active'
                                : 'admin-doctor-status inactive'
                            }
                          >
                            {patient.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Appointment management */}
            <div
              className="dashboard-section-card admin-management-card"
              id="appointment-management"
            >
              <div className="dashboard-card-heading">
                <div>
                  <span className="dashboard-section-kicker">
                    APPOINTMENT DIRECTORY
                  </span>
                  <h3>Appointment management</h3>
                </div>

                <button
                  type="button"
                  className="doctor-refresh-button"
                  onClick={refreshAppointments}
                  disabled={loadingAppointments}
                  aria-label="Refresh appointments"
                >
                  <RefreshCw size={16} />
                </button>
              </div>

              <p className="admin-card-description">
                View patient appointments, check assigned doctors and
                update appointment statuses.
              </p>

              <div className="admin-form-field">
                <label htmlFor="appointment_filter">
                  Filter appointments by status
                </label>
                <select
                  id="appointment_filter"
                  className="admin-appointment-filter"
                  value={appointmentFilter}
                  onChange={(event) =>
                    setAppointmentFilter(event.target.value)
                  }
                >
                  <option value="All">All appointments</option>
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {loadingAppointments ? (
                <div className="dashboard-empty">
                  Loading appointments...
                </div>
              ) : filteredAppointments.length === 0 ? (
                <div className="dashboard-empty">
                  <div className="dashboard-empty-icon">
                    <CalendarDays size={27} />
                  </div>
                  <strong>No appointments found</strong>
                  <p>
                    There are no appointments matching this status.
                  </p>
                </div>
              ) : (
                <div className="admin-doctor-directory">
                  {filteredAppointments.map((appointment) => {
                    const selectedStatus =
                      appointmentStatusDrafts[appointment.id] ||
                      appointment.status;

                    const hasStatusChanged =
                      selectedStatus !== appointment.status;

                    return (
                      <article
                        className="admin-doctor-row admin-appointment-row"
                        key={appointment.id}
                      >
                        <div className="admin-doctor-avatar">
                          <CalendarDays size={21} />
                        </div>

                        <div className="admin-doctor-details">
                          <strong>
                            Appointment #{appointment.id}
                          </strong>

                          <span>
                            <UserRound size={14} />
                            Patient: {appointment.patient_name || 'Not available'}
                          </span>

                          <span>
                            <Mail size={14} />
                            {appointment.patient_email || 'No email available'}
                          </span>

                          <span className="admin-doctor-specialty">
                            <Stethoscope size={14} />
                            Doctor: {appointment.provider_name || 'Not assigned'}
                          </span>

                          <small>
                            Specialty: {appointment.specialty || 'Not available'}
                          </small>

                          <small>
                            <CalendarDays size={13} />
                            Date: {formatDate(appointment.preferred_date)}
                          </small>

                          {(appointment.start_time || appointment.end_time) && (
                            <small>
                              <Clock3 size={13} />
                              Time: {appointment.start_time || 'Not available'}
                              {appointment.end_time
                                ? ` – ${appointment.end_time}`
                                : ''}
                            </small>
                          )}

                          <small>
                            Consultation: {appointment.consultation_type || 'Not available'}
                          </small>

                          <small>
                            Reason: {appointment.reason || 'Not provided'}
                          </small>

                          <div className="admin-appointment-actions">
                            <div className="admin-form-field">
                              <label htmlFor={`appointment-status-${appointment.id}`}>
                                Appointment status
                              </label>

                              <select
                                id={`appointment-status-${appointment.id}`}
                                className="admin-appointment-status-select"
                                value={selectedStatus}
                                onChange={(event) =>
                                  handleAppointmentStatusChange(
                                    appointment.id,
                                    event.target.value
                                  )
                                }
                                disabled={updatingAppointment !== null}
                              >
                                <option value="Pending">Pending</option>
                                <option value="Confirmed">Confirmed</option>
                                <option value="Completed">Completed</option>
                                <option value="Cancelled">Cancelled</option>
                              </select>
                            </div>

                            <button
                              type="button"
                              className="doctor-refresh-button"
                              disabled={
                                !hasStatusChanged ||
                                updatingAppointment !== null
                              }
                              onClick={() =>
                                handleUpdateAppointmentStatus(appointment)
                              }
                            >
                              {updatingAppointment === appointment.id
                                ? 'Saving...'
                                : 'Save status'}
                            </button>
                          </div>
                        </div>

                        <span
                          className={
                            appointment.status === 'Confirmed' ||
                            appointment.status === 'Completed'
                              ? 'admin-doctor-status active'
                              : 'admin-doctor-status inactive'
                          }
                        >
                          {appointment.status}
                        </span>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

                   {/* Review management */}
          <section
            className="dashboard-section-card admin-review-management"
            id="review-management"
          >
            <div className="dashboard-card-heading">
              <div>
                <span className="dashboard-section-kicker">
                  PATIENT FEEDBACK AND MODERATION
                </span>
                <h3>Review management</h3>
                <p className="admin-card-description">
                  Monitor doctor ratings, moderate patient reviews and
                  investigate reports submitted by users.
                </p>
              </div>

              <div className="admin-heading-icon">
                <Star size={21} />
              </div>
            </div>

            {reviewsError && (
              <div className="admin-feedback admin-feedback-error" role="alert">
                <AlertCircle size={18} />
                <span>{reviewsError}</span>
              </div>
            )}

            {reviewsMessage && (
              <div className="admin-feedback admin-feedback-success" role="status">
                <CheckCircle2 size={18} />
                <span>{reviewsMessage}</span>
              </div>
            )}

            <div className="admin-review-stats">
              {[
                {
                  label: 'Pending reviews',
                  count: pendingReviewCount,
                  type: 'pending',
                },
                {
                  label: 'Approved reviews',
                  count: approvedReviewCount,
                  type: 'approved',
                },
                {
                  label: 'Rejected reviews',
                  count: rejectedReviewCount,
                  type: 'rejected',
                },
              ].map((item) => (
                <div
                  className={`admin-review-stat admin-review-stat-${item.type}`}
                  key={item.label}
                >
                  <span>{item.label}</span>
                  <strong>{reviewsLoading ? '...' : item.count}</strong>
                </div>
              ))}
            </div>

            <div className="admin-review-subheading">
              <div>
                <h3>Doctor reviews</h3>
                <p className="admin-card-description">
                  Only approved reviews are visible publicly and contribute
                  to displayed doctor ratings.
                </p>
              </div>

              <div className="admin-review-toolbar">
                <select
                  aria-label="Filter reviews by moderation status"
                  value={reviewFilter}
                  onChange={handleReviewFilterChange}
                  disabled={reviewsLoading}
                >
                  <option value="All">All reviews</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>

                <button
                  type="button"
                  className="doctor-refresh-button"
                  onClick={() => loadAdminReviews()}
                  disabled={reviewsLoading}
                  aria-label="Refresh reviews"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>

            {reviewsLoading ? (
              <div className="dashboard-empty">
                <RefreshCw size={20} />
                <p>Loading doctor reviews...</p>
              </div>
            ) : reviews.length === 0 ? (
              <div className="dashboard-empty">
                <div className="dashboard-empty-icon">
                  <MessageSquare size={26} />
                </div>
                <strong>No reviews found</strong>
                <p>
                  There are no reviews matching the selected filter.
                </p>
              </div>
            ) : (
              <div className="admin-review-list">
                {reviews.map((review) => {
                  const rating = Math.max(
                    0,
                    Math.min(5, Number(review.rating) || 0)
                  );

                  const status = review.moderation_status || 'Pending';

                  return (
                    <article
                      className="admin-review-card"
                      key={review.id}
                    >
                      <div className="admin-review-card-header">
                        <div className="admin-review-card-identity">
                          <div className="admin-review-avatar">
                            <Star size={19} />
                          </div>

                          <div>
                            <strong>
                              Review #{review.id}
                            </strong>
                            <span>{getReviewDoctorName(review)}</span>
                          </div>
                        </div>

                        <span
                          className={`admin-review-status ${status.toLowerCase()}`}
                        >
                          {status}
                        </span>
                      </div>

                      <div className="admin-review-meta">
                        <span>
                          <UserRound size={14} />
                          {getReviewPatientName(review)}
                        </span>

                        <span>
                          <Clock3 size={13} />
                          {formatReviewDate(review.created_at)}
                        </span>

                        {review.appointment_id && (
                          <span>
                            Appointment #{review.appointment_id}
                          </span>
                        )}
                      </div>

                      <div
                        className="admin-review-rating"
                        aria-label={`${rating} out of 5 stars`}
                      >
                        <span>{'★'.repeat(rating)}</span>
                        <span className="admin-review-empty-stars">
                          {'☆'.repeat(5 - rating)}
                        </span>
                        <small>{rating}/5</small>
                      </div>

                      <p className="admin-review-comment">
                        {review.comment || 'No written comment provided.'}
                      </p>

                      {review.moderation_note && (
                        <div className="admin-review-note">
                          <strong>Previous moderation note</strong>
                          <p>{review.moderation_note}</p>
                        </div>
                      )}

                      <div className="admin-review-moderation">
                        <label htmlFor={`review-note-${review.id}`}>
                          Moderation note
                          {status !== 'Approved' && (
                            <span> — required when rejecting</span>
                          )}
                        </label>

                        <textarea
                          id={`review-note-${review.id}`}
                          rows={2}
                          maxLength={1000}
                          value={reviewNotes[review.id] || ''}
                          onChange={(event) =>
                            handleReviewNoteChange(
                              review.id,
                              event.target.value
                            )
                          }
                          placeholder="Add an explanation or moderation note..."
                          disabled={reviewingReviewId !== null}
                        />

                        <div className="admin-review-actions">
                          <button
                            type="button"
                            className="admin-leave-approve-button"
                            onClick={() =>
                              handleReviewModeration(review.id, 'Approved')
                            }
                            disabled={reviewingReviewId !== null}
                          >
                            <Check size={15} />
                            {reviewingReviewId === review.id
                              ? 'Saving...'
                              : 'Approve review'}
                          </button>

                          <button
                            type="button"
                            className="admin-leave-reject-button"
                            onClick={() =>
                              handleReviewModeration(review.id, 'Rejected')
                            }
                            disabled={reviewingReviewId !== null}
                          >
                            <XCircle size={15} />
                            {reviewingReviewId === review.id
                              ? 'Saving...'
                              : 'Reject review'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="admin-review-reports">
              <div className="admin-review-subheading">
                <div>
                  <span className="dashboard-section-kicker">
                    COMMUNITY SAFETY
                  </span>
                  <h3>Reported reviews</h3>
                  <p className="admin-card-description">
                    Investigate reports submitted by users and record
                    the outcome of each investigation.
                  </p>
                </div>

                <button
                  type="button"
                  className="doctor-refresh-button"
                  onClick={loadAdminReviewReports}
                  disabled={reviewReportsLoading}
                >
                  <RefreshCw size={15} />
                  Refresh reports
                </button>
              </div>

              <div className="admin-report-pending-count">
                <Flag size={16} />
                <strong>
                  {reviewReportsLoading ? '...' : pendingReportCount}
                </strong>
                pending report(s)
              </div>

              {reviewReportsError && (
                <div className="admin-feedback admin-feedback-error" role="alert">
                  <AlertCircle size={18} />
                  <span>{reviewReportsError}</span>
                </div>
              )}

              {reviewReportsMessage && (
                <div className="admin-feedback admin-feedback-success" role="status">
                  <CheckCircle2 size={18} />
                  <span>{reviewReportsMessage}</span>
                </div>
              )}

              {reviewReportsLoading ? (
                <div className="dashboard-empty">
                  <RefreshCw size={20} />
                  <p>Loading review reports...</p>
                </div>
              ) : reviewReports.length === 0 ? (
                <div className="dashboard-empty">
                  <div className="dashboard-empty-icon">
                    <Flag size={25} />
                  </div>
                  <strong>No review reports</strong>
                  <p>Reports submitted by users will appear here.</p>
                </div>
              ) : (
                <div className="admin-review-list">
                  {reviewReports.map((report) => {
                    const reportedReview = getReportReview(report);
                    const reportStatus = report.status || 'Pending';

                    const reviewId =
                      reportedReview?.id ||
                      (typeof report.review === 'number'
                        ? report.review
                        : report.review_id);

                    const reporter =
                      report.reported_by_name ||
                      report.reporter_name ||
                      report.user_name ||
                      report.reported_by?.name ||
                      report.reported_by?.username ||
                      'User';

                    const reportReason =
                      report.reason ||
                      report.report_reason ||
                      'No reason provided.';

                    return (
                      <article
                        className="admin-review-card admin-review-report-card"
                        key={report.id}
                      >
                        <div className="admin-review-card-header">
                          <div className="admin-review-card-identity">
                            <div className="admin-review-avatar report">
                              <Flag size={18} />
                            </div>

                            <div>
                              <strong>Report #{report.id}</strong>
                              <span>Submitted by {reporter}</span>
                            </div>
                          </div>

                          <span
                            className={`admin-review-status ${
                              reportStatus === 'Reviewed'
                                ? 'approved'
                                : 'pending'
                            }`}
                          >
                            {reportStatus}
                          </span>
                        </div>

                        <div className="admin-review-meta">
                          <span>
                            <MessageSquare size={14} />
                            {reviewId
                              ? `Review #${reviewId}`
                              : 'Review details unavailable'}
                          </span>

                          <span>
                            <Clock3 size={13} />
                            {formatReviewDate(report.created_at)}
                          </span>
                        </div>

                        <div className="admin-report-reason">
                          <strong>Report reason</strong>
                          <p>{reportReason}</p>
                        </div>

                        {reportedReview && (
                          <div className="admin-reported-review-preview">
                            <strong>
                              {getReviewDoctorName(reportedReview)}
                            </strong>
                            <p>
                              {reportedReview.comment ||
                                'No written review comment.'}
                            </p>
                            {reportedReview.rating && (
                              <small>
                                Rating: {reportedReview.rating}/5
                              </small>
                            )}
                          </div>
                        )}

                        {report.admin_note && (
                          <div className="admin-review-note">
                            <strong>Administrator note</strong>
                            <p>{report.admin_note}</p>
                          </div>
                        )}

                        {reportStatus === 'Pending' && (
                          <div className="admin-review-moderation">
                            <label htmlFor={`report-note-${report.id}`}>
                              Administrator note
                              <span> — optional</span>
                            </label>

                            <textarea
                              id={`report-note-${report.id}`}
                              rows={2}
                              maxLength={1000}
                              value={reportNotes[report.id] || ''}
                              onChange={(event) =>
                                handleReportNoteChange(
                                  report.id,
                                  event.target.value
                                )
                              }
                              placeholder="Record what you found while reviewing this report..."
                              disabled={updatingReportId !== null}
                            />

                            <div className="admin-review-actions">
                              <button
                                type="button"
                                className="admin-leave-approve-button"
                                onClick={() =>
                                  handleMarkReportReviewed(report.id)
                                }
                                disabled={updatingReportId !== null}
                              >
                                <CheckCircle2 size={15} />
                                {updatingReportId === report.id
                                  ? 'Updating...'
                                  : 'Mark as reviewed'}
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          <footer className="dashboard-footer">
            <HeartPulse size={17} />
            <span>
              Healthcare without borders. Your care makes a difference.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
