
const API_URL = 'http://127.0.0.1:8000/api';

let refreshPromise = null;

const TRUSTED_DEVICE_KEY_PREFIX = 'nvc-trusted-device-';
const PENDING_LOGIN_EMAIL_KEY = 'nvc-pending-login-email';
const BROWSER_DEVICE_ID_KEY = 'nvc-browser-device-id';

function getTrustedDeviceKey(email) {
  return `${TRUSTED_DEVICE_KEY_PREFIX}${email.trim().toLowerCase()}`;
}

// Persistent browser identifier used for account-session tracking.
// This is separate from the trusted-device OTP exemption token.
function getOrCreateBrowserDeviceId() {
  let deviceId = localStorage.getItem(BROWSER_DEVICE_ID_KEY);

  if (deviceId) {
    return deviceId;
  }

  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    deviceId = crypto.randomUUID();
  } else {
    deviceId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  localStorage.setItem(BROWSER_DEVICE_ID_KEY, deviceId);

  return deviceId;
}

function clearAuth(dispatchEvent = true) {
  localStorage.removeItem('nvc-access');
  localStorage.removeItem('nvc-refresh');

  if (dispatchEvent) {
    window.dispatchEvent(new Event('nvc:auth-expired'));
  }
}

async function refreshAccessToken() {
  const refresh = localStorage.getItem('nvc-refresh');

  if (!refresh) {
    clearAuth();
    throw new Error('Your session has expired. Please log in again.');
  }

  try {
    const response = await fetch(`${API_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.access) {
      clearAuth();
      throw new Error('Your session has expired. Please log in again.');
    }

    localStorage.setItem('nvc-access', data.access);

    if (data.refresh) {
      localStorage.setItem('nvc-refresh', data.refresh);
    }

    return data.access;
  } catch (error) {
    if (
      error.message !== 'Your session has expired. Please log in again.'
    ) {
      clearAuth();
      throw new Error('Unable to refresh your session. Please log in again.');
    }

    throw error;
  }
}

function getRefreshedToken() {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function request(endpoint, options = {}, retry = true) {
  const token = localStorage.getItem('nvc-access');
  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (
    response.status === 401 &&
    retry &&
    token &&
    !endpoint.includes('/auth/token/')
  ) {
    const newToken = await getRefreshedToken();

    return request(
      endpoint,
      {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
        },
      },
      false
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = Object.entries(data)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${key}: ${JSON.stringify(value)}`;
        }

        return `${key}: ${
          Array.isArray(value) ? value.join(', ') : value
        }`;
      })
      .join('\n');

    throw new Error(message || 'Something went wrong.');
  }

  return data;
}

async function requestBlob(endpoint, retry = true) {
  const token = localStorage.getItem('nvc-access');

  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 401 && retry && token) {
    await getRefreshedToken();

    return requestBlob(endpoint, false);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));

    throw new Error(
      data.detail || data.error || 'Unable to download this file.'
    );
  }

  return response.blob();
}

async function completeLogin(data) {
  if (!data.access || !data.refresh) {
    throw new Error('The login response was incomplete. Please try again.');
  }

  localStorage.setItem('nvc-access', data.access);
  localStorage.setItem('nvc-refresh', data.refresh);

  try {
    return await getCurrentUser();
  } catch (error) {
    clearAuth();
    throw error;
  }
}

export async function registerPatient({ name, email, password }) {
  const parts = name.trim().split(/\s+/);
  const normalizedEmail = email.trim().toLowerCase();

  return request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({
      first_name: parts[0],
      last_name: parts.slice(1).join(' '),
      username: normalizedEmail,
      email: normalizedEmail,
      password,
      password_confirm: password,
    }),
  });
}

export async function verifyEmail(token) {
  return request('/auth/verify-email/', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function resendVerificationEmail(email) {
  return request('/auth/resend-verification/', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
    }),
  });
}

export async function requestPasswordReset(email) {
  return request('/auth/password-reset/', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
    }),
  });
}

export async function confirmPasswordReset({
  uid,
  token,
  password,
  password_confirm,
}) {
  return request('/auth/password-reset/confirm/', {
    method: 'POST',
    body: JSON.stringify({
      uid,
      token,
      password,
      password_confirm,
    }),
  });
}

export async function getCurrentUser() {
  return request('/auth/me/');
}

export async function updateCurrentUser(profile) {
  return request('/auth/me/', {
    method: 'PATCH',
    body: JSON.stringify(profile),
  });
}

// =========================================
// PATIENT PROFILE PHOTO
// =========================================

