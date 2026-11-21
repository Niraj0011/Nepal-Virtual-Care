import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HeartPulse, LayoutDashboard, CalendarDays, Users, Clock3,
  CheckCircle2, XCircle, Stethoscope, Menu, X, Home, RefreshCw,
  UserRound, ClipboardList, ShieldCheck, Save, CalendarClock, Sun,
  Moon, Send, AlertCircle, CalendarCheck, ChevronDown, FileClock,
  Video, FileText, Plus, Trash2, Pill, Clipboard,
} from 'lucide-react';

import { useApp } from '../context/AppContext';
import {
  getAppointments,
  updateAppointmentStatus,
  getDoctorAvailability,
  saveDoctorAvailability,
  getDoctorScheduleChangeRequests,
  createDoctorScheduleChangeRequest,
  getDoctorLeaveRequests,
  createDoctorLeaveRequest,
  getPrescriptions,
  createPrescription,
  getDoctorPatientHealthHistory,
  getRescheduleRequests,
  reviewRescheduleRequest,
  getAvailableSlots,
  createFollowUpAppointment,
} from '../api';

const WEEKDAYS = [
  { weekday: 0, name: 'Monday', short: 'MON' },
  { weekday: 1, name: 'Tuesday', short: 'TUE' },
  { weekday: 2, name: 'Wednesday', short: 'WED' },
  { weekday: 3, name: 'Thursday', short: 'THU' },
  { weekday: 4, name: 'Friday', short: 'FRI' },
  { weekday: 5, name: 'Saturday', short: 'SAT' },
  { weekday: 6, name: 'Sunday', short: 'SUN' },
];

const HEALTH_HISTORY_FIELDS = [
  { key: 'medical_conditions', label: 'Medical conditions' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'current_medications', label: 'Current medications' },
  { key: 'past_surgeries', label: 'Past surgeries and procedures' },
  { key: 'family_medical_history', label: 'Family medical history' },
  { key: 'additional_notes', label: 'Additional notes' },
];

function createDefaultSchedule() {
  return WEEKDAYS.map((day) => ({
    weekday: day.weekday,
    weekday_name: day.name,
    start_time: '09:00',
    end_time: '17:00',
    slot_duration: 30,
    is_available: false,
  }));
}

function createEmptyMedicine() {
  return {
    medicine_name: '',
    strength: '',
    dosage: '',
    route: '',
    frequency: '',
    duration: '',
    quantity: '',
    instructions: '',
  };
}

function normalizeSchedule(data) {
  const received = Array.isArray(data)
    ? data
    : Array.isArray(data?.availability)
      ? data.availability
      : Array.isArray(data?.results)
        ? data.results
        : [];

  const defaults = createDefaultSchedule();

  return defaults.map((defaultDay) => {
    const savedDay = received.find(
      (item) => Number(item.weekday) === defaultDay.weekday
    );

    if (!savedDay) return defaultDay;

    return {
      ...defaultDay,
      ...savedDay,
      start_time: savedDay.start_time
        ? savedDay.start_time.slice(0, 5)
        : defaultDay.start_time,
      end_time: savedDay.end_time
        ? savedDay.end_time.slice(0, 5)
        : defaultDay.end_time,
      slot_duration: Number(savedDay.slot_duration) || 30,
      is_available: Boolean(savedDay.is_available),
    };
  });
}

function getResponseList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.appointments)) return data.appointments;
  if (Array.isArray(data?.requests)) return data.requests;
  if (Array.isArray(data?.reschedule_requests)) return data.reschedule_requests;
  if (Array.isArray(data?.prescriptions)) return data.prescriptions;
  return [];
}

function normalizeAvailableSlots(data) {
  const received = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data?.slots)
        ? data.slots
        : Array.isArray(data?.available_slots)
          ? data.available_slots
          : [];

  return received
    .map((slot) => {
      const start = typeof slot === 'string'
        ? slot
        : slot?.start_time || slot?.start || slot?.time || '';

      const end = typeof slot === 'object'
        ? slot?.end_time || slot?.end || ''
        : '';

      return {
        start_time: start ? start.slice(0, 5) : '',
        end_time: end ? end.slice(0, 5) : '',
        is_available: !(
          slot?.is_available === false ||
          slot?.available === false ||
          slot?.booked === true
        ),
      };
    })
    .filter((slot) => slot.start_time && slot.is_available);
}

function formatTime(value) {
  if (!value) return '';
  const [hourText, minute] = value.slice(0, 5).split(':');
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatDateTime(value) {
  if (!value) return 'recently';
  return new Date(value).toLocaleString();
}

function getLocalDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 10);
}

function getLocalTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getLocalDateString(tomorrow);
}

function getVideoJoinState(appointment) {
  if (
    (appointment.status || '').toLowerCase() !== 'confirmed' ||
    (appointment.consultation_type || '').toLowerCase() !==
      'video consultation'
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

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return 'unavailable';
  }

  const now = new Date();
  const allowedStart = new Date(start.getTime() - 15 * 60 * 1000);
  const allowedEnd = new Date(end.getTime() + 30 * 60 * 1000);

  if (now < allowedStart) return 'upcoming';
  if (now > allowedEnd) return 'expired';

  return 'available';
}

function getPrescriptionAppointmentId(prescription) {
  const appointment = prescription?.appointment;
  return Number(
    typeof appointment === 'object' ? appointment?.id : appointment
  );
}

function getPatientProfilePhoto(record) {
  const patient = record?.patient_details || record?.patient || {};
  const profile = patient?.profile || patient?.patient_profile || {};

  return (
    record?.patient_profile_photo ||
    record?.patient_photo ||
    record?.patient_avatar ||
    patient?.profile_photo_url ||
    patient?.profile_image ||
    patient?.photo ||
    patient?.profile_photo ||
    patient?.photo_url ||
    patient?.avatar_url ||
    profile?.profile_photo ||
    profile?.photo_url ||
    profile?.avatar_url ||
    profile?.photo ||
    ''
  );
}

