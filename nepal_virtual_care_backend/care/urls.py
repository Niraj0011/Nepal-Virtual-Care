
from django.urls import path

from .views import (
    ProviderListView,
    AvailableSlotsView,
    AppointmentListCreateView,
    AppointmentStatusUpdateView,
    PatientRescheduleRequestListCreateView,
    DoctorAdminRescheduleRequestListView,
    RescheduleRequestReviewView,
    DoctorAvailabilityView,
    AdminDoctorAvailabilityView,
    DoctorScheduleChangeRequestView,
    AdminScheduleChangeRequestListView,
    AdminScheduleChangeRequestReviewView,
    DoctorLeaveRequestView,
    AdminLeaveRequestListView,
    AdminLeaveRequestReviewView,
    AdminActivityView,
    DoctorManagementView,
    DoctorDetailView,
    PatientManagementView,
    PatientDetailView,
    MedicalDocumentListCreateView,
    MedicalDocumentDetailView,
    MedicalDocumentDownloadView,
    NotificationListView,
    NotificationUnreadCountView,
    NotificationMarkReadView,
    NotificationMarkAllReadView,
    PrescriptionListCreateView,
    PrescriptionDetailView,
)

from .admin_analytics_views import AdminAnalyticsView
from .doctor_profile_views import DoctorProfilePhotoView
from .video_views import VideoConsultationTokenView
from .follow_up_views import DoctorFollowUpAppointmentView

from .health_history_views import (
    PatientHealthHistoryView,
    DoctorPatientHealthHistoryView,
)

from .review_views import (
    PublicDoctorReviewListView,
    PatientDoctorReviewListCreateView,
    PatientDoctorReviewDetailView,
    DoctorReviewReportCreateView,
    AdminDoctorReviewListView,
    AdminDoctorReviewModerationView,
    AdminDoctorReviewReportListView,
    AdminDoctorReviewReportDetailView,
)