export async function uploadProfilePhoto(file) {
  if (!file) {
    throw new Error('Please select a profile photo.');
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Please select a JPG or PNG image.');
  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error('The profile photo must be smaller than 5 MB.');
  }

  const formData = new FormData();
  formData.append('profile_photo', file);

  return request('/auth/me/', {
    method: 'PATCH',
    body: formData,
  });
}

// =========================================
// DOCTOR PROFILE PHOTO
// =========================================

export async function getDoctorProfilePhoto() {
  return request('/doctor/profile-photo/');
}

export async function uploadDoctorProfilePhoto(file) {
  if (!file) {
    throw new Error('Please select a profile photo.');
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Please select a JPG, PNG, or WEBP image.');
  }

  const maxSize = 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error('The profile photo must be 5 MB or smaller.');
  }

  const formData = new FormData();
  formData.append('profile_photo', file);

  return request('/doctor/profile-photo/', {
    method: 'POST',
    body: formData,
  });
}

export async function removeDoctorProfilePhoto() {
  return request('/doctor/profile-photo/', {
    method: 'DELETE',
  });
}

// =========================================
// LOGIN AND OTP VERIFICATION
// =========================================

export async function loginPatient(email, password) {
  clearAuth(false);

  const normalizedEmail = email.trim().toLowerCase();
  const trustedDeviceKey = getTrustedDeviceKey(normalizedEmail);
  const trustedDevice = localStorage.getItem(trustedDeviceKey);

  sessionStorage.setItem(PENDING_LOGIN_EMAIL_KEY, normalizedEmail);

  try {
    const data = await request('/auth/token/', {
      method: 'POST',
      headers: {
        'X-Device-ID': getOrCreateBrowserDeviceId(),
      },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        ...(trustedDevice ? { trusted_device: trustedDevice } : {}),
      }),
    });

    if (data.requires_otp) {
      if (!data.challenge) {
        throw new Error('The OTP challenge was missing. Please try again.');
      }

      return {
        requires_otp: true,
        challenge: data.challenge,
        detail: data.detail,
      };
    }

    sessionStorage.removeItem(PENDING_LOGIN_EMAIL_KEY);

    return completeLogin(data);
  } catch (error) {
    if (!error.message?.includes('OTP challenge')) {
      sessionStorage.removeItem(PENDING_LOGIN_EMAIL_KEY);
    }

    throw error;
  }
}

export async function verifyLoginOTP(
  challenge,
  code,
  rememberDevice = false
) {
  const email = sessionStorage.getItem(PENDING_LOGIN_EMAIL_KEY);

  if (!email) {
    throw new Error('Your login session has expired. Please log in again.');
  }

  const trustedDeviceKey = getTrustedDeviceKey(email);

  const data = await request('/auth/verify-otp/', {
    method: 'POST',
    headers: {
      'X-Device-ID': getOrCreateBrowserDeviceId(),
    },
    body: JSON.stringify({
      challenge,
      code: code.trim(),
      remember_device: rememberDevice,
    }),
  });

  const profile = await completeLogin(data);

  if (data.trusted_device && rememberDevice) {
    localStorage.setItem(trustedDeviceKey, data.trusted_device);
  } else {
    localStorage.removeItem(trustedDeviceKey);
  }

  sessionStorage.removeItem(PENDING_LOGIN_EMAIL_KEY);

  return profile;
}

// =========================================
// TRUSTED DEVICES
// =========================================

export async function getTrustedDevices() {
  return request('/auth/trusted-devices/');
}

export async function revokeTrustedDevice(deviceId) {
  return request(`/auth/trusted-devices/${deviceId}/`, {
    method: 'DELETE',
  });
}

// =========================================
// ACCOUNT SESSION SECURITY
// =========================================

export async function getAccountSessions() {
  return request('/auth/sessions/');
}

export async function revokeAccountSession(sessionId) {
  if (!sessionId) {
    throw new Error('A session ID is required.');
  }

  return request(`/auth/sessions/${encodeURIComponent(sessionId)}/`, {
    method: 'DELETE',
  });
}

export async function recognizeAccountSession(sessionId) {
  if (!sessionId) {
    throw new Error('A session ID is required.');
  }

  return request(
    `/auth/sessions/${encodeURIComponent(sessionId)}/recognize/`,
    {
      method: 'POST',
    }
  );
}

export async function reportUnrecognizedLogin(sessionId) {
  if (!sessionId) {
    throw new Error('A session ID is required.');
  }

  const result = await request(
    `/auth/sessions/${encodeURIComponent(sessionId)}/report/`,
    {
      method: 'POST',
    }
  );

  // Reporting an unrecognized login revokes all account sessions.
  // Clear local credentials so the user must sign in again after
  // securing the account and resetting their password.
  clearAuth();

  return result;
}