function getAppointmentPatientId(appointment) {
  const patient = appointment?.patient;

  const value =
    appointment?.patient_id ??
    (patient && typeof patient === 'object'
      ? patient.id ?? patient.user_id
      : patient) ??
    appointment?.patient_user_id ??
    appointment?.patient_details?.id ??
    appointment?.patient_details?.user_id;

  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function getAppointmentProviderId(appointment) {
  const provider = appointment?.provider;

  const value =
    appointment?.provider_id ??
    (provider && typeof provider === 'object'
      ? provider.id
      : provider) ??
    appointment?.provider_details?.id;

  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

function getFollowUpOriginalId(appointment) {
  const original = appointment?.follow_up_of;
  const value = typeof original === 'object' ? original?.id : original;
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function DoctorDashboard() {
  const { user } = useApp();
  const location = useLocation();

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [followUpsExpanded, setFollowUpsExpanded] = useState(false);
  const [filter, setFilter] = useState('All');
  const [activeNav, setActiveNav] = useState('Overview');

  const [schedule, setSchedule] = useState(createDefaultSchedule);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityLocked, setAvailabilityLocked] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityMessage, setAvailabilityMessage] = useState('');

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [requestSchedule, setRequestSchedule] = useState(createDefaultSchedule);
  const [requestReason, setRequestReason] = useState('');
  const [scheduleRequests, setScheduleRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');

  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveType, setLeaveType] = useState('Full day');
  const [leaveStartTime, setLeaveStartTime] = useState('');
  const [leaveEndTime, setLeaveEndTime] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  // Digital prescriptions
  const [prescriptions, setPrescriptions] = useState([]);
  const [prescriptionsLoading, setPrescriptionsLoading] = useState(true);
  const [prescriptionModalOpen, setPrescriptionModalOpen] = useState(false);
  const [prescriptionAppointment, setPrescriptionAppointment] = useState(null);
  const [prescriptionReplacesId, setPrescriptionReplacesId] = useState(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [prescriptionInstructions, setPrescriptionInstructions] = useState('');
  const [medicineItems, setMedicineItems] = useState([createEmptyMedicine()]);
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false);
  const [prescriptionError, setPrescriptionError] = useState('');
  const [prescriptionMessage, setPrescriptionMessage] = useState('');

  // Patient health history — read-only for authorized doctors.
  const [healthHistoryAppointmentId, setHealthHistoryAppointmentId] = useState(null);
  const [patientHealthHistory, setPatientHealthHistory] = useState(null);
  const [healthHistoryLoading, setHealthHistoryLoading] = useState(false);
  const [healthHistoryError, setHealthHistoryError] = useState('');

  // Appointment reschedule requests
  const [rescheduleRequests, setRescheduleRequests] = useState([]);
  const [rescheduleLoading, setRescheduleLoading] = useState(true);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleMessage, setRescheduleMessage] = useState('');
  const [rescheduleReviewingId, setRescheduleReviewingId] = useState(null);
  const [rescheduleResponses, setRescheduleResponses] = useState({});
  const [rescheduleFilter, setRescheduleFilter] = useState('Pending');
  const [rescheduleSearch, setRescheduleSearch] = useState('');
  const [expandedRescheduleId, setExpandedRescheduleId] = useState(null);

  // Follow-up appointments
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [followUpAppointment, setFollowUpAppointment] = useState(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpStartTime, setFollowUpStartTime] = useState('');
  const [followUpReason, setFollowUpReason] = useState('');
  const [followUpSlots, setFollowUpSlots] = useState([]);
  const [followUpSlotsLoading, setFollowUpSlotsLoading] = useState(false);
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);
  const [followUpError, setFollowUpError] = useState('');

  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.name ||
    user?.username ||
    'Doctor';

  const firstName =
    user?.first_name || user?.name || user?.username || 'Doctor';

  const loadAppointments = useCallback(async () => {
    try {
      setError('');
      const data = await getAppointments();
      const refreshedAppointments = getResponseList(data);

      setAppointments(refreshedAppointments);

      return refreshedAppointments;
    } catch (err) {
      setError(err.message || 'Unable to load appointments.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAvailability = useCallback(async () => {
    try {
      setAvailabilityError('');
      const data = await getDoctorAvailability();
      const normalized = normalizeSchedule(data);

      setSchedule(normalized);
      setRequestSchedule(normalized.map((day) => ({ ...day })));
      setAvailabilityLocked(Boolean(data?.is_locked));
    } catch (err) {
      setAvailabilityError(
        err.message || 'Unable to load your weekly availability.'
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }, []);

  const loadScheduleRequests = useCallback(async () => {
    try {
      setRequestError('');
      const data = await getDoctorScheduleChangeRequests();
      setScheduleRequests(getResponseList(data));
    } catch (err) {
      setRequestError(
        err.message || 'Unable to load schedule change requests.'
      );
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const loadLeaveRequests = useCallback(async () => {
    try {
      setLeaveError('');
      const data = await getDoctorLeaveRequests();
      setLeaveRequests(getResponseList(data));
    } catch (err) {
      setLeaveError(err.message || 'Unable to load leave requests.');
    } finally {
      setLeaveLoading(false);
    }
  }, []);

  const loadPrescriptions = useCallback(async () => {
    try {
      const data = await getPrescriptions();
      setPrescriptions(getResponseList(data));
    } catch (err) {
      setPrescriptionError(
        err.message || 'Unable to load your prescriptions.'
      );
    } finally {
      setPrescriptionsLoading(false);
    }
  }, []);

  const loadRescheduleRequests = useCallback(async () => {
    try {
      setRescheduleError('');
      const data = await getRescheduleRequests();
      setRescheduleRequests(getResponseList(data));
    } catch (err) {
      setRescheduleError(
        err.message || 'Unable to load appointment reschedule requests.'
      );
    } finally {
      setRescheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppointments().catch(() => {});
    loadAvailability();
    loadScheduleRequests();
    loadLeaveRequests();
    loadPrescriptions();
    loadRescheduleRequests();
  }, [
    loadAppointments,
    loadAvailability,
    loadScheduleRequests,
    loadLeaveRequests,
    loadPrescriptions,
    loadRescheduleRequests,
  ]);

  // Refresh appointment data when the doctor returns to this browser tab.
  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        loadAppointments().catch(() => {});
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [loadAppointments]);

  useEffect(() => {
    if (location.pathname !== '/doctor-dashboard') {
      return;
    }

    const targetByHash = {
      '#doctor-appointments': { id: 'doctor-appointments', label: 'Appointments' },
      '#doctor-reschedule-requests': { id: 'doctor-reschedule-requests', label: 'Reschedule Requests' },
      '#doctor-follow-ups': { id: 'doctor-follow-ups', label: 'Follow-ups' },
    };
    const target = targetByHash[location.hash];
    if (!target) return;

    setActiveNav(target.label);
    setSidebarOpen(false);

    const timeoutId = window.setTimeout(() => {
      document.getElementById(target.id)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [location.pathname, location.hash]);

  // Load real available slots for the selected follow-up date.
  useEffect(() => {
    if (!followUpModalOpen || !followUpDate || !followUpAppointment) {
      setFollowUpSlots([]);
      setFollowUpStartTime('');
      return undefined;
    }

    const providerId = getAppointmentProviderId(followUpAppointment);

    if (!providerId) {
      setFollowUpSlots([]);
      setFollowUpStartTime('');
      setFollowUpError(
        'The provider information for this appointment is unavailable.'
      );
      return undefined;
    }

    let active = true;

    const loadSlots = async () => {
      try {
        setFollowUpSlotsLoading(true);
        setFollowUpError('');
        setFollowUpSlots([]);
        setFollowUpStartTime('');

        const data = await getAvailableSlots(providerId, followUpDate);
        const slots = normalizeAvailableSlots(data);

        if (active) {
          setFollowUpSlots(slots);
          if (slots.length === 0) {
            setFollowUpError(
              'No available appointment slots were found for this date. Please choose another date.'
            );
          }
        }
      } catch (err) {
        if (active) {
          setFollowUpSlots([]);
          setFollowUpError(
            err.message || 'Unable to load available appointment slots.'
          );
        }
      } finally {
        if (active) setFollowUpSlotsLoading(false);
      }
    };

    loadSlots();

    return () => {
      active = false;
    };
  }, [followUpModalOpen, followUpDate, followUpAppointment]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (
        requestSubmitting ||
        leaveSubmitting ||
        prescriptionSubmitting ||
        followUpSubmitting
      ) return;

      setScheduleModalOpen(false);
      setLeaveModalOpen(false);
      setPrescriptionModalOpen(false);

      setFollowUpModalOpen(false);
      setFollowUpAppointment(null);
      setFollowUpDate('');
      setFollowUpStartTime('');
      setFollowUpReason('');
      setFollowUpSlots([]);
      setFollowUpError('');
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [
    requestSubmitting,
    leaveSubmitting,
    prescriptionSubmitting,
    followUpSubmitting,
  ]);

  const closeSidebar = () => setSidebarOpen(false);

  const handleOverviewClick = () => {
    setActiveNav('Overview');
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAppointmentsClick = () => {
    setActiveNav('Appointments');
    closeSidebar();
    document.getElementById('doctor-appointments')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleFollowUpsClick = () => {
    setActiveNav('Follow-ups');
    closeSidebar();
    document.getElementById('doctor-follow-ups')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleRescheduleRequestsClick = () => {
    setActiveNav('Reschedule Requests');
    closeSidebar();
    document.getElementById('doctor-reschedule-requests')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleAvailabilityClick = () => {
    setActiveNav('Availability');
    closeSidebar();
    document.getElementById('doctor-availability')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleLeaveClick = () => {
    setActiveNav('Leave Requests');
    closeSidebar();
    document.getElementById('doctor-leave-requests')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleRefresh = async () => {
    setLoading(true);
    setMessage('');
    setRescheduleLoading(true);

    await Promise.all([
      loadAppointments().catch(() => {}),
      loadRescheduleRequests(),
    ]);
  };

  const handleRescheduleReview = async (requestId, status) => {
    if (rescheduleReviewingId !== null) return;

    const response = String(rescheduleResponses[requestId] || '').trim();
    if (status === 'Rejected' && !response) {
      setRescheduleError('Please explain why this reschedule request is being rejected.');
      return;
    }

    try {
      setRescheduleReviewingId(requestId);
      setRescheduleError('');
      setRescheduleMessage('');

      await reviewRescheduleRequest(requestId, status, response);

      setRescheduleResponses((previous) => {
        const next = { ...previous };
        delete next[requestId];
        return next;
      });

      if (status === 'Approved') {
        setLoading(true);
      }
      setRescheduleLoading(true);

      await loadAppointments();
      await loadRescheduleRequests();

      setRescheduleMessage(
        status === 'Approved'
          ? 'The appointment has been moved to the requested date and time. The appointment list has been refreshed.'
          : 'The reschedule request was rejected. The original appointment remains unchanged.'
      );
    } catch (err) {
      setRescheduleError(
        err.message || `Unable to ${status.toLowerCase()} this reschedule request.`
      );
    } finally {
      setRescheduleReviewingId(null);
    }
  };

  const handleStatusUpdate = async (appointmentId, status) => {
    if (updatingId !== null) return;

    try {
      setUpdatingId(appointmentId);
      setError('');
      setMessage('');

      const updated = await updateAppointmentStatus(appointmentId, status);

      setAppointments((previous) =>
        previous.map((appointment) =>
          appointment.id === appointmentId
            ? { ...appointment, ...(updated || {}), status }
            : appointment
        )
      );

      setMessage(
        `Appointment successfully marked as ${status.toLowerCase()}.`
      );
    } catch (err) {
      setError(err.message || 'Unable to update appointment status.');
    } finally {
      setUpdatingId(null);
    }
  };

  // -----------------------------------------
  // PATIENT HEALTH HISTORY
  // -----------------------------------------

  const handleViewPatientHealthHistory = async (appointment) => {
    if (healthHistoryAppointmentId === appointment.id) {
      setHealthHistoryAppointmentId(null);
      setPatientHealthHistory(null);
      setHealthHistoryError('');
      return;
    }

    const patientId = getAppointmentPatientId(appointment);

    setHealthHistoryAppointmentId(appointment.id);
    setPatientHealthHistory(null);
    setHealthHistoryError('');

    if (!patientId) {
      setHealthHistoryError(
        'Patient account information is unavailable for this appointment.'
      );
      return;
    }

    try {
      setHealthHistoryLoading(true);

      const data = await getDoctorPatientHealthHistory(patientId);

      setPatientHealthHistory(data);
    } catch (err) {
      setHealthHistoryError(
        err.message || 'Unable to load this patient’s health history.'
      );
    } finally {
      setHealthHistoryLoading(false);
    }
  };

  // -----------------------------------------
  // DIGITAL PRESCRIPTIONS
  // -----------------------------------------

  const getAppointmentPrescriptions = (appointmentId) =>
    prescriptions
      .filter(
        (item) =>
          getPrescriptionAppointmentId(item) === Number(appointmentId)
      )
      .sort(
        (a, b) =>
          new Date(b.issued_at || 0).getTime() -
          new Date(a.issued_at || 0).getTime()
      );

  const openPrescriptionModal = (appointment) => {
    const existing = getAppointmentPrescriptions(appointment.id);
    const latestPrescription = existing[0] || null;

    setPrescriptionAppointment(appointment);
    setPrescriptionReplacesId(latestPrescription?.id || null);
    setDiagnosis('');
    setClinicalNotes('');
    setPrescriptionInstructions('');
    setMedicineItems([createEmptyMedicine()]);
    setPrescriptionError('');
    setPrescriptionModalOpen(true);
  };

  const updateMedicine = (index, field, value) => {
    setMedicineItems((previous) =>
      previous.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  };

  const addMedicine = () => {
    if (medicineItems.length >= 30) return;
    setMedicineItems((previous) => [...previous, createEmptyMedicine()]);
  };

  const removeMedicine = (index) => {
    setMedicineItems((previous) =>
      previous.length <= 1
        ? previous
        : previous.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const handlePrescriptionSubmit = async (event) => {
    event.preventDefault();
    if (prescriptionSubmitting || !prescriptionAppointment) return;

    setPrescriptionError('');

    if (!diagnosis.trim()) {
      setPrescriptionError('Please enter the diagnosis.');
      return;
    }

    if (!medicineItems.length) {
      setPrescriptionError('Please add at least one medicine.');
      return;
    }

    const incompleteMedicine = medicineItems.find(
      (item) =>
        !item.medicine_name.trim() ||
        !item.dosage.trim() ||
        !item.frequency.trim() ||
        !item.duration.trim()
    );

    if (incompleteMedicine) {
      setPrescriptionError(
        'For each medicine, enter its name, dosage, frequency, and duration.'
      );
      return;
    }

    try {
      setPrescriptionSubmitting(true);

      const payload = {
        appointment: prescriptionAppointment.id,
        diagnosis: diagnosis.trim(),
        clinical_notes: clinicalNotes.trim(),
        instructions: prescriptionInstructions.trim(),
        items: medicineItems.map((item, index) => ({
          medicine_name: item.medicine_name.trim(),
          strength: item.strength.trim(),
          dosage: item.dosage.trim(),
          route: item.route.trim(),
          frequency: item.frequency.trim(),
          duration: item.duration.trim(),
          quantity: item.quantity.trim(),
          instructions: item.instructions.trim(),
          sort_order: index,
        })),
      };

      if (prescriptionReplacesId) {
        payload.replaces = prescriptionReplacesId;
      }

      await createPrescription(payload);

      setPrescriptionMessage(
        prescriptionReplacesId
          ? 'Corrected prescription issued. The previous prescription remains in the record.'
          : 'Digital prescription issued successfully.'
      );

      setPrescriptionModalOpen(false);
      await loadPrescriptions();
    } catch (err) {
      setPrescriptionError(
        err.message || 'Unable to issue the prescription.'
      );
    } finally {
      setPrescriptionSubmitting(false);
    }
  };

  // -----------------------------------------
  // FOLLOW-UP APPOINTMENTS
  // -----------------------------------------

  const openFollowUpModal = (appointment) => {
    if (appointment.status !== 'Completed') return;

    setFollowUpAppointment(appointment);
    setFollowUpDate('');
    setFollowUpStartTime('');
    setFollowUpReason('');
    setFollowUpSlots([]);
    setFollowUpError('');
    setFollowUpModalOpen(true);
  };

  const closeFollowUpModal = () => {
    if (followUpSubmitting) return;

    setFollowUpModalOpen(false);
    setFollowUpAppointment(null);
    setFollowUpDate('');
    setFollowUpStartTime('');
    setFollowUpReason('');
    setFollowUpSlots([]);
    setFollowUpError('');
  };

  const handleFollowUpSubmit = async (event) => {
    event.preventDefault();

    if (
      followUpSubmitting ||
      !followUpAppointment ||
      !followUpDate ||
      !followUpStartTime
    ) {
      setFollowUpError('Please select a follow-up date and available time.');
      return;
    }

    try {
      setFollowUpSubmitting(true);
      setFollowUpError('');

      await createFollowUpAppointment({
        original_appointment: followUpAppointment.id,
        preferred_date: followUpDate,
        start_time: followUpStartTime,
        reason: followUpReason.trim(),
      });

      setMessage(
        'Follow-up appointment scheduled and confirmed. The patient has been notified.'
      );

      setFollowUpModalOpen(false);
      setFollowUpAppointment(null);
      setFollowUpDate('');
      setFollowUpStartTime('');
      setFollowUpReason('');
      setFollowUpSlots([]);

      setLoading(true);
      await loadAppointments();
    } catch (err) {
      setFollowUpError(
        err.message || 'Unable to schedule this follow-up appointment.'
      );
    } finally {
      setFollowUpSubmitting(false);
    }
  };

  const updateScheduleDay = (weekday, changes) => {
    if (availabilityLocked || availabilitySaving) return;

    setSchedule((previous) =>
      previous.map((day) =>
        day.weekday === weekday ? { ...day, ...changes } : day
      )
    );

    setAvailabilityMessage('');
    setAvailabilityError('');
  };

  const handleSaveAvailability = async () => {
    if (
      availabilitySaving ||
      availabilityLoading ||
      availabilityLocked
    ) return;

    const invalidDay = schedule.find(
      (day) =>
        day.is_available &&
        (
          !day.start_time ||
          !day.end_time ||
          day.start_time >= day.end_time
        )
    );

    if (invalidDay) {
      setAvailabilityError(
        `Please check the working hours for ${invalidDay.weekday_name}. Closing time must be later than opening time.`
      );
      return;
    }

    if (!schedule.some((day) => day.is_available)) {
      setAvailabilityError(
        'Please select at least one working day before saving.'
      );
      return;
    }

    try {
      setAvailabilitySaving(true);
      setAvailabilityError('');
      setAvailabilityMessage('');

      const payload = schedule.map((day) => ({
        weekday: day.weekday,
        is_available: day.is_available,
        start_time: day.is_available ? day.start_time : null,
        end_time: day.is_available ? day.end_time : null,
        slot_duration: Number(day.slot_duration),
      }));

      const result = await saveDoctorAvailability(payload);
      const normalized = normalizeSchedule(result);

      setSchedule(normalized);
      setRequestSchedule(normalized.map((day) => ({ ...day })));
      setAvailabilityLocked(Boolean(result?.is_locked));

      setAvailabilityMessage(
        'Your weekly availability has been saved. Future changes must be requested from the administrator.'
      );
    } catch (err) {
      setAvailabilityError(
        err.message || 'Unable to save your weekly availability.'
      );
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const openScheduleModal = () => {
    setRequestSchedule(schedule.map((day) => ({ ...day })));
    setRequestReason('');
    setRequestError('');
    setScheduleModalOpen(true);
  };

  const updateRequestScheduleDay = (weekday, changes) => {
    if (requestSubmitting) return;

    setRequestSchedule((previous) =>
      previous.map((day) =>
        day.weekday === weekday ? { ...day, ...changes } : day
      )
    );

    setRequestError('');
  };

  const handleScheduleChangeRequest = async (event) => {
    event.preventDefault();
    if (requestSubmitting) return;

    const invalidDay = requestSchedule.find(
      (day) =>
        day.is_available &&
        (
          !day.start_time ||
          !day.end_time ||
          day.start_time >= day.end_time
        )
    );

    if (invalidDay) {
      setRequestError(
        `Please check the working hours for ${invalidDay.weekday_name}. Closing time must be later than opening time.`
      );
      return;
    }

    if (!requestSchedule.some((day) => day.is_available)) {
      setRequestError(
        'Please select at least one working day in your requested schedule.'
      );
      return;
    }

    if (!requestReason.trim()) {
      setRequestError(
        'Please explain why you need this schedule change.'
      );
      return;
    }

    try {
      setRequestSubmitting(true);
      setRequestError('');

      const payload = requestSchedule.map((day) => ({
        weekday: day.weekday,
        is_available: day.is_available,
        start_time: day.is_available ? day.start_time : null,
        end_time: day.is_available ? day.end_time : null,
        slot_duration: Number(day.slot_duration),
      }));

      await createDoctorScheduleChangeRequest(
        payload,
        requestReason.trim()
      );

      await loadScheduleRequests();
      setScheduleModalOpen(false);
    } catch (err) {
      setRequestError(
        err.message || 'Unable to submit your schedule change request.'
      );
    } finally {
      setRequestSubmitting(false);
    }
  };

  const getSelectedLeaveDay = () => {
    if (!leaveDate) return null;

    const date = new Date(`${leaveDate}T12:00:00`);
    const weekday = (date.getDay() + 6) % 7;

    return schedule.find((day) => day.weekday === weekday) || null;
  };

  const selectedLeaveDay = getSelectedLeaveDay();

  const getRequestedLeaveHours = () => {
    if (!selectedLeaveDay?.is_available) return '';

    if (leaveType === 'Custom') {
      return leaveStartTime && leaveEndTime
        ? `${formatTime(leaveStartTime)} – ${formatTime(leaveEndTime)}`
        : 'Choose custom hours';
    }

    const start = selectedLeaveDay.start_time;
    const end = selectedLeaveDay.end_time;

    if (leaveType === 'Full day') {
      return `${formatTime(start)} – ${formatTime(end)}`;
    }

    const startMinutes =
      Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
    const endMinutes =
      Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));

    const midpoint = Math.floor((startMinutes + endMinutes) / 2);
    const mid = `${String(Math.floor(midpoint / 60)).padStart(2, '0')}:${String(
      midpoint % 60
    ).padStart(2, '0')}`;

    return leaveType === 'Morning'
      ? `${formatTime(start)} – ${formatTime(mid)}`
      : `${formatTime(mid)} – ${formatTime(end)}`;
  };

  const openLeaveModal = () => {
    setLeaveDate('');
    setLeaveType('Full day');
    setLeaveStartTime('');
    setLeaveEndTime('');
    setLeaveReason('');
    setLeaveError('');
    setLeaveModalOpen(true);
  };

  const handleLeaveSubmit = async (event) => {
    event.preventDefault();
    if (leaveSubmitting) return;

    setLeaveError('');

    if (!leaveDate) {
      setLeaveError('Please select a date for your leave.');
      return;
    }

    if (!selectedLeaveDay?.is_available) {
      setLeaveError(
        'You do not have working hours saved for the selected day.'
      );
      return;
    }

    if (leaveType === 'Custom') {
      if (
        !leaveStartTime ||
        !leaveEndTime ||
        leaveStartTime >= leaveEndTime
      ) {
        setLeaveError(
          'For custom leave, choose a valid start and end time.'
        );
        return;
      }

      if (
        leaveStartTime < selectedLeaveDay.start_time ||
        leaveEndTime > selectedLeaveDay.end_time
      ) {
        setLeaveError(
          'Custom leave hours must be within your scheduled working hours.'
        );
        return;
      }
    }

    if (!leaveReason.trim()) {
      setLeaveError('Please provide a reason for your leave request.');
      return;
    }

    try {
      setLeaveSubmitting(true);

      await createDoctorLeaveRequest({
        leave_date: leaveDate,
        leave_type: leaveType,
        start_time: leaveType === 'Custom' ? leaveStartTime : null,
        end_time: leaveType === 'Custom' ? leaveEndTime : null,
        reason: leaveReason.trim(),
      });

      await loadLeaveRequests();
      setLeaveModalOpen(false);
    } catch (err) {
      setLeaveError(
        err.message || 'Unable to submit your leave request.'
      );
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const pendingCount = appointments.filter(
    (item) => item.status === 'Pending'
  ).length;

  const confirmedCount = appointments.filter(
    (item) => item.status === 'Confirmed'
  ).length;

  const completedCount = appointments.filter(
    (item) => item.status === 'Completed'
  ).length;

  const filteredAppointments =
    filter === 'All'
      ? appointments
      : appointments.filter((item) => item.status === filter);

  const availableDays = schedule.filter((day) => day.is_available).length;

  const pendingScheduleRequests = scheduleRequests.filter(
    (item) => item.status === 'Pending'
  ).length;

  const pendingLeaveRequests = leaveRequests.filter(
    (item) => item.status === 'Pending'
  ).length;

  const pendingRescheduleRequests = rescheduleRequests.filter(
    (item) => String(item.status || '').toLowerCase() === 'pending'
  ).length;

  const approvedRescheduleRequests = rescheduleRequests.filter(
    (item) => String(item.status || '').toLowerCase() === 'approved'
  ).length;

  const rejectedRescheduleRequests = rescheduleRequests.filter(
    (item) => String(item.status || '').toLowerCase() === 'rejected'
  ).length;

  const completedAppointments = appointments.filter(
    (item) => item.status === 'Completed'
  );

  const followUpEligibleAppointments = completedAppointments.map((appointment) => {
    const existingFollowUp = appointments.find(
      (candidate) =>
        getFollowUpOriginalId(candidate) === Number(appointment.id)
    );

    return {
      appointment,
      existingFollowUp: existingFollowUp || null,
    };
  });

  const followUpsNeedingScheduling = followUpEligibleAppointments.filter(
    (item) => !item.existingFollowUp
  ).length;

  const visibleRescheduleRequests = [...rescheduleRequests]
    .filter((item) => {
      const status = String(item.status || 'Pending').toLowerCase();
      const matchesFilter = rescheduleFilter === 'All' || status === rescheduleFilter.toLowerCase();
      const patient = item.patient_name || item.patient_full_name || item.patient_details?.full_name || '';
      const searchText = `${item.id || ''} ${patient} ${item.reason || ''}`.toLowerCase();
      return matchesFilter && searchText.includes(rescheduleSearch.trim().toLowerCase());
    })
    .sort((a, b) => {
      const aPending = String(a.status || '').toLowerCase() === 'pending';
      const bPending = String(b.status || '').toLowerCase() === 'pending';
      if (aPending !== bPending) return aPending ? -1 : 1;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

  const getStatusClass = (status) => {
    if (status === 'Confirmed' || status === 'Completed') {
      return 'dashboard-status success';
    }
    if (status === 'Cancelled') {
      return 'dashboard-status danger';
    }
    return 'dashboard-status pending';
  };

  return (
<div className="doctor-dashboard">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <button
          type="button"
          className="dashboard-sidebar-overlay"
          aria-label="Close navigation"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`doctor-sidebar ${sidebarOpen ? 'open' : ''}`}
      >
        <button
          type="button"
          className="doctor-sidebar-close"
          onClick={closeSidebar}
          aria-label="Close sidebar"
        >
          <X size={20} />
        </button>

        <div className="doctor-sidebar-profile">
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
          <div className="doctor-profile-info">
            <strong>Dr. {fullName.replace(/^Dr\.\s*/i, '')}</strong>
            <span>Medical Professional</span>
          </div>
          <span className="doctor-online-indicator" />
        </div>

        <nav className="doctor-sidebar-nav">
          <span className="doctor-nav-heading">WORKSPACE</span>

          <button
            type="button"
            className={`doctor-nav-link ${
              activeNav === 'Overview' ? 'active' : ''
            }`}
            onClick={handleOverviewClick}
          >
            <LayoutDashboard size={19} />
            <span>Overview</span>
          </button>

          <button
            type="button"
            className={`doctor-nav-link ${
              activeNav === 'Appointments' ? 'active' : ''
            }`}
            onClick={handleAppointmentsClick}
          >
            <CalendarDays size={19} />
            <span>Appointments</span>
            {pendingCount > 0 && (
              <span className="doctor-nav-count">{pendingCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`doctor-nav-link ${
              activeNav === 'Reschedule Requests' ? 'active' : ''
            }`}
            onClick={handleRescheduleRequestsClick}
          >
            <CalendarClock size={19} />
            <span>Reschedule Requests</span>
            {pendingRescheduleRequests > 0 && (
              <span className="doctor-nav-count">
                {pendingRescheduleRequests}
              </span>
            )}
          </button>

          <span className="doctor-nav-heading">SCHEDULE</span>

          <button
            type="button"
            className={`doctor-nav-link ${
              activeNav === 'Availability' ? 'active' : ''
            }`}
            onClick={handleAvailabilityClick}
          >
            <Clock3 size={19} />
            <span>Availability</span>
          </button>

          <button
            type="button"
            className={`doctor-nav-link ${
              activeNav === 'Leave Requests' ? 'active' : ''
            }`}
            onClick={handleLeaveClick}
          >
            <CalendarCheck size={19} />
            <span>Leave Requests</span>
            {pendingLeaveRequests > 0 && (
              <span className="doctor-nav-count">
                {pendingLeaveRequests}
              </span>
            )}
          </button>
        </nav>

        <div className="doctor-sidebar-bottom">
          <div className="doctor-sidebar-help">
            <div className="doctor-help-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <strong>Secure workspace</strong>
              <span>Your patient data is protected.</span>
            </div>
          </div>

          <Link
            to="/"
            className="doctor-nav-link doctor-home-link"
            onClick={closeSidebar}
          >
            <Home size={19} />
            <span>Back to Home</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="doctor-main">
        {/* Top navigation */}
        <header className="doctor-topbar">
          <div className="doctor-topbar-left">
            <button
              type="button"
              className="doctor-menu-toggle"
              onClick={() => setSidebarOpen((previous) => !previous)}
              aria-label="Toggle navigation"
            >
              <Menu size={22} />
            </button>

            <div>
              <div className="doctor-breadcrumb">
               Workspace<span>/</span>Overview
              </div>
              <h1>My Dashboard</h1>
            </div>
          </div>

          <div className="doctor-topbar-right">
            <button
              type="button"
              className="doctor-refresh-button"
              onClick={handleRefresh}
              disabled={loading || rescheduleLoading}
              title="Refresh dashboard"
            >
              <RefreshCw
                size={17}
                className={
                  loading || rescheduleLoading ? 'spinning' : ''
                }
              />
              <span>Refresh</span>
            </button>

          </div>
        </header>

        <div className="doctor-content">
          {/* Global messages */}
          {message && (
            <div className="doctor-alert doctor-alert-success">
              <CheckCircle2 size={19} />
              <span>{message}</span>
              <button
                type="button"
                onClick={() => setMessage('')}
                aria-label="Dismiss message"
              >
                <X size={17} />
              </button>
            </div>
          )}

          {error && (
            <div className="doctor-alert doctor-alert-error">
              <AlertCircle size={19} />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                aria-label="Dismiss error"
              >
                <X size={17} />
              </button>
            </div>
          )}

          {/* Welcome section */}
          <section className="doctor-welcome-section">
            <div>
              <span className="doctor-welcome-eyebrow">
                DOCTOR WORKSPACE
              </span>
              <h2>Welcome back, Dr. {firstName}!</h2>
              <p>
                Here is an overview of your appointments and practice
                activity.
              </p>
            </div>

            <div className="doctor-welcome-date">
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

          {/* Overview statistics */}
          <section className="doctor-stats-grid">
            <article className="doctor-stat-card">
              <div className="doctor-stat-top">
                <span className="doctor-stat-icon purple">
                  <ClipboardList size={22} />
                </span>
                <span className="doctor-stat-label">Total Appointments</span>
              </div>
              <strong className="doctor-stat-number">
                {loading ? '—' : appointments.length}
              </strong>
              <span className="doctor-stat-description">
                All appointment records
              </span>
            </article>

            <article className="doctor-stat-card">
              <div className="doctor-stat-top">
                <span className="doctor-stat-icon orange">
                  <Clock3 size={22} />
                </span>
                <span className="doctor-stat-label">Pending</span>
              </div>
              <strong className="doctor-stat-number">
                {loading ? '—' : pendingCount}
              </strong>
              <span className="doctor-stat-description">
                Awaiting your response
              </span>
            </article>

            <article className="doctor-stat-card">
              <div className="doctor-stat-top">
                <span className="doctor-stat-icon blue">
                  <CalendarCheck size={22} />
                </span>
                <span className="doctor-stat-label">Confirmed</span>
              </div>
              <strong className="doctor-stat-number">
                {loading ? '—' : confirmedCount}
              </strong>
              <span className="doctor-stat-description">
                Scheduled consultations
              </span>
            </article>

            <article className="doctor-stat-card">
              <div className="doctor-stat-top">
                <span className="doctor-stat-icon green">
                  <CheckCircle2 size={22} />
                </span>
                <span className="doctor-stat-label">Completed</span>
              </div>
              <strong className="doctor-stat-number">
                {loading ? '—' : completedCount}
              </strong>
              <span className="doctor-stat-description">
                Successfully completed
              </span>
            </article>
          </section>

          {/* Additional overview information */}
          <section className="doctor-overview-grid">
            <article className="doctor-overview-card">
              <div className="doctor-overview-icon">
                <CalendarClock size={21} />
              </div>
              <div>
                <span>Pending reschedule requests</span>
                <strong>{pendingRescheduleRequests}</strong>
              </div>
              <button
                type="button"
                onClick={handleRescheduleRequestsClick}
                aria-label="View reschedule requests"
              >
                <ChevronDown size={18} />
              </button>
            </article>

            <article className="doctor-overview-card">
              <div className="doctor-overview-icon">
                <Clock3 size={21} />
              </div>
              <div>
                <span>Available working days</span>
                <strong>{availabilityLoading ? '—' : availableDays}/7</strong>
              </div>
              <button
                type="button"
                onClick={handleAvailabilityClick}
                aria-label="View availability"
              >
                <ChevronDown size={18} />
              </button>
            </article>

            <article className="doctor-overview-card">
              <div className="doctor-overview-icon">
                <RefreshCw size={21} />
              </div>
              <div>
                <span>Follow-ups to schedule</span>
                <strong>{followUpsNeedingScheduling}</strong>
              </div>
              <button
                type="button"
                onClick={handleFollowUpsClick}
                aria-label="View follow-ups"
              >
                <ChevronDown size={18} />
              </button>
            </article>
          </section>

          {/* Appointments */}
          <section
            className="doctor-section"
            id="doctor-appointments"
          >
            <div className="doctor-section-header">
              <div>
                <span className="doctor-section-eyebrow">PATIENT CARE</span>
                <h2>Appointments</h2>
                <p>Review and manage your patient appointments.</p>
              </div>

              <button
                type="button"
                className="doctor-secondary-button"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw
                  size={16}
                  className={loading ? 'spinning' : ''}
                />
                Refresh
              </button>
            </div>

            <div className="doctor-filter-bar">
              <div className="doctor-filter-tabs">
                {['All', 'Pending', 'Confirmed', 'Completed', 'Cancelled'].map(
                  (status) => (
                    <button
                      type="button"
                      key={status}
                      className={filter === status ? 'active' : ''}
                      onClick={() => setFilter(status)}
                    >
                      {status}
                      {status === 'Pending' && pendingCount > 0 && (
                        <span className="doctor-filter-count">
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  )
                )}
              </div>

              <span className="doctor-result-count">
                {filteredAppointments.length} appointment
                {filteredAppointments.length !== 1 ? 's' : ''}
              </span>
            </div>

            {loading ? (
              <div className="doctor-loading-state">
                <div className="doctor-spinner" />
                <p>Loading appointments...</p>
              </div>
            ) : filteredAppointments.length === 0 ? (
              <div className="doctor-empty-state">
                <div className="doctor-empty-icon">
                  <CalendarDays size={30} />
                </div>
                <h3>No appointments found</h3>
                <p>
                  {filter === 'All'
                    ? 'You do not have any appointments yet.'
                    : `There are no ${filter.toLowerCase()} appointments.`}
                </p>
              </div>
            ) : (
              <div className="doctor-appointments-list">
                {filteredAppointments.map((appointment) => {
                  const appointmentPrescriptions =
                    getAppointmentPrescriptions(appointment.id);

                  const videoJoinState =
                    getVideoJoinState(appointment);

                  const patientName =
                    appointment.patient_name ||
                    appointment.patient_full_name ||
                    appointment.patient_details?.full_name ||
                    appointment.patient_details?.name ||
                    (typeof appointment.patient === 'object'
                      ? [
                          appointment.patient?.first_name,
                          appointment.patient?.last_name,
                        ]
                          .filter(Boolean)
                          .join(' ')
                      : '') ||
                    'Patient';

                  const consultationType =
                    appointment.consultation_type || 'Consultation';

                  const appointmentDate =
                    appointment.preferred_date
                      ? new Date(
                          `${appointment.preferred_date}T12:00:00`
                        ).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Date not specified';

                  const appointmentTime = appointment.start_time
                    ? `${formatTime(appointment.start_time)}${
                        appointment.end_time
                          ? ` – ${formatTime(appointment.end_time)}`
                          : ''
                      }`
                    : 'Time not specified';

                  const isVideo =
                    consultationType.toLowerCase() ===
                    'video consultation';

                  return (
                    <article
                      className="doctor-appointment-card"
                      key={appointment.id}
                    >
                      <div className="doctor-appointment-main">
                        <div className="doctor-patient-avatar">
                          {getPatientProfilePhoto(appointment) ? (
                            <img src={getPatientProfilePhoto(appointment)} alt={`${patientName} profile`} />
                          ) : (
                            <UserRound size={23} />
                          )}
                        </div>

                        <div className="doctor-appointment-info">
                          <div className="doctor-appointment-title">
                            <h3>{patientName}</h3>
                            <span
                              className={getStatusClass(appointment.status)}
                            >
                              {appointment.status || 'Pending'}
                            </span>
                          </div>

                          <div className="doctor-appointment-meta">
                            <span>
                              <CalendarDays size={15} />
                              {appointmentDate}
                            </span>
                            <span>
                              <Clock3 size={15} />
                              {appointmentTime}
                            </span>
                            <span>
                              {isVideo ? (
                                <Video size={15} />
                              ) : (
                                <Stethoscope size={15} />
                              )}
                              {consultationType}
                            </span>
                          </div>

                          {appointment.reason && (
                            <div className="doctor-appointment-reason">
                              <strong>Consultation reason:</strong>
                              <p>{appointment.reason}</p>
                            </div>
                          )}

                          {appointmentPrescriptions.length > 0 && (
                            <div className="doctor-prescription-indicator">
                              <FileText size={15} />
                              {appointmentPrescriptions.length} prescription
                              {appointmentPrescriptions.length !== 1
                                ? 's'
                                : ''}{' '}
                              issued
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="doctor-appointment-actions">
                        {appointment.status === 'Pending' && (
                          <>
                            <button
                              type="button"
                              className="doctor-action-button approve"
                              disabled={updatingId !== null}
                              onClick={() =>
                                handleStatusUpdate(
                                  appointment.id,
                                  'Confirmed'
                                )
                              }
                            >
                              {updatingId === appointment.id ? (
                                <span className="doctor-button-spinner" />
                              ) : (
                                <CheckCircle2 size={16} />
                              )}
                              Confirm
                            </button>

                            <button
                              type="button"
                              className="doctor-action-button reject"
                              disabled={updatingId !== null}
                              onClick={() =>
                                handleStatusUpdate(
                                  appointment.id,
                                  'Cancelled'
                                )
                              }
                            >
                              <XCircle size={16} />
                              Decline
                            </button>
                          </>
                        )}

                        {appointment.status === 'Confirmed' && (
                          <>
                            {isVideo && (
                              <button
                                type="button"
                                className="doctor-action-button video"
                                disabled={videoJoinState !== 'available'}
                                title={
                                  videoJoinState === 'upcoming'
                                    ? 'The consultation room opens 15 minutes before the appointment.'
                                    : videoJoinState === 'expired'
                                      ? 'The consultation joining period has expired.'
                                      : 'Video consultation is unavailable.'
                                }
                                onClick={() => {
                                  const roomUrl =
                                    appointment.video_room_url ||
                                    appointment.meeting_url ||
                                    appointment.video_call_url;

                                  if (roomUrl) {
                                    window.open(
                                      roomUrl,
                                      '_blank',
                                      'noopener,noreferrer'
                                    );
                                  }
                                }}
                              >
                                <Video size={16} />
                                {videoJoinState === 'available'
                                  ? 'Join consultation'
                                  : videoJoinState === 'upcoming'
                                    ? 'Not started'
                                    : 'Unavailable'}
                              </button>
                            )}

                            <button
                              type="button"
                              className="doctor-action-button complete"
                              disabled={updatingId !== null}
                              onClick={() =>
                                handleStatusUpdate(
                                  appointment.id,
                                  'Completed'
                                )
                              }
                            >
                              <CheckCircle2 size={16} />
                              Complete
                            </button>

                            <button
                              type="button"
                              className="doctor-action-button reject"
                              disabled={updatingId !== null}
                              onClick={() =>
                                handleStatusUpdate(
                                  appointment.id,
                                  'Cancelled'
                                )
                              }
                            >
                              <XCircle size={16} />
                              Cancel
                            </button>
                          </>
                        )}

                        {(appointment.status === 'Confirmed' ||
                          appointment.status === 'Completed') && (
                          <button
                            type="button"
                            className="doctor-action-button history"
                            onClick={() =>
                              handleViewPatientHealthHistory(appointment)
                            }
                          >
                            <Clipboard size={16} />
                            Health history
                          </button>
                        )}

                        {appointment.status === 'Completed' && (
                          <>
                            <button
                              type="button"
                              className="doctor-action-button prescription"
                              onClick={() =>
                                openPrescriptionModal(appointment)
                              }
                            >
                              <Pill size={16} />
                              {appointmentPrescriptions.length > 0
                                ? 'New prescription'
                                : 'Prescribe'}
                            </button>

                            <button
                              type="button"
                              className="doctor-action-button follow-up"
                              onClick={() => openFollowUpModal(appointment)}
                            >
                              <CalendarClock size={16} />
                              Schedule follow-up
                            </button>
                          </>
                        )}
                      </div>

                      {/* Patient health history panel */}
                      {healthHistoryAppointmentId === appointment.id && (
                        <div className="doctor-health-history">
                          <div className="doctor-health-history-header">
                            <div>
                              <h4>
                                <HeartPulse size={18} />
                                Patient Health History
                              </h4>
                              <p>
                                Authorized medical information for{' '}
                                {patientName}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setHealthHistoryAppointmentId(null);
                                setPatientHealthHistory(null);
                                setHealthHistoryError('');
                              }}
                              aria-label="Close health history"
                            >
                              <X size={19} />
                            </button>
                          </div>

                          {healthHistoryLoading ? (
                            <div className="doctor-inline-loading">
                              <div className="doctor-spinner" />
                              Loading patient health history...
                            </div>
                          ) : healthHistoryError ? (
                            <div className="doctor-inline-error">
                              <AlertCircle size={17} />
                              {healthHistoryError}
                            </div>
                          ) : patientHealthHistory ? (
                            <div className="doctor-health-history-grid">
                              {HEALTH_HISTORY_FIELDS.map((field) => {
                                const value =
                                  patientHealthHistory[field.key];

                                return (
                                  <div
                                    className="doctor-health-history-item"
                                    key={field.key}
                                  >
                                    <strong>{field.label}</strong>
                                    <p>
                                      {Array.isArray(value)
                                        ? value.length
                                          ? value.join(', ')
                                          : 'Not provided'
                                        : value || 'Not provided'}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="doctor-empty-inline">
                              No health history information is available.
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Reschedule requests */}
          <section
            className="doctor-section"
            id="doctor-reschedule-requests"
          >
            <div className="doctor-section-header">
              <div>
                <span className="doctor-section-eyebrow">
                  APPOINTMENT MANAGEMENT
                </span>
                <h2>Reschedule Requests</h2>
                <p>
                  Review patient requests to change their appointment date
                  or time.
                </p>
              </div>

              <div className="doctor-section-badge">
                <CalendarClock size={16} />
                {pendingRescheduleRequests} pending
              </div>
            </div>

            {rescheduleMessage && (
              <div className="doctor-alert doctor-alert-success">
                <CheckCircle2 size={18} />
                <span>{rescheduleMessage}</span>
                <button
                  type="button"
                  onClick={() => setRescheduleMessage('')}
                  aria-label="Dismiss message"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            {rescheduleError && (
              <div className="doctor-alert doctor-alert-error">
                <AlertCircle size={18} />
                <span>{rescheduleError}</span>
                <button
                  type="button"
                  onClick={() => setRescheduleError('')}
                  aria-label="Dismiss error"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            <div className="doctor-reschedule-summary">
              <div>
                <span>Pending</span>
                <strong>{pendingRescheduleRequests}</strong>
              </div>
              <div>
                <span>Approved</span>
                <strong>{approvedRescheduleRequests}</strong>
              </div>
              <div>
                <span>Rejected</span>
                <strong>{rejectedRescheduleRequests}</strong>
              </div>
            </div>

            <div className="doctor-request-toolbar">
              <div className="doctor-filter-tabs">
                {['Pending', 'Approved', 'Rejected', 'All'].map((status) => (
                  <button
                    type="button"
                    key={status}
                    className={rescheduleFilter === status ? 'active' : ''}
                    onClick={() => setRescheduleFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <input
                type="search"
                className="doctor-search-input"
                placeholder="Search patient or request..."
                value={rescheduleSearch}
                onChange={(event) =>
                  setRescheduleSearch(event.target.value)
                }
              />
            </div>

            {rescheduleLoading ? (
              <div className="doctor-loading-state">
                <div className="doctor-spinner" />
                <p>Loading reschedule requests...</p>
              </div>
            ) : visibleRescheduleRequests.length === 0 ? (
              <div className="doctor-empty-state">
                <div className="doctor-empty-icon">
                  <CalendarClock size={30} />
                </div>
                <h3>No reschedule requests found</h3>
                <p>
                  There are no requests matching your selected filter.
                </p>
              </div>
            ) : (
              <div className="doctor-request-list">
                {visibleRescheduleRequests.map((request) => {
                  const patientName =
                    request.patient_name ||
                    request.patient_full_name ||
                    request.patient_details?.full_name ||
                    'Patient';

                  const originalAppointment =
  request.original_appointment_details ||
  request.appointment_details ||
  request.appointment_snapshot ||
  request.appointment_data ||
  {};

const originalDate =
  request.appointment_date ||
  request.original_date ||
  request.current_date ||
  originalAppointment.preferred_date ||
  originalAppointment.date;

const originalStart =
  request.appointment_start_time ||
  request.original_start_time ||
  request.current_start_time ||
  originalAppointment.start_time;

const originalEnd =
  request.appointment_end_time ||
  originalAppointment.end_time;

const requestedDate =
  request.requested_date ||
  request.new_date ||
  request.preferred_date;

const requestedStart =
  request.requested_start_time ||
  request.new_start_time ||
  request.start_time;

const requestedEnd = request.requested_end_time;

                  const requestStatus = String(
                    request.status || 'Pending'
                  );

                  const isPending =
                    requestStatus.toLowerCase() === 'pending';

                  const expanded =
                    expandedRescheduleId === request.id;

                  return (
                    <article
                      className="doctor-request-card"
                      key={request.id}
                    >
                      <div className="doctor-request-card-header">
                        <div className="doctor-request-patient">
                          <div className="doctor-patient-avatar small">
                            {getPatientProfilePhoto(request) || getPatientProfilePhoto(originalAppointment) ? (
                              <img src={getPatientProfilePhoto(request) || getPatientProfilePhoto(originalAppointment)} alt={`${patientName} profile`} />
                            ) : (
                              <UserRound size={19} />
                            )}
                          </div>
                          <div>
                            <strong>{patientName}</strong>
                            <span>
                              Request #{request.id} ·{' '}
                              {formatDateTime(request.created_at)}
                            </span>
                          </div>
                        </div>

                        <span
                          className={getStatusClass(requestStatus)}
                        >
                          {requestStatus}
                        </span>
                      </div>

                      <div className="doctor-reschedule-comparison">
                        <div className="doctor-reschedule-date old">
                          <span>Original appointment</span>
                          <strong>
                            {originalDate
                              ? new Date(
                                  `${originalDate}T12:00:00`
                                ).toLocaleDateString()
                              : 'Not available'}
                          </strong>
                          <span>
                            {originalStart
  ? `${formatTime(originalStart)}${
      originalEnd ? ` – ${formatTime(originalEnd)}` : ''
    }`
  : 'Time not available'}
                          </span>
                        </div>

                        <div className="doctor-reschedule-arrow">
                          <span>→</span>
                        </div>

                        <div className="doctor-reschedule-date new">
                          <span>Requested appointment</span>
                          <strong>
                            {requestedDate
                              ? new Date(
                                  `${requestedDate}T12:00:00`
                                ).toLocaleDateString()
                              : 'Not available'}
                          </strong>
                          <span>
                            {requestedStart
  ? `${formatTime(requestedStart)}${
      requestedEnd ? ` – ${formatTime(requestedEnd)}` : ''
    }`
  : 'Time not available'}
                          </span>
                        </div>
                      </div>

                      {request.reason && (
                        <div className="doctor-request-reason">
                          <strong>Patient's reason</strong>
                          <p>{request.reason}</p>
                        </div>
                      )}

                      {request.doctor_response && (
                        <div className="doctor-request-response">
                          <strong>Doctor's response</strong>
                          <p>{request.doctor_response}</p>
                        </div>
                      )}

                      {isPending && (
                        <div className="doctor-reschedule-review">
                          <button
                            type="button"
                            className="doctor-expand-button"
                            onClick={() =>
                              setExpandedRescheduleId(
                                expanded ? null : request.id
                              )
                            }
                          >
                            {expanded
                              ? 'Hide response field'
                              : 'Add response'}
                            <ChevronDown
                              size={16}
                              className={expanded ? 'rotated' : ''}
                            />
                          </button>

                          {expanded && (
                            <textarea
                              className="doctor-textarea"
                              rows={3}
                              placeholder="Optional response to the patient. A rejection requires an explanation."
                              value={
                                rescheduleResponses[request.id] || ''
                              }
                              onChange={(event) =>
                                setRescheduleResponses((previous) => ({
                                  ...previous,
                                  [request.id]: event.target.value,
                                }))
                              }
                            />
                          )}

                          <div className="doctor-request-actions">
                            <button
                              type="button"
                              className="doctor-action-button approve"
                              disabled={rescheduleReviewingId !== null}
                              onClick={() =>
                                handleRescheduleReview(
                                  request.id,
                                  'Approved'
                                )
                              }
                            >
                              {rescheduleReviewingId === request.id ? (
                                <span className="doctor-button-spinner" />
                              ) : (
                                <CheckCircle2 size={16} />
                              )}
                              Approve request
                            </button>

                            <button
                              type="button"
                              className="doctor-action-button reject"
                              disabled={rescheduleReviewingId !== null}
                              onClick={() =>
                                handleRescheduleReview(
                                  request.id,
                                  'Rejected'
                                )
                              }
                            >
                              <XCircle size={16} />
                              Reject request
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

          {/* Follow-up appointments */}
          <section
            className="doctor-section"
            id="doctor-follow-ups"
          >
            <div className="doctor-section-header">
              <div>
                <span className="doctor-section-eyebrow">
                  CONTINUITY OF CARE
                </span>
                <h2>Follow-up Appointments</h2>
                <p>
                  Schedule follow-up consultations for patients whose
                  appointments are completed.
                </p>
              </div>

              <div className="doctor-follow-up-header-actions">
                <div className="doctor-section-badge">
                  <RefreshCw size={16} />
                  {followUpsNeedingScheduling} need scheduling
                </div>
                <button
                  type="button"
                  className="doctor-collapse-button"
                  onClick={() => setFollowUpsExpanded((expanded) => !expanded)}
                  aria-expanded={followUpsExpanded}
                  aria-controls="doctor-follow-ups-content"
                >
                  {followUpsExpanded ? 'Collapse' : 'Expand'}
                  <ChevronDown size={17} className={followUpsExpanded ? 'rotated' : ''} />
                </button>
              </div>
            </div>

            {followUpsExpanded && <div id="doctor-follow-ups-content">
            {loading ? (
              <div className="doctor-loading-state">
                <div className="doctor-spinner" />
                <p>Loading completed appointments...</p>
              </div>
            ) : followUpEligibleAppointments.length === 0 ? (
              <div className="doctor-empty-state">
                <div className="doctor-empty-icon">
                  <RefreshCw size={30} />
                </div>
                <h3>No completed appointments</h3>
                <p>
                  Completed appointments will appear here when they are
                  available for follow-up scheduling.
                </p>
              </div>
            ) : (
              <div className="doctor-follow-up-list">
                {followUpEligibleAppointments.map(
                  ({ appointment, existingFollowUp }) => {
                    const patientName =
                      appointment.patient_name ||
                      appointment.patient_full_name ||
                      appointment.patient_details?.full_name ||
                      'Patient';

                    return (
                      <article
                        className="doctor-follow-up-card"
                        key={appointment.id}
                      >
                        <div className="doctor-follow-up-patient">
                          <div className="doctor-patient-avatar">
                            {getPatientProfilePhoto(appointment) ? (
                              <img src={getPatientProfilePhoto(appointment)} alt={`${patientName} profile`} />
                            ) : (
                              <UserRound size={22} />
                            )}
                          </div>
                          <div>
                            <strong>{patientName}</strong>
                            <span>
                              Original appointment #{appointment.id}
                            </span>
                            <span>
                              Completed on{' '}
                              {appointment.preferred_date
                                ? new Date(
                                    `${appointment.preferred_date}T12:00:00`
                                  ).toLocaleDateString()
                                : 'Date not available'}
                            </span>
                          </div>
                        </div>

                        {existingFollowUp ? (
                          <div className="doctor-follow-up-existing">
                            <span className="doctor-status-dot success" />
                            <div>
                              <strong>Follow-up scheduled</strong>
                              <span>
                                {existingFollowUp.preferred_date
                                  ? new Date(
                                      `${existingFollowUp.preferred_date}T12:00:00`
                                    ).toLocaleDateString()
                                  : 'Date not available'}
                                {existingFollowUp.start_time
                                  ? ` · ${formatTime(
                                      existingFollowUp.start_time
                                    )}`
                                  : ''}
                              </span>
                              <span>
                                Status: {existingFollowUp.status || 'Pending'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="doctor-follow-up-actions">
                            <span className="doctor-status-dot pending" />
                            <span>Follow-up not scheduled</span>
                            <button
                              type="button"
                              className="doctor-primary-button"
                              onClick={() =>
                                openFollowUpModal(appointment)
                              }
                            >
                              <Plus size={16} />
                              Schedule follow-up
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  }
                )}
              </div>
            )}
            </div>}
          </section>

          {/* Weekly availability */}
          <section
            className="doctor-section"
            id="doctor-availability"
          >
            <div className="doctor-section-header">
              <div>
                <span className="doctor-section-eyebrow">
                  WORKING HOURS
                </span>
                <h2>Weekly Availability</h2>
                <p>
                  Manage the days and hours when patients can book
                  appointments.
                </p>
              </div>

              {availabilityLocked && (
                <span className="doctor-lock-badge">
                  <ShieldCheck size={16} />
                  Schedule locked
                </span>
              )}
            </div>

            {availabilityError && (
              <div className="doctor-alert doctor-alert-error">
                <AlertCircle size={18} />
                <span>{availabilityError}</span>
              </div>
            )}

            {availabilityMessage && (
              <div className="doctor-alert doctor-alert-success">
                <CheckCircle2 size={18} />
                <span>{availabilityMessage}</span>
              </div>
            )}

            <div className="doctor-availability-card">
              {availabilityLoading ? (
                <div className="doctor-loading-state">
                  <div className="doctor-spinner" />
                  <p>Loading your availability...</p>
                </div>
              ) : (
                <>
                  <div className="doctor-availability-heading">
                    <div>
                      <h3>Your weekly schedule</h3>
                      <p>
                        Select working days and set your consultation
                        hours.
                      </p>
                    </div>

                    <span className="doctor-availability-count">
                      {availableDays} of 7 days available
                    </span>
                  </div>

                  <div className="doctor-schedule-list">
                    {schedule.map((day) => (
                      <div
                        className={`doctor-schedule-row ${
                          day.is_available ? 'enabled' : ''
                        }`}
                        key={day.weekday}
                      >
                        <div className="doctor-schedule-day">
                          <label className="doctor-toggle">
                            <input
                              type="checkbox"
                              checked={day.is_available}
                              disabled={
                                availabilityLocked || availabilitySaving
                              }
                              onChange={(event) =>
                                updateScheduleDay(day.weekday, {
                                  is_available: event.target.checked,
                                })
                              }
                            />
                            <span className="doctor-toggle-slider" />
                          </label>

                          <strong>{day.weekday_name}</strong>
                        </div>

                        {day.is_available ? (
                          <div className="doctor-schedule-fields">
                            <label>
                              <span>Start</span>
                              <input
                                type="time"
                                value={day.start_time}
                                disabled={
                                  availabilityLocked ||
                                  availabilitySaving
                                }
                                onChange={(event) =>
                                  updateScheduleDay(day.weekday, {
                                    start_time: event.target.value,
                                  })
                                }
                              />
                            </label>

                            <span className="doctor-time-separator">
                              to
                            </span>

                            <label>
                              <span>End</span>
                              <input
                                type="time"
                                value={day.end_time}
                                disabled={
                                  availabilityLocked ||
                                  availabilitySaving
                                }
                                onChange={(event) =>
                                  updateScheduleDay(day.weekday, {
                                    end_time: event.target.value,
                                  })
                                }
                              />
                            </label>

                            <label>
                              <span>Slot duration</span>
                              <select
                                value={day.slot_duration}
                                disabled={
                                  availabilityLocked ||
                                  availabilitySaving
                                }
                                onChange={(event) =>
                                  updateScheduleDay(day.weekday, {
                                    slot_duration: Number(
                                      event.target.value
                                    ),
                                  })
                                }
                              >
                                <option value={15}>15 minutes</option>
                                <option value={20}>20 minutes</option>
                                <option value={30}>30 minutes</option>
                                <option value={45}>45 minutes</option>
                                <option value={60}>60 minutes</option>
                              </select>
                            </label>
                          </div>
                        ) : (
                          <span className="doctor-day-unavailable">
                            Not available
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="doctor-availability-footer">
                    {availabilityLocked ? (
                      <div className="doctor-locked-message">
                        <ShieldCheck size={18} />
                        <span>
                          Your schedule is locked after initial approval.
                          Submit a change request to update it.
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="doctor-primary-button"
                        onClick={handleSaveAvailability}
                        disabled={
                          availabilitySaving || availabilityLoading
                        }
                      >
                        <Save size={17} />
                        {availabilitySaving
                          ? 'Saving...'
                          : 'Save availability'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Schedule change requests */}
          <section className="doctor-section">
            <div className="doctor-section-header">
              <div>
                <span className="doctor-section-eyebrow">
                  ADMINISTRATIVE REQUESTS
                </span>
                <h2>Schedule Change Requests</h2>
                <p>
                  Request administrator approval when you need to change
                  your approved weekly schedule.
                </p>
              </div>

              <button
                type="button"
                className="doctor-primary-button"
                onClick={openScheduleModal}
                disabled={requestSubmitting}
              >
                <Plus size={17} />
                Request schedule change
              </button>
            </div>

            {requestError && (
              <div className="doctor-alert doctor-alert-error">
                <AlertCircle size={18} />
                <span>{requestError}</span>
              </div>
            )}

            {requestsLoading ? (
              <div className="doctor-loading-state compact">
                <div className="doctor-spinner" />
                <p>Loading schedule requests...</p>
              </div>
            ) : scheduleRequests.length === 0 ? (
              <div className="doctor-empty-state compact">
                <div className="doctor-empty-icon">
                  <FileClock size={27} />
                </div>
                <h3>No schedule change requests</h3>
                <p>
                  Your submitted schedule change requests will appear here.
                </p>
              </div>
            ) : (
              <div className="doctor-history-list">
                {scheduleRequests.map((request) => (
                  <article
                    className="doctor-history-card"
                    key={request.id}
                  >
                    <div className="doctor-history-card-main">
                      <div className="doctor-history-icon">
                        <CalendarClock size={20} />
                      </div>
                      <div>
                        <strong>
                          Schedule change request #{request.id}
                        </strong>
                        <span>
                          Submitted {formatDateTime(request.created_at)}
                        </span>
                        {request.reason && (
                          <p>{request.reason}</p>
                        )}
                        {request.admin_response && (
                          <div className="doctor-admin-response">
                            <strong>Administrator response:</strong>
                            <p>{request.admin_response}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <span className={getStatusClass(request.status)}>
                      {request.status || 'Pending'}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Leave requests */}
          <section
            className="doctor-section"
            id="doctor-leave-requests"
          >
            <div className="doctor-section-header">
              <div>
                <span className="doctor-section-eyebrow">
                  TIME OFF MANAGEMENT
                </span>
                <h2>Leave Requests</h2>
                <p>
                  Submit leave requests and review their approval status.
                </p>
              </div>

              <button
                type="button"
                className="doctor-primary-button"
                onClick={openLeaveModal}
                disabled={leaveSubmitting}
              >
                <Plus size={17} />
                Request leave
              </button>
            </div>

            {leaveError && (
              <div className="doctor-alert doctor-alert-error">
                <AlertCircle size={18} />
                <span>{leaveError}</span>
              </div>
            )}

            {leaveLoading ? (
              <div className="doctor-loading-state compact">
                <div className="doctor-spinner" />
                <p>Loading leave requests...</p>
              </div>
            ) : leaveRequests.length === 0 ? (
              <div className="doctor-empty-state compact">
                <div className="doctor-empty-icon">
                  <CalendarCheck size={27} />
                </div>
                <h3>No leave requests</h3>
                <p>
                  Your leave requests will appear here after submission.
                </p>
              </div>
            ) : (
              <div className="doctor-history-list">
                {leaveRequests.map((request) => (
                  <article
                    className="doctor-history-card"
                    key={request.id}
                  >
                    <div className="doctor-history-card-main">
                      <div className="doctor-history-icon">
                        <CalendarDays size={20} />
                      </div>

                      <div>
                        <strong>
                          {request.leave_type || 'Leave'} request
                        </strong>
                        <span>
                          {request.leave_date
                            ? new Date(
                                `${request.leave_date}T12:00:00`
                              ).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : 'Date not available'}
                        </span>

                        {request.start_time && request.end_time && (
                          <span>
                            {formatTime(request.start_time)} –{' '}
                            {formatTime(request.end_time)}
                          </span>
                        )}

                        {request.reason && <p>{request.reason}</p>}

                        {request.admin_response && (
                          <div className="doctor-admin-response">
                            <strong>Administrator response:</strong>
                            <p>{request.admin_response}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <span className={getStatusClass(request.status)}>
                      {request.status || 'Pending'}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Prescription history */}
          <section className="doctor-section">
            <div className="doctor-section-header">
              <div>
                <span className="doctor-section-eyebrow">
                  DIGITAL HEALTHCARE
                </span>
                <h2>Digital Prescriptions</h2>
                <p>
                  Review prescriptions issued through your consultations.
                </p>
              </div>

              <div className="doctor-section-badge">
                <FileText size={16} />
                {prescriptions.length} issued
              </div>
            </div>

            {prescriptionsLoading ? (
              <div className="doctor-loading-state compact">
                <div className="doctor-spinner" />
                <p>Loading prescriptions...</p>
              </div>
            ) : prescriptions.length === 0 ? (
              <div className="doctor-empty-state compact">
                <div className="doctor-empty-icon">
                  <Pill size={28} />
                </div>
                <h3>No prescriptions issued yet</h3>
                <p>
                  Prescriptions you issue for completed appointments will
                  appear here.
                </p>
              </div>
            ) : (
              <div className="doctor-prescription-list">
                {prescriptions
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.issued_at || b.created_at || 0) -
                      new Date(a.issued_at || a.created_at || 0)
                  )
                  .map((prescription) => {
                    const patientName =
                      prescription.patient_name ||
                      prescription.patient_details?.full_name ||
                      prescription.patient_details?.name ||
                      'Patient';

                    const items = Array.isArray(prescription.items)
                      ? prescription.items
                      : [];

                    return (
                      <article
                        className="doctor-prescription-card"
                        key={prescription.id}
                      >
                        <div className="doctor-prescription-card-header">
                          <div className="doctor-prescription-title">
                            <div className="doctor-prescription-icon">
                              <FileText size={20} />
                            </div>
                            <div>
                              <strong>Prescription #{prescription.id}</strong>
                              <span>{patientName}</span>
                            </div>
                          </div>

                          <span className="doctor-status success">
                            {prescription.status || 'Issued'}
                          </span>
                        </div>

                        <div className="doctor-prescription-details">
                          <div>
                            <span>Diagnosis</span>
                            <strong>
                              {prescription.diagnosis || 'Not specified'}
                            </strong>
                          </div>
                          <div>
                            <span>Issued</span>
                            <strong>
                              {formatDateTime(
                                prescription.issued_at ||
                                  prescription.created_at
                              )}
                            </strong>
                          </div>
                          <div>
                            <span>Medicines</span>
                            <strong>{items.length}</strong>
                          </div>
                        </div>

                        {items.length > 0 && (
                          <div className="doctor-prescription-medicines">
                            {items.map((medicine, index) => (
                              <div
                                className="doctor-prescription-medicine"
                                key={medicine.id || index}
                              >
                                <Pill size={15} />
                                <span>
                                  <strong>
                                    {medicine.medicine_name ||
                                      medicine.name ||
                                      'Medicine'}
                                  </strong>
                                  {medicine.strength &&
                                    ` · ${medicine.strength}`}
                                  {medicine.dosage &&
                                    ` · ${medicine.dosage}`}
                                  {medicine.frequency &&
                                    ` · ${medicine.frequency}`}
                                  {medicine.duration &&
                                    ` · ${medicine.duration}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {prescription.clinical_notes && (
                          <p className="doctor-prescription-notes">
                            {prescription.clinical_notes}
                          </p>
                        )}

                        {prescription.replaces && (
                          <span className="doctor-correction-label">
                            <RefreshCw size={14} />
                            Corrected prescription
                          </span>
                        )}
                      </article>
                    );
                  })}
              </div>
            )}
          </section>

          {/* Footer */}
          <footer className="doctor-dashboard-footer">
            <span>
              Secure healthcare management · ©{' '}
              {new Date().getFullYear()}
            </span>
          </footer>
        </div>
      </main>

      {/* Schedule change request modal */}
      {scheduleModalOpen && (
        <div
          className="doctor-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !requestSubmitting
            ) {
              setScheduleModalOpen(false);
            }
          }}
        >
          <div
            className="doctor-modal doctor-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-modal-title"
          >
            <div className="doctor-modal-header">
              <div>
                <span className="doctor-modal-eyebrow">
                  ADMINISTRATOR APPROVAL
                </span>
                <h2 id="schedule-modal-title">
                  Request Schedule Change
                </h2>
                <p>
                  Submit your proposed weekly schedule for review.
                </p>
              </div>

              <button
                type="button"
                className="doctor-modal-close"
                onClick={() => setScheduleModalOpen(false)}
                disabled={requestSubmitting}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {requestError && (
              <div className="doctor-alert doctor-alert-error">
                <AlertCircle size={18} />
                <span>{requestError}</span>
              </div>
            )}

            <form onSubmit={handleScheduleChangeRequest}>
              <div className="doctor-modal-body">
                <div className="doctor-schedule-list modal-schedule-list">
                  {requestSchedule.map((day) => (
                    <div
                      className={`doctor-schedule-row ${
                        day.is_available ? 'enabled' : ''
                      }`}
                      key={day.weekday}
                    >
                      <div className="doctor-schedule-day">
                        <label className="doctor-toggle">
                          <input
                            type="checkbox"
                            checked={day.is_available}
                            disabled={requestSubmitting}
                            onChange={(event) =>
                              updateRequestScheduleDay(day.weekday, {
                                is_available: event.target.checked,
                              })
                            }
                          />
                          <span className="doctor-toggle-slider" />
                        </label>
                        <strong>{day.weekday_name}</strong>
                      </div>

                      {day.is_available ? (
                        <div className="doctor-schedule-fields">
                          <label>
                            <span>Start</span>
                            <input
                              type="time"
                              value={day.start_time}
                              disabled={requestSubmitting}
                              onChange={(event) =>
                                updateRequestScheduleDay(day.weekday, {
                                  start_time: event.target.value,
                                })
                              }
                            />
                          </label>

                          <label>
                            <span>End</span>
                            <input
                              type="time"
                              value={day.end_time}
                              disabled={requestSubmitting}
                              onChange={(event) =>
                                updateRequestScheduleDay(day.weekday, {
                                  end_time: event.target.value,
                                })
                              }
                            />
                          </label>

                          <label>
                            <span>Duration</span>
                            <select
                              value={day.slot_duration}
                              disabled={requestSubmitting}
                              onChange={(event) =>
                                updateRequestScheduleDay(day.weekday, {
                                  slot_duration: Number(
                                    event.target.value
                                  ),
                                })
                              }
                            >
                              <option value={15}>15 min</option>
                              <option value={20}>20 min</option>
                              <option value={30}>30 min</option>
                              <option value={45}>45 min</option>
                              <option value={60}>60 min</option>
                            </select>
                          </label>
                        </div>
                      ) : (
                        <span className="doctor-day-unavailable">
                          Not available
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <label className="doctor-form-label">
                  Reason for schedule change
                  <textarea
                    className="doctor-textarea"
                    rows={4}
                    placeholder="Explain why you need to change your weekly availability..."
                    value={requestReason}
                    disabled={requestSubmitting}
                    onChange={(event) =>
                      setRequestReason(event.target.value)
                    }
                    required
                  />
                </label>
              </div>

              <div className="doctor-modal-footer">
                <button
                  type="button"
                  className="doctor-secondary-button"
                  onClick={() => setScheduleModalOpen(false)}
                  disabled={requestSubmitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="doctor-primary-button"
                  disabled={requestSubmitting}
                >
                  <Send size={16} />
                  {requestSubmitting
                    ? 'Submitting...'
                    : 'Submit request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave request modal */}
      {leaveModalOpen && (
        <div
          className="doctor-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !leaveSubmitting
            ) {
              setLeaveModalOpen(false);
            }
          }}
        >
          <div
            className="doctor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-modal-title"
          >
            <div className="doctor-modal-header">
              <div>
                <span className="doctor-modal-eyebrow">
                  TIME OFF MANAGEMENT
                </span>
                <h2 id="leave-modal-title">Request Leave</h2>
                <p>
                  Submit a leave request for administrator approval.
                </p>
              </div>

              <button
                type="button"
                className="doctor-modal-close"
                onClick={() => setLeaveModalOpen(false)}
                disabled={leaveSubmitting}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {leaveError && (
              <div className="doctor-alert doctor-alert-error">
                <AlertCircle size={18} />
                <span>{leaveError}</span>
              </div>
            )}

            <form onSubmit={handleLeaveSubmit}>
              <div className="doctor-modal-body">
                <label className="doctor-form-label">
                  Leave date
                  <input
                    type="date"
                    value={leaveDate}
                    min={getLocalTomorrow()}
                    disabled={leaveSubmitting}
                    onChange={(event) => {
                      setLeaveDate(event.target.value);
                      setLeaveStartTime('');
                      setLeaveEndTime('');
                      setLeaveError('');
                    }}
                    required
                  />
                </label>

                {leaveDate && selectedLeaveDay && (
                  <div className="doctor-selected-day-info">
                    <CalendarDays size={17} />
                    <span>
                      {selectedLeaveDay.weekday_name}:{' '}
                      {selectedLeaveDay.is_available
                        ? `${formatTime(
                            selectedLeaveDay.start_time
                          )} – ${formatTime(selectedLeaveDay.end_time)}`
                        : 'You are not scheduled to work on this day.'}
                    </span>
                  </div>
                )}

                <label className="doctor-form-label">
                  Leave type
                  <select
                    value={leaveType}
                    disabled={leaveSubmitting}
                    onChange={(event) => {
                      setLeaveType(event.target.value);
                      setLeaveStartTime('');
                      setLeaveEndTime('');
                    }}
                  >
                    <option value="Full day">Full day</option>
                    <option value="Morning">Morning</option>
                    <option value="Afternoon">Afternoon</option>
                    <option value="Custom">Custom hours</option>
                  </select>
                </label>

                {leaveType === 'Custom' && (
                  <div className="doctor-form-two-columns">
                    <label className="doctor-form-label">
                      Start time
                      <input
                        type="time"
                        value={leaveStartTime}
                        disabled={leaveSubmitting}
                        onChange={(event) =>
                          setLeaveStartTime(event.target.value)
                        }
                        required
                      />
                    </label>

                    <label className="doctor-form-label">
                      End time
                      <input
                        type="time"
                        value={leaveEndTime}
                        disabled={leaveSubmitting}
                        onChange={(event) =>
                          setLeaveEndTime(event.target.value)
                        }
                        required
                      />
                    </label>
                  </div>
                )}

                {selectedLeaveDay?.is_available && (
                  <div className="doctor-leave-preview">
                    <span>Requested leave hours</span>
                    <strong>{getRequestedLeaveHours()}</strong>
                  </div>
                )}

                <label className="doctor-form-label">
                  Reason for leave
                  <textarea
                    className="doctor-textarea"
                    rows={4}
                    placeholder="Explain the reason for your leave request..."
                    value={leaveReason}
                    disabled={leaveSubmitting}
                    onChange={(event) =>
                      setLeaveReason(event.target.value)
                    }
                    required
                  />
                </label>
              </div>

              <div className="doctor-modal-footer">
                <button
                  type="button"
                  className="doctor-secondary-button"
                  onClick={() => setLeaveModalOpen(false)}
                  disabled={leaveSubmitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="doctor-primary-button"
                  disabled={leaveSubmitting}
                >
                  <Send size={16} />
                  {leaveSubmitting
                    ? 'Submitting...'
                    : 'Submit leave request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Digital prescription modal */}
      {prescriptionModalOpen && prescriptionAppointment && (
        <div
          className="doctor-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !prescriptionSubmitting
            ) {
              setPrescriptionModalOpen(false);
            }
          }}
        >
          <div
            className="doctor-modal doctor-prescription-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prescription-modal-title"
          >
            <div className="doctor-modal-header">
              <div>
                <span className="doctor-modal-eyebrow">
                  DIGITAL HEALTHCARE
                </span>
                <h2 id="prescription-modal-title">
                  Issue Digital Prescription
                </h2>
                <p>
                  Patient:{' '}
                  {prescriptionAppointment.patient_name ||
                    prescriptionAppointment.patient_full_name ||
                    prescriptionAppointment.patient_details?.full_name ||
                    'Patient'}
                </p>
              </div>

              <button
                type="button"
                className="doctor-modal-close"
                onClick={() => setPrescriptionModalOpen(false)}
                disabled={prescriptionSubmitting}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {prescriptionError && (
              <div className="doctor-alert doctor-alert-error">
                <AlertCircle size={18} />
                <span>{prescriptionError}</span>
              </div>
            )}

            <form onSubmit={handlePrescriptionSubmit}>
              <div className="doctor-modal-body">
                {prescriptionReplacesId && (
                  <div className="doctor-alert doctor-alert-info">
                    <AlertCircle size={18} />
                    <span>
                      This appointment already has a prescription.
                      Submitting will issue a corrected prescription while
                      preserving the previous record.
                    </span>
                  </div>
                )}

                <label className="doctor-form-label">
                  Diagnosis
                  <input
                    type="text"
                    value={diagnosis}
                    disabled={prescriptionSubmitting}
                    onChange={(event) =>
                      setDiagnosis(event.target.value)
                    }
                    placeholder="Enter diagnosis"
                    required
                  />
                </label>

                <label className="doctor-form-label">
                  Clinical notes
                  <textarea
                    className="doctor-textarea"
                    rows={3}
                    value={clinicalNotes}
                    disabled={prescriptionSubmitting}
                    onChange={(event) =>
                      setClinicalNotes(event.target.value)
                    }
                    placeholder="Clinical observations and notes..."
                  />
                </label>

                <div className="doctor-medicine-section">
                  <div className="doctor-medicine-heading">
                    <div>
                      <h3>
                        <Pill size={19} />
                        Prescribed medicines
                      </h3>
                      <p>
                        Enter the required details for each medicine.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="doctor-secondary-button"
                      onClick={addMedicine}
                      disabled={
                        prescriptionSubmitting ||
                        medicineItems.length >= 30
                      }
                    >
                      <Plus size={16} />
                      Add medicine
                    </button>
                  </div>

                  {medicineItems.map((medicine, index) => (
                    <div
                      className="doctor-medicine-card"
                      key={index}
                    >
                      <div className="doctor-medicine-card-header">
                        <strong>Medicine {index + 1}</strong>

                        {medicineItems.length > 1 && (
                          <button
                            type="button"
                            className="doctor-remove-medicine"
                            onClick={() => removeMedicine(index)}
                            disabled={prescriptionSubmitting}
                            aria-label={`Remove medicine ${index + 1}`}
                          >
                            <Trash2 size={16} />
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="doctor-form-two-columns">
                        <label className="doctor-form-label">
                          Medicine name *
                          <input
                            type="text"
                            value={medicine.medicine_name}
                            disabled={prescriptionSubmitting}
                            onChange={(event) =>
                              updateMedicine(
                                index,
                                'medicine_name',
                                event.target.value
                              )
                            }
                            placeholder="e.g. Paracetamol"
                            required
                          />
                        </label>

                        <label className="doctor-form-label">
                          Strength
                          <input
                            type="text"
                            value={medicine.strength}
                            disabled={prescriptionSubmitting}
                            onChange={(event) =>
                              updateMedicine(
                                index,
                                'strength',
                                event.target.value
                              )
                            }
                            placeholder="e.g. 500 mg"
                          />
                        </label>

                        <label className="doctor-form-label">
                          Dosage *
                          <input
                            type="text"
                            value={medicine.dosage}
                            disabled={prescriptionSubmitting}
                            onChange={(event) =>
                              updateMedicine(
                                index,
                                'dosage',
                                event.target.value
                              )
                            }
                            placeholder="e.g. 1 tablet"
                            required
                          />
                        </label>

                        <label className="doctor-form-label">
                          Route
                          <select
                            value={medicine.route}
                            disabled={prescriptionSubmitting}
                            onChange={(event) =>
                              updateMedicine(
                                index,
                                'route',
                                event.target.value
                              )
                            }
                          >
                            <option value="">Select route</option>
                            <option value="Oral">Oral</option>
                            <option value="Topical">Topical</option>
                            <option value="Intravenous">
                              Intravenous
                            </option>
                            <option value="Intramuscular">
                              Intramuscular
                            </option>
                            <option value="Inhalation">Inhalation</option>
                            <option value="Other">Other</option>
                          </select>
                        </label>

                        <label className="doctor-form-label">
                          Frequency *
                          <input
                            type="text"
                            value={medicine.frequency}
                            disabled={prescriptionSubmitting}
                            onChange={(event) =>
                              updateMedicine(
                                index,
                                'frequency',
                                event.target.value
                              )
                            }
                            placeholder="e.g. Twice daily"
                            required
                          />
                        </label>

                        <label className="doctor-form-label">
                          Duration *
                          <input
                            type="text"
                            value={medicine.duration}
                            disabled={prescriptionSubmitting}
                            onChange={(event) =>
                              updateMedicine(
                                index,
                                'duration',
                                event.target.value
                              )
                            }
                            placeholder="e.g. 5 days"
                            required
                          />
                        </label>

                        <label className="doctor-form-label">
                          Quantity
                          <input
                            type="text"
                            value={medicine.quantity}
                            disabled={prescriptionSubmitting}
                            onChange={(event) =>
                              updateMedicine(
                                index,
                                'quantity',
                                event.target.value
                              )
                            }
                            placeholder="e.g. 10 tablets"
                          />
                        </label>

                        <label className="doctor-form-label">
                          Medicine instructions
                          <input
                            type="text"
                            value={medicine.instructions}
                            disabled={prescriptionSubmitting}
                            onChange={(event) =>
                              updateMedicine(
                                index,
                                'instructions',
                                event.target.value
                              )
                            }
                            placeholder="e.g. Take after meals"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <label className="doctor-form-label">
                  General prescription instructions
                  <textarea
                    className="doctor-textarea"
                    rows={3}
                    value={prescriptionInstructions}
                    disabled={prescriptionSubmitting}
                    onChange={(event) =>
                      setPrescriptionInstructions(event.target.value)
                    }
                    placeholder="Additional instructions for the patient..."
                  />
                </label>
              </div>

              <div className="doctor-modal-footer">
                <button
                  type="button"
                  className="doctor-secondary-button"
                  onClick={() => setPrescriptionModalOpen(false)}
                  disabled={prescriptionSubmitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="doctor-primary-button"
                  disabled={prescriptionSubmitting}
                >
                  <FileText size={17} />
                  {prescriptionSubmitting
                    ? 'Issuing...'
                    : prescriptionReplacesId
                      ? 'Issue corrected prescription'
                      : 'Issue prescription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Follow-up appointment modal */}
      {followUpModalOpen && followUpAppointment && (
        <div
          className="doctor-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !followUpSubmitting
            ) {
              closeFollowUpModal();
            }
          }}
        >
          <div
            className="doctor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-modal-title"
          >
            <div className="doctor-modal-header">
              <div>
                <span className="doctor-modal-eyebrow">
                  CONTINUITY OF CARE
                </span>
                <h2 id="follow-up-modal-title">
                  Schedule Follow-up
                </h2>
                <p>
                  Choose an available appointment slot for this patient.
                </p>
              </div>

              <button
                type="button"
                className="doctor-modal-close"
                onClick={closeFollowUpModal}
                disabled={followUpSubmitting}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {followUpError && (
              <div className="doctor-alert doctor-alert-error">
                <AlertCircle size={18} />
                <span>{followUpError}</span>
              </div>
            )}

            <form onSubmit={handleFollowUpSubmit}>
              <div className="doctor-modal-body">
                <div className="doctor-follow-up-patient-summary">
                  <div className="doctor-patient-avatar">
                    {getPatientProfilePhoto(followUpAppointment) ? (
                      <img
                        src={getPatientProfilePhoto(followUpAppointment)}
                        alt="Patient profile"
                      />
                    ) : (
                      <UserRound size={22} />
                    )}
                  </div>
                  <div>
                    <strong>
                      {followUpAppointment.patient_name ||
                        followUpAppointment.patient_full_name ||
                        followUpAppointment.patient_details?.full_name ||
                        'Patient'}
                    </strong>
                    <span>
                      Original appointment #{followUpAppointment.id}
                    </span>
                  </div>
                </div>

                <label className="doctor-form-label">
                  Follow-up date
                  <input
                    type="date"
                    value={followUpDate}
                    min={getLocalTomorrow()}
                    disabled={followUpSubmitting}
                    onChange={(event) => {
                      setFollowUpDate(event.target.value);
                      setFollowUpStartTime('');
                      setFollowUpError('');
                    }}
                    required
                  />
                </label>

                {followUpDate && (
                  <div className="doctor-available-slots">
                    <div className="doctor-available-slots-heading">
                      <strong>Available time slots</strong>
                      {followUpSlotsLoading && (
                        <span>Checking availability...</span>
                      )}
                    </div>

                    {followUpSlotsLoading ? (
                      <div className="doctor-inline-loading">
                        <div className="doctor-spinner" />
                        Loading available slots...
                      </div>
                    ) : followUpSlots.length === 0 ? (
                      <div className="doctor-empty-inline">
                        No available slots for this date. Please choose
                        another date.
                      </div>
                    ) : (
                      <div className="doctor-slot-grid">
                        {followUpSlots.map((slot, index) => (
                          <button
                            type="button"
                            key={`${slot.start_time}-${index}`}
                            className={
                              followUpStartTime === slot.start_time
                                ? 'active'
                                : ''
                            }
                            disabled={
                              followUpSubmitting || !slot.is_available
                            }
                            onClick={() => {
                              setFollowUpStartTime(slot.start_time);
                              setFollowUpError('');
                            }}
                          >
                            <Clock3 size={15} />
                            {formatTime(slot.start_time)}
                            {slot.end_time && (
                              <span>
                                – {formatTime(slot.end_time)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <label className="doctor-form-label">
                  Follow-up reason
                  <textarea
                    className="doctor-textarea"
                    rows={3}
                    value={followUpReason}
                    disabled={followUpSubmitting}
                    onChange={(event) =>
                      setFollowUpReason(event.target.value)
                    }
                    placeholder="Enter the reason or purpose of this follow-up..."
                  />
                </label>
              </div>

              <div className="doctor-modal-footer">
                <button
                  type="button"
                  className="doctor-secondary-button"
                  onClick={closeFollowUpModal}
                  disabled={followUpSubmitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="doctor-primary-button"
                  disabled={
                    followUpSubmitting ||
                    followUpSlotsLoading ||
                    !followUpDate ||
                    !followUpStartTime
                  }
                >
                  <CalendarCheck size={17} />
                  {followUpSubmitting
                    ? 'Scheduling...'
                    : 'Confirm follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}