urlpatterns = [
    # Providers
    path("providers/", ProviderListView.as_view(), name="providers"),
    path(
        "providers/<int:provider_id>/available-slots/",
        AvailableSlotsView.as_view(),
        name="provider-available-slots",
    ),
    path(
        "providers/<int:provider_id>/reviews/",
        PublicDoctorReviewListView.as_view(),
        name="provider-reviews",
    ),

    # Appointments
    path("appointments/", AppointmentListCreateView.as_view(), name="appointments"),
    path(
        "appointments/<int:pk>/status/",
        AppointmentStatusUpdateView.as_view(),
        name="appointment-status-update",
    ),
    path(
        "appointments/<int:provider_id>/available-slots/",
        AvailableSlotsView.as_view(),
        name="available-slots",
    ),
    path(
        "appointments/follow-up/",
        DoctorFollowUpAppointmentView.as_view(),
        name="doctor-follow-up-appointment",
    ),

    # Appointment rescheduling
    path(
        "appointments/reschedule-requests/",
        PatientRescheduleRequestListCreateView.as_view(),
        name="patient-reschedule-requests",
    ),
    path(
        "reschedule-requests/",
        DoctorAdminRescheduleRequestListView.as_view(),
        name="doctor-admin-reschedule-requests",
    ),
    path(
        "reschedule-requests/<int:pk>/review/",
        RescheduleRequestReviewView.as_view(),
        name="reschedule-request-review",
    ),

    # Doctor profile photo
    path(
        "doctor/profile-photo/",
        DoctorProfilePhotoView.as_view(),
        name="doctor-profile-photo",
    ),

    # Video consultations
    path(
        "appointments/<int:appointment_id>/video-token/",
        VideoConsultationTokenView.as_view(),
        name="video-consultation-token",
    ),

    # Doctor availability
    path("doctor/availability/", DoctorAvailabilityView.as_view(), name="doctor-availability"),
    path(
        "admin/doctors/<int:provider_id>/availability/",
        AdminDoctorAvailabilityView.as_view(),
        name="admin-doctor-availability",
    ),

    # Doctor schedule-change requests
    path(
        "doctor/schedule-change-requests/",
        DoctorScheduleChangeRequestView.as_view(),
        name="doctor-schedule-change-requests",
    ),
    path(
        "doctor/schedule-requests/",
        DoctorScheduleChangeRequestView.as_view(),
        name="doctor-schedule-requests-legacy",
    ),
    path(
        "admin/schedule-change-requests/",
        AdminScheduleChangeRequestListView.as_view(),
        name="admin-schedule-change-requests",
    ),
    path(
        "admin/schedule-requests/",
        AdminScheduleChangeRequestListView.as_view(),
        name="admin-schedule-requests-legacy",
    ),
    path(
        "admin/schedule-change-requests/<int:pk>/review/",
        AdminScheduleChangeRequestReviewView.as_view(),
        name="admin-schedule-change-request-review",
    ),
    path(
        "admin/schedule-requests/<int:pk>/review/",
        AdminScheduleChangeRequestReviewView.as_view(),
        name="admin-schedule-request-review-legacy",
    ),

    # Doctor leave requests
    path("doctor/leave-requests/", DoctorLeaveRequestView.as_view(), name="doctor-leave-requests"),
    path("admin/leave-requests/", AdminLeaveRequestListView.as_view(), name="admin-leave-requests"),
    path(
        "admin/leave-requests/<int:pk>/review/",
        AdminLeaveRequestReviewView.as_view(),
        name="admin-leave-request-review",
    ),

    # Admin recent activity
    path("admin/activity/", AdminActivityView.as_view(), name="admin-activity"),

    # Admin analytics
    path(
        "admin/analytics/",
        AdminAnalyticsView.as_view(),
        name="admin-analytics",
    ),

    # Doctor management
    path("doctors/", DoctorManagementView.as_view(), name="doctor-management"),
    path("doctors/<int:pk>/", DoctorDetailView.as_view(), name="doctor-detail"),

    # Patient management
    path("patients/", PatientManagementView.as_view(), name="patient-management"),
    path("patients/<int:pk>/", PatientDetailView.as_view(), name="patient-detail"),

    # Medical documents
    path("medical-documents/", MedicalDocumentListCreateView.as_view(), name="medical-document-list-create"),
    path("medical-documents/<int:pk>/", MedicalDocumentDetailView.as_view(), name="medical-document-detail"),
    path(
        "medical-documents/<int:pk>/download/",
        MedicalDocumentDownloadView.as_view(),
        name="medical-document-download",
    ),

    # Notification centre
    path("notifications/", NotificationListView.as_view(), name="notification-list"),
    path(
        "notifications/unread-count/",
        NotificationUnreadCountView.as_view(),
        name="notification-unread-count",
    ),
    path("notifications/<int:pk>/read/", NotificationMarkReadView.as_view(), name="notification-mark-read"),
    path("notifications/mark-all-read/", NotificationMarkAllReadView.as_view(), name="notification-mark-all-read"),

    # Digital prescriptions
    path("prescriptions/", PrescriptionListCreateView.as_view(), name="prescription-list-create"),
    path("prescriptions/<int:pk>/", PrescriptionDetailView.as_view(), name="prescription-detail"),

    # Patient health history
    path("health-history/", PatientHealthHistoryView.as_view(), name="patient-health-history"),
    path(
        "health-history/patient/<int:patient_id>/",
        DoctorPatientHealthHistoryView.as_view(),
        name="doctor-patient-health-history",
    ),

    # Doctor ratings and patient reviews
    path("reviews/", PatientDoctorReviewListCreateView.as_view(), name="patient-review-list-create"),
    path("reviews/mine/", PatientDoctorReviewListCreateView.as_view(), name="patient-review-mine"),
    path("reviews/<int:pk>/", PatientDoctorReviewDetailView.as_view(), name="patient-review-detail"),
    path("reviews/report/", DoctorReviewReportCreateView.as_view(), name="doctor-review-report-create"),
    path("admin/reviews/", AdminDoctorReviewListView.as_view(), name="admin-doctor-review-list"),
    path(
        "admin/reviews/<int:pk>/moderate/",
        AdminDoctorReviewModerationView.as_view(),
        name="admin-doctor-review-moderation",
    ),
    path("admin/review-reports/", AdminDoctorReviewReportListView.as_view(), name="admin-doctor-review-report-list"),
    path(
        "admin/review-reports/<int:pk>/",
        AdminDoctorReviewReportDetailView.as_view(),
        name="admin-doctor-review-report-detail",
    ),
]