export async function logoutAllDevices() {
  const result = await request('/auth/sessions/logout-all/', {
    method: 'POST',
  });

  // The backend also revokes the session making this request.
  clearAuth();

  return result;
}

// =========================================
// LOGOUT
// =========================================

export async function logoutPatient() {
  const refresh = localStorage.getItem('nvc-refresh');

  try {
    if (refresh) {
      await request('/auth/logout/', {
        method: 'POST',
        body: JSON.stringify({ refresh }),
      });
    }
  } finally {
    clearAuth();
  }
}

// =========================================
// APPOINTMENTS
// =========================================

export async function createAppointment(appointment) {
  return request('/appointments/', {
    method: 'POST',
    body: JSON.stringify(appointment),
  });
}

export async function getAppointments() {
  return request('/appointments/');
}

export async function updateAppointmentStatus(appointmentId, status) {
  return request(`/appointments/${appointmentId}/status/`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function getDoctorAppointments() {
  return getAppointments();
}

export async function getProviders(search = '', specialty = '') {
  const params = new URLSearchParams();

  if (search) {
    params.append('search', search);
  }

  if (specialty && specialty !== 'All specialties') {
    params.append('specialty', specialty);
  }

  return request(`/providers/?${params.toString()}`);
}

// =========================================
// DOCTOR FOLLOW-UP APPOINTMENTS
// =========================================

export async function createFollowUpAppointment({
  original_appointment,
  preferred_date,
  start_time,
  reason = '',
}) {
  if (!original_appointment) {
    throw new Error('Please select the original appointment.');
  }

  if (!preferred_date || !start_time) {
    throw new Error('Please select a follow-up date and time.');
  }

  return request('/appointments/follow-up/', {
    method: 'POST',
    body: JSON.stringify({
      original_appointment,
      preferred_date,
      start_time,
      reason: reason.trim(),
    }),
  });
}

// =========================================
// APPOINTMENT RESCHEDULING
// =========================================

export async function createAppointmentRescheduleRequest(requestData) {
  if (!requestData?.appointment) {
    throw new Error('An appointment ID is required.');
  }

  if (
    !requestData.requested_date ||
    !requestData.requested_start_time ||
    !requestData.requested_end_time
  ) {
    throw new Error('Please select a new appointment date and time.');
  }

  if (!requestData.reason?.trim()) {
    throw new Error('Please provide a reason for rescheduling.');
  }

  return request('/appointments/reschedule-requests/', {
    method: 'POST',
    body: JSON.stringify({
      appointment: requestData.appointment,
      requested_date: requestData.requested_date,
      requested_start_time: requestData.requested_start_time,
      requested_end_time: requestData.requested_end_time,
      reason: requestData.reason.trim(),
    }),
  });
}

export async function getMyAppointmentRescheduleRequests() {
  return request('/appointments/reschedule-requests/');
}

export async function getRescheduleRequests(requestStatus = '') {
  const params = new URLSearchParams();

  if (requestStatus) {
    params.append('status', requestStatus);
  }

  const query = params.toString();

  return request(`/reschedule-requests/${query ? `?${query}` : ''}`);
}

export async function reviewRescheduleRequest(
  requestId,
  status,
  adminResponse = ''
) {
  if (!requestId) {
    throw new Error('A rescheduling request ID is required.');
  }

  if (!['Approved', 'Rejected'].includes(status)) {
    throw new Error('Please select Approved or Rejected.');
  }

  if (status === 'Rejected' && !adminResponse.trim()) {
    throw new Error('Please provide a reason for rejecting this request.');
  }

  return request(`/reschedule-requests/${requestId}/review/`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      admin_response: adminResponse.trim(),
    }),
  });
}

// =========================================
// DOCTOR RATINGS AND PATIENT REVIEWS
// =========================================

export async function getDoctorReviews(providerId) {
  if (!providerId) {
    throw new Error('A doctor ID is required.');
  }

  return request(`/providers/${providerId}/reviews/`);
}

export async function getMyReviews() {
  return request('/reviews/mine/');
}

export async function createDoctorReview({
  appointment,
  rating,
  comment = '',
}) {
  return request('/reviews/', {
    method: 'POST',
    body: JSON.stringify({
      appointment,
      rating,
      comment,
    }),
  });
}

export async function updateDoctorReview(reviewId, review) {
  if (!reviewId) {
    throw new Error('A review ID is required.');
  }

  return request(`/reviews/${reviewId}/`, {
    method: 'PATCH',
    body: JSON.stringify(review),
  });
}

export async function reportDoctorReview(reviewId, reason) {
  if (!reviewId) {
    throw new Error('A review ID is required.');
  }

  if (!reason || !reason.trim()) {
    throw new Error('Please provide a reason for reporting this review.');
  }

  return request('/reviews/report/', {
    method: 'POST',
    body: JSON.stringify({
      review: reviewId,
      reason: reason.trim(),
    }),
  });
}

export async function getAdminReviews(reviewStatus = '') {
  const params = new URLSearchParams();

  if (reviewStatus) {
    params.append('status', reviewStatus);
  }

  const query = params.toString();

  return request(`/admin/reviews/${query ? `?${query}` : ''}`);
}

export async function moderateDoctorReview(
  reviewId,
  moderationStatus,
  moderationNote = ''
) {
  if (!reviewId) {
    throw new Error('A review ID is required.');
  }

  return request(`/admin/reviews/${reviewId}/moderate/`, {
    method: 'PATCH',
    body: JSON.stringify({
      moderation_status: moderationStatus,
      moderation_note: moderationNote,
    }),
  });
}

export async function getAdminReviewReports() {
  return request('/admin/review-reports/');
}

export async function updateAdminReviewReport(
  reportId,
  status,
  adminNote = ''
) {
  if (!reportId) {
    throw new Error('A report ID is required.');
  }

  return request(`/admin/review-reports/${reportId}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      admin_note: adminNote,
    }),
  });
}

// =========================================
// VIDEO CONSULTATIONS
// =========================================

export async function getVideoConsultationToken(appointmentId) {
  if (!appointmentId) {
    throw new Error('An appointment ID is required to join a consultation.');
  }

  return request(`/appointments/${appointmentId}/video-token/`, {
    method: 'POST',
  });
}

// =========================================
// NOTIFICATIONS
// =========================================

export async function getNotifications() {
  return request('/notifications/');
}

export async function getUnreadNotificationCount() {
  return request('/notifications/unread-count/');
}

export async function markNotificationRead(notificationId) {
  return request(`/notifications/${notificationId}/read/`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsRead() {
  return request('/notifications/mark-all-read/', {
    method: 'POST',
  });
}

// =========================================
// DIGITAL PRESCRIPTIONS
// =========================================

export async function getPrescriptions() {
  return request('/prescriptions/');
}

export async function createPrescription(prescription) {
  return request('/prescriptions/', {
    method: 'POST',
    body: JSON.stringify(prescription),
  });
}

export async function getPrescription(prescriptionId) {
  if (!prescriptionId) {
    throw new Error('A prescription ID is required.');
  }

  return request(`/prescriptions/${prescriptionId}/`);
}

// =========================================
// PATIENT HEALTH HISTORY
// =========================================

export async function getPatientHealthHistory() {
  return request('/health-history/');
}

export async function updatePatientHealthHistory(history) {
  return request('/health-history/', {
    method: 'PUT',
    body: JSON.stringify(history),
  });
}

export async function getDoctorPatientHealthHistory(patientId) {
  if (!patientId) {
    throw new Error('A patient ID is required.');
  }

  return request(`/health-history/patient/${patientId}/`);
}

// =========================================
// DOCTOR AVAILABILITY & APPOINTMENT SLOTS
// =========================================

export async function getDoctorAvailability() {
  return request('/doctor/availability/');
}

export async function saveDoctorAvailability(schedule) {
  return request('/doctor/availability/', {
    method: 'PUT',
    body: JSON.stringify(schedule),
  });
}

export async function getAvailableSlots(providerId, date) {
  const params = new URLSearchParams({ date });

  return request(
    `/providers/${providerId}/available-slots/?${params.toString()}`
  );
}

// =========================================
// ADMIN: DOCTOR AVAILABILITY MANAGEMENT
// =========================================

export async function getAdminDoctorAvailability(providerId) {
  return request(`/admin/doctors/${providerId}/availability/`);
}

export async function updateAdminDoctorAvailability(providerId, schedule) {
  return request(`/admin/doctors/${providerId}/availability/`, {
    method: 'PUT',
    body: JSON.stringify(schedule),
  });
}

// =========================================
// DOCTOR: SCHEDULE CHANGE REQUESTS
// =========================================

export async function getDoctorScheduleChangeRequests() {
  return request('/doctor/schedule-change-requests/');
}

export async function createDoctorScheduleChangeRequest(schedule, reason) {
  return request('/doctor/schedule-change-requests/', {
    method: 'POST',
    body: JSON.stringify({ requested_schedule: schedule, reason }),
  });
}

export async function getAdminScheduleChangeRequests() {
  return request('/admin/schedule-change-requests/');
}

export async function reviewAdminScheduleChangeRequest(
  requestId,
  status,
  adminResponse = ''
) {
  return request(`/admin/schedule-change-requests/${requestId}/review/`, {
    method: 'POST',
    body: JSON.stringify({
      status,
      admin_response: adminResponse,
    }),
  });
}

// =========================================
// DOCTOR & ADMIN: DATE-SPECIFIC LEAVE REQUESTS
// =========================================

export async function getDoctorLeaveRequests() {
  return request('/doctor/leave-requests/');
}

export async function createDoctorLeaveRequest(leaveRequest) {
  return request('/doctor/leave-requests/', {
    method: 'POST',
    body: JSON.stringify(leaveRequest),
  });
}

export async function getAdminLeaveRequests() {
  return request('/admin/leave-requests/');
}

export async function reviewAdminLeaveRequest(
  requestId,
  status,
  adminResponse = ''
) {
  return request(`/admin/leave-requests/${requestId}/review/`, {
    method: 'POST',
    body: JSON.stringify({ status, admin_response: adminResponse }),
  });
}

// =========================================
// ADMIN: DOCTOR ACCOUNT MANAGEMENT
// =========================================

export async function getAdminDoctors() {
  return request('/doctors/');
}

export async function createDoctorAccount(doctor) {
  return request('/doctors/', {
    method: 'POST',
    body: JSON.stringify(doctor),
  });
}

export async function updateDoctorAccount(doctorId, doctor) {
  return request(`/doctors/${doctorId}/`, {
    method: 'PATCH',
    body: JSON.stringify(doctor),
  });
}

// =========================================
// ADMIN: PATIENT ACCOUNT MANAGEMENT
// =========================================

export async function getAdminPatients(search = '') {
  const params = new URLSearchParams();

  if (search.trim()) {
    params.append('search', search.trim());
  }

  const query = params.toString();

  return request(`/patients/${query ? `?${query}` : ''}`);
}

export async function updatePatientAccount(patientId, patient) {
  return request(`/patients/${patientId}/`, {
    method: 'PATCH',
    body: JSON.stringify(patient),
  });
}

// =========================================
// ADMIN: RECENT ACTIVITY
// =========================================

export async function getAdminActivity() {
  return request('/admin/activity/');
}

// =========================================
// ADMIN: ANALYTICS & REPORTS
// =========================================

export async function getAdminAnalytics(startDate = '', endDate = '') {
  const params = new URLSearchParams();

  if (startDate) {
    params.append('start_date', startDate);
  }

  if (endDate) {
    params.append('end_date', endDate);
  }

  const query = params.toString();

  return request(`/admin/analytics/${query ? `?${query}` : ''}`);
}

// =========================================
// MEDICAL DOCUMENTS
// =========================================

export async function getMedicalDocuments() {
  return request('/medical-documents/');
}

export async function uploadMedicalDocument({
  title,
  document_type,
  file,
}) {
  const formData = new FormData();

  formData.append('title', title);
  formData.append('document_type', document_type);
  formData.append('file', file);

  return request('/medical-documents/', {
    method: 'POST',
    body: formData,
  });
}

export async function downloadMedicalDocument(documentId) {
  return requestBlob(`/medical-documents/${documentId}/download/`);
}

export async function previewMedicalDocument(documentId) {
  return requestBlob(`/medical-documents/${documentId}/download/`);
}

export async function deleteMedicalDocument(documentId) {
  return request(`/medical-documents/${documentId}/`, {
    method: 'DELETE',
  });
}

// =========================================
// COMMUNITY
// =========================================

export async function getCommunityPosts() {
  return request('/community/posts/');
}

export async function createCommunityPost(post) {
  return request('/community/posts/', {
    method: 'POST',
    body: JSON.stringify(post),
  });
}

export async function togglePostLike(postId) {
  return request(`/community/posts/${postId}/like/`, {
    method: 'POST',
  });
}

export async function getPostComments(postId) {
  return request(`/community/posts/${postId}/comments/`);
}

export async function addPostComment(postId, body) {
  return request(`/community/posts/${postId}/comments/`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

// =========================================
// HEALTH RESOURCES
// =========================================

export async function getHealthResources() {
  return request('/resources/');
}

// =========================================
// CONSENT PREFERENCES
// =========================================

export async function getConsentPreferences() {
  return request('/auth/consent/');
}

export async function updateConsentPreferences(preferences) {
  return request('/auth/consent/', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
}

export { API_URL };
