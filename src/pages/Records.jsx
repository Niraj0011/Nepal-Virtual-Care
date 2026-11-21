
import { useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CalendarDays,
  FileText,
  ShieldCheck,
  Clock3,
  Upload,
  Download,
  Trash2,
  File,
  RefreshCw,
  Pill,
  Printer,
  Stethoscope,
  ClipboardList,
  HeartHandshake,
  ArrowRight,
  FolderOpen,
  HeartPulse,
  Save,
  AlertCircle,
  CheckCircle2,
  Activity,
  UserRound,
  Star,
  MessageSquare,
  Pencil,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  getAppointments,
  getMedicalDocuments,
  uploadMedicalDocument,
  downloadMedicalDocument,
  previewMedicalDocument,
  deleteMedicalDocument,
  getPrescriptions,
  getPatientHealthHistory,
  updatePatientHealthHistory,
  getMyReviews,
  createDoctorReview,
  updateDoctorReview,
} from '../api';

const EMPTY_HEALTH_HISTORY = {
  medical_conditions: '',
  allergies: '',
  current_medications: '',
  past_surgeries: '',
  family_medical_history: '',
  additional_notes: '',
};

export default function Records() {
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [healthHistory, setHealthHistory] = useState(EMPTY_HEALTH_HISTORY);
  const [healthHistoryLoading, setHealthHistoryLoading] = useState(true);
  const [healthHistorySaving, setHealthHistorySaving] = useState(false);
  const [healthHistoryError, setHealthHistoryError] = useState('');
  const [healthHistorySuccess, setHealthHistorySuccess] = useState('');
  const [healthHistoryLoaded, setHealthHistoryLoaded] = useState(false);

  const [loading, setLoading] = useState(true);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [prescriptionsLoading, setPrescriptionsLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const [error, setError] = useState('');
  const [documentError, setDocumentError] = useState('');
  const [prescriptionError, setPrescriptionError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');
  const [success, setSuccess] = useState('');

  const [tab, setTab] = useState('Overview');
  const [reloadKey, setReloadKey] = useState(0);

  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('Prescription');
  const [selectedFile, setSelectedFile] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [previewUrl, setPreviewUrl] = useState('');
  const [previewName, setPreviewName] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [reviewFormAppointmentId, setReviewFormAppointmentId] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const previewUrlRef = useRef('');
  const previewContainerRef = useRef(null);

  const tabs = [
    { name: 'Overview', icon: ClipboardList },
    { name: 'Health History', icon: HeartPulse },
    { name: 'Digital Prescriptions', icon: FileText },
    { name: 'Documents', icon: FolderOpen },
    { name: 'Consultations', icon: CalendarDays },
    { name: 'Consent', icon: ShieldCheck },
  ];

  const getResponseList = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.prescriptions)) return data.prescriptions;
    return [];
  };

  useEffect(() => {
    let active = true;

    async function loadAppointments() {
      try {
        setLoading(true);
        setError('');
        const data = await getAppointments();

        if (active) {
          setAppointments(Array.isArray(data) ? data : data.results || []);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to load your consultations.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAppointments();
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;

    async function loadDocuments() {
      try {
        setDocumentsLoading(true);
        setDocumentError('');
        const data = await getMedicalDocuments();

        if (active) {
          setDocuments(Array.isArray(data) ? data : data.results || []);
        }
      } catch (err) {
        if (active) {
          setDocumentError(err.message || 'Unable to load your medical documents.');
        }
      } finally {
        if (active) setDocumentsLoading(false);
      }
    }

    loadDocuments();
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;

    async function loadPrescriptions() {
      try {
        setPrescriptionsLoading(true);
        setPrescriptionError('');
        const data = await getPrescriptions();

        if (active) setPrescriptions(getResponseList(data));
      } catch (err) {
        if (active) {
          setPrescriptionError(err.message || 'Unable to load your digital prescriptions.');
        }
      } finally {
        if (active) setPrescriptionsLoading(false);
      }
    }

    loadPrescriptions();
    return () => { active = false; };
  }, [reloadKey]);

  // =========================================
  // PATIENT REVIEWS
  // =========================================

  useEffect(() => {
    let active = true;

    async function loadReviews() {
      try {
        setReviewsLoading(true);
        setReviewError('');

        const data = await getMyReviews();

        if (active) {
          setReviews(getResponseList(data));
        }
      } catch (err) {
        if (active) {
          setReviewError(err.message || 'Unable to load your reviews.');
        }
      } finally {
        if (active) setReviewsLoading(false);
      }
    }

    loadReviews();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  // =========================================
  // PATIENT HEALTH HISTORY
  // =========================================

  useEffect(() => {
    let active = true;

    async function loadHealthHistory() {
      try {
        setHealthHistoryLoading(true);
        setHealthHistoryError('');
        setHealthHistorySuccess('');

        const data = await getPatientHealthHistory();

        if (active) {
          setHealthHistory({
            medical_conditions: data.medical_conditions || '',
            allergies: data.allergies || '',
            current_medications: data.current_medications || '',
            past_surgeries: data.past_surgeries || '',
            family_medical_history: data.family_medical_history || '',
            additional_notes: data.additional_notes || '',
          });
          setHealthHistoryLoaded(true);
        }
      } catch (err) {
        if (active) {
          setHealthHistoryError(
            err.message || 'Unable to load your health history.'
          );
          setHealthHistoryLoaded(false);
        }
      } finally {
        if (active) setHealthHistoryLoading(false);
      }
    }

    loadHealthHistory();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        window.URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = '';
      }
    };
  }, []);

  useEffect(() => {
    if (previewUrl && previewContainerRef.current) {
      previewContainerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [previewUrl]);

  const refreshRecords = () => setReloadKey((key) => key + 1);

  const handleHealthHistoryChange = (field, value) => {
    setHealthHistory((current) => ({
      ...current,
      [field]: value,
    }));

    setHealthHistorySuccess('');
    setHealthHistoryError('');
  };

  const handleHealthHistorySave = async (event) => {
    event.preventDefault();

    try {
      setHealthHistorySaving(true);
      setHealthHistoryError('');
      setHealthHistorySuccess('');

      const data = await updatePatientHealthHistory(healthHistory);

      setHealthHistory({
        medical_conditions: data.medical_conditions || '',
        allergies: data.allergies || '',
        current_medications: data.current_medications || '',
        past_surgeries: data.past_surgeries || '',
        family_medical_history: data.family_medical_history || '',
        additional_notes: data.additional_notes || '',
      });

      setHealthHistoryLoaded(true);
      setHealthHistorySuccess('Your health history has been saved successfully.');
    } catch (err) {
      setHealthHistoryError(
        err.message || 'Unable to save your health history. Please try again.'
      );
    } finally {
      setHealthHistorySaving(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Date not available';
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return 'Date not available';
    return parsedDate.toLocaleDateString();
  };

  const formatDateTime = (date, time) => {
    if (!date) return 'Date not available';
    return time ? `${formatDate(date)} · ${time}` : formatDate(date);
  };

  const getPrescriptionAppointmentDate = (prescription) => (
    prescription.appointment_date ||
    prescription.appointment?.preferred_date ||
    prescription.appointment?.appointment_date ||
    prescription.preferred_date ||
    null
  );

  const getPrescriptionAppointmentTime = (prescription) => (
    prescription.appointment_time ||
    prescription.appointment?.preferred_time ||
    prescription.appointment?.appointment_time ||
    prescription.preferred_time ||
    ''
  );

  const getPrescriptionDoctor = (prescription) => (
    prescription.doctor_name ||
    prescription.provider_name ||
    prescription.doctor?.name ||
    'Healthcare provider'
  );

  const getPrescriptionItems = (prescription) => (
    Array.isArray(prescription.items) ? prescription.items : []
  );

  const getStatusClass = (status) => {
    const normalized = String(status || '')
      .toLowerCase()
      .replace(/[\s\_-]+/g, '');

    switch (normalized) {
      case 'confirmed': return 'status-confirmed';
      case 'pending': return 'status-pending';
      case 'cancelled':
      case 'canceled':
      case 'rejected': return 'status-cancelled';
      case 'completed': return 'status-completed';
      default: return 'status-default';
    }
  };

  const formatStatus = (status) => {
    if (!status) return 'Unknown';
    return String(status)
      .replace(/[\_-]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });

  // =========================================
  // REVIEW HELPERS
  // =========================================

  const getReviewForAppointment = (appointmentId) => (
    reviews.find(
      (review) =>
        String(review.appointment?.id ?? review.appointment) ===
        String(appointmentId)
    )
  );

  const openReviewForm = (appointment, existingReview = null) => {
    setReviewError('');
    setReviewSuccess('');

    setReviewFormAppointmentId(appointment.id);
    setReviewRating(existingReview?.rating || 5);
    setReviewComment(existingReview?.comment || '');
  };

  const closeReviewForm = () => {
    if (reviewSaving) return;

    setReviewFormAppointmentId(null);
    setReviewRating(5);
    setReviewComment('');
    setReviewError('');
  };

  const handleReviewSubmit = async (event, appointment) => {
    event.preventDefault();

    if (!appointment?.id) {
      setReviewError('Unable to identify this consultation.');
      return;
    }

    if (reviewRating < 1 || reviewRating > 5) {
      setReviewError('Please select a rating between 1 and 5 stars.');
      return;
    }

    const existingReview = getReviewForAppointment(appointment.id);

    try {
      setReviewSaving(true);
      setReviewError('');
      setReviewSuccess('');

      let savedReview;

      if (existingReview) {
        savedReview = await updateDoctorReview(existingReview.id, {
          rating: reviewRating,
          comment: reviewComment.trim(),
        });
      } else {
        savedReview = await createDoctorReview({
          appointment: appointment.id,
          rating: reviewRating,
          comment: reviewComment.trim(),
        });
      }

      setReviews((current) => {
        const withoutOldReview = current.filter(
          (item) => item.id !== savedReview.id
        );

        return [savedReview, ...withoutOldReview];
      });

      setReviewFormAppointmentId(null);
      setReviewRating(5);
      setReviewComment('');

      setReviewSuccess(
        existingReview
          ? 'Your review was updated and sent for approval again.'
          : 'Thank you! Your review was submitted and is awaiting approval.'
      );
    } catch (err) {
      setReviewError(err.message || 'Unable to submit your review.');
    } finally {
      setReviewSaving(false);
    }
  };

  const renderReviewAction = (appointment) => {
    const isCompleted =
      String(appointment.status || '').toLowerCase() === 'completed';

    if (!isCompleted) return null;

    const existingReview = getReviewForAppointment(appointment.id);
    const isFormOpen =
      String(reviewFormAppointmentId) === String(appointment.id);

    return (
      <div className="records-review-area">
        {existingReview && !isFormOpen && (
          <div className="records-review-summary">
            <div className="records-review-summary-heading">
              <span>
                <Star size={15} />
                Your rating: {existingReview.rating}/5
              </span>
              <span className={`status-pill ${
                existingReview.moderation_status === 'Approved'
                  ? 'status-confirmed'
                  : existingReview.moderation_status === 'Rejected'
                    ? 'status-cancelled'
                    : 'status-pending'
              }`}>
               {formatStatus(existingReview.moderation_status || 'Pending')}
              </span>
            </div>

            {existingReview.comment && (
              <p>{existingReview.comment}</p>
            )}

            {existingReview.moderation_status === 'Rejected' &&
              existingReview.moderation_note && (
                <small>
                  Review feedback: {existingReview.moderation_note}
                </small>
              )}

            <button
              type="button"
              className="records-secondary-button records-review-edit-button"
              onClick={() => openReviewForm(appointment, existingReview)}
              disabled={reviewSaving}
            >
              <Pencil size={15} />
              Edit review
            </button>
          </div>
        )}

        {!existingReview && !isFormOpen && (
          <button
            type="button"
            className="records-secondary-button records-review-open-button"
            onClick={() => openReviewForm(appointment)}
            disabled={reviewsLoading}
          >
            <Star size={16} />
            Rate this consultation
          </button>
        )}

        {isFormOpen && (
          <form
            className="records-review-form"
            onSubmit={(event) => handleReviewSubmit(event, appointment)}
          >
            <div className="records-review-form-heading">
              <div>
                <b>{existingReview ? 'Edit your review' : 'Rate your consultation'}</b>
                <small>Your feedback helps other patients make informed choices.</small>
              </div>

              <button
                type="button"
                className="records-review-close"
                onClick={closeReviewForm}
                disabled={reviewSaving}
                aria-label="Close review form"
              >
                <X size={17} />
              </button>
            </div>

            <label className="records-review-rating-label">
              Your rating
            </label>

            <div className="records-review-stars" role="group" aria-label="Choose a rating">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  type="button"
                  key={rating}
                  className={
                    rating <= reviewRating
                      ? 'records-review-star active'
                      : 'records-review-star'
                  }
                  onClick={() => setReviewRating(rating)}
                  aria-label={`${rating} ${rating === 1 ? 'star' : 'stars'}`}
                  aria-pressed={reviewRating === rating}
                  disabled={reviewSaving}
                >
                  <Star size={25} fill={rating <= reviewRating ? 'currentColor' : 'none'} />
                </button>
              ))}
              <span>{reviewRating} out of 5</span>
            </div>

            <label htmlFor={`review-comment-${appointment.id}`}>
              Comment <span>(optional)</span>
            </label>

            <textarea
              id={`review-comment-${appointment.id}`}
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value)}
              placeholder="Share your experience with this consultation. Please do not include private medical details."
              rows={4}
              maxLength={2000}
              disabled={reviewSaving}
            />

            <div className="records-review-form-footer">
              <small>{reviewComment.length}/2000 characters</small>

              <div>
                <button
                  type="button"
                  className="records-secondary-button"
                  onClick={closeReviewForm}
                  disabled={reviewSaving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="records-health-save-button"
                  disabled={reviewSaving}
                >
                  {reviewSaving ? (
                    <>
                      <RefreshCw size={15} />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Star size={15} />
                      {existingReview ? 'Update review' : 'Submit review'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    );
  };

  const appointmentRow = (appointment, showReview = false) => {
    const providerName =
      appointment.provider_name ||
      appointment.provider?.name ||
      appointment.doctor_name ||
      appointment.doctor?.name ||
      appointment.provider?.provider_name ||
      'Healthcare provider';

    const appointmentDate =
      appointment.preferred_date ||
      appointment.appointment_date ||
      appointment.date;

    const appointmentTime =
      appointment.preferred_time ||
      appointment.appointment_time ||
      appointment.time ||
      '';

    const appointmentType =
      appointment.consultation_type ||
      appointment.appointment_type ||
      '';

    return (
      <div className="appointment-row" key={appointment.id}>
        <span className="service-icon mint">
          <CalendarDays />
        </span>

        <div>
          <b>{providerName}</b>
          <small>{formatDateTime(appointmentDate, appointmentTime)}</small>
          {appointmentType && <small>{formatStatus(appointmentType)}</small>}
          {appointment.reason && <small>{appointment.reason}</small>}

          {showReview && renderReviewAction(appointment)}
        </div>

        <span className={`status-pill ${getStatusClass(appointment.status)}`}>
          {formatStatus(appointment.status)}
        </span>
      </div>
    );
  };

  // =========================================
  // PRINT DIGITAL PRESCRIPTION
  // =========================================

  const printPrescription = (prescription) => {
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      setPrescriptionError(
        'Your browser blocked the print window. Please allow pop-ups and try again.'
      );
      return;
    }

    const items = getPrescriptionItems(prescription);
    const heartLogo = renderToStaticMarkup(
      <HeartHandshake size={27} strokeWidth={1.8} />
    );

    const doctor = getPrescriptionDoctor(prescription);
    const appointmentDate = getPrescriptionAppointmentDate(prescription);
    const appointmentTime = getPrescriptionAppointmentTime(prescription);

    const patientName =
      prescription.patient_name ||
      prescription.patient?.name ||
      'Patient';

    const specialty =
      prescription.specialty ||
      prescription.doctor?.specialty ||
      prescription.provider_name ||
      '';

    const medicineRows = items.length
      ? items.map((item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>
              <strong>${escapeHtml(item.medicine_name)}</strong>
              ${item.strength ? `<small>${escapeHtml(item.strength)}</small>` : ''}
            </td>
            <td>${escapeHtml(item.dosage || '—')}</td>
            <td>${escapeHtml(item.route || '—')}</td>
            <td>${escapeHtml(item.frequency || '—')}</td>
            <td>${escapeHtml(item.duration || '—')}</td>
            <td>${escapeHtml(item.quantity || '—')}</td>
          </tr>
          ${item.instructions ? `
            <tr class="medicine-note">
              <td></td>
              <td colspan="6">
                <strong>Medicine instructions:</strong>
                ${escapeHtml(item.instructions)}
              </td>
            </tr>
          ` : ''}
        `).join('')
      : '<tr><td colspan="7">No medicine details available.</td></tr>';

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Prescription ${escapeHtml(prescription.id)} - Nepal Virtual Care</title>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            * { box-sizing: border-box; }
            @page { size: A4; margin: 15mm; }
            body {
              margin: 0;
              padding: 28px;
              background: #eef3f5;
              color: #26384b;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 13px;
              line-height: 1.55;
            }
            .sheet {
              max-width: 850px;
              margin: auto;
              padding: 38px 42px;
              background: white;
              border: 1px solid #e0e8eb;
              border-radius: 12px;
            }
            header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 20px;
              padding-bottom: 22px;
              border-bottom: 2px solid #176b55;
            }
            .brand { display: flex; align-items: center; gap: 13px; }
            .brand-mark {
              display: grid;
              place-items: center;
              width: 47px;
              height: 47px;
              border-radius: 12px;
              background: #e5f3ed;
              color: #176b55;
            }
            .brand-mark svg { width: 27px; height: 27px; }
            .brand-name {
              margin: 0;
              color: #176b55;
              font-size: 23px;
              font-weight: 800;
            }
            .subtitle { color: #718096; font-size: 11px; }
            .document-label { text-align: right; }
            .document-label strong {
              display: block;
              font-size: 14px;
              letter-spacing: 1px;
              text-transform: uppercase;
            }
            .document-label span { color: #718096; font-size: 10px; }
            .meta {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin: 22px 0;
              padding: 12px 15px;
              border: 1px solid #e2e9ed;
              border-radius: 8px;
              background: #f8fafb;
              font-size: 11px;
            }
            .correction {
              margin-bottom: 18px;
              padding: 9px 12px;
              border: 1px solid #f1d5a6;
              border-radius: 6px;
              background: #fff9ed;
              color: #925b16;
              font-weight: 700;
            }
            h2 {
              margin: 0 0 11px;
              font-size: 13px;
            }
            .section { margin-bottom: 23px; }
            .section-title {
              color: #176b55;
              letter-spacing: .6px;
              text-transform: uppercase;
            }
            .patient-details {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px 25px;
              padding: 17px;
              border: 1px solid #dfe8e9;
              border-radius: 9px;
            }
            .detail-label {
              display: block;
              margin-bottom: 4px;
              color: #8190a1;
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
            }
            .detail-value { font-weight: 700; overflow-wrap: anywhere; }
            .diagnosis {
              padding: 16px 18px;
              border-left: 4px solid #176b55;
              border-radius: 5px;
              background: #f0f7f3;
            }
            .diagnosis h2 { color: #176b55; }
            p { white-space: pre-wrap; overflow-wrap: anywhere; }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              font-size: 10px;
            }
            th {
              padding: 10px 7px;
              background: #edf4f1;
              color: #315c4e;
              text-align: left;
              font-size: 9px;
            }
            td {
              padding: 10px 7px;
              border-bottom: 1px solid #e8edf0;
              vertical-align: top;
              overflow-wrap: anywhere;
            }
            td small { display: block; color: #718096; }
            .medicine-note td { background: #fafcfc; font-size: 10px; }
            .instructions {
              padding: 15px 17px;
              border: 1px solid #dce9e2;
              border-radius: 8px;
              background: #f8fbf9;
            }
            .signature {
              display: flex;
              justify-content: flex-end;
              margin-top: 65px;
              page-break-inside: avoid;
            }
            .signature-block { width: 235px; text-align: center; }
            .signature-line {
              height: 1px;
              margin-bottom: 9px;
              background: #9aa8b5;
            }
            .signature-name { font-weight: 700; }
            .signature-role, .signature-note { color: #718096; font-size: 10px; }
            footer {
              margin-top: 35px;
              padding-top: 13px;
              border-top: 1px solid #e1e8eb;
              color: #8290a0;
              font-size: 9px;
              text-align: center;
            }
            footer strong { display: block; color: #176b55; }
            @media screen and (max-width: 650px) {
              body { padding: 10px; }
              .sheet { padding: 22px 16px; }
              header { align-items: flex-start; flex-direction: column; }
              .document-label { text-align: left; }
              .patient-details { grid-template-columns: 1fr; }
              .meta { flex-direction: column; }
              .section table { min-width: 600px; }
              .section:has(table) { overflow-x: auto; }
            }
            @media print {
              body { padding: 0; background: white; print-color-adjust: exact; }
              .sheet { max-width: none; padding: 0; border: 0; border-radius: 0; }
              header, .patient-details, .diagnosis, .section, .signature {
                break-inside: avoid;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <main class="sheet">
            <header>
              <div class="brand">
                <div class="brand-mark">${heartLogo}</div>
                <div>
                  <h1 class="brand-name">Nepal Virtual Care</h1>
                  <div class="subtitle">Your healthcare, connected.</div>
                </div>
              </div>
              <div class="document-label">
                <strong>Medical Prescription</strong>
                <span>Digital prescription document</span>
              </div>
            </header>

            <div class="meta">
              <span>Prescription ID: <strong>#${escapeHtml(prescription.id)}</strong></span>
              <span>Issued: <strong>${escapeHtml(formatDate(prescription.issued_at))}</strong></span>
            </div>

            ${prescription.replaces_id ? `
              <div class="correction">
                Corrected prescription · Replaces prescription #${escapeHtml(prescription.replaces_id)}
              </div>
            ` : ''}

            <section class="section">
              <h2 class="section-title">Patient and consultation details</h2>
              <div class="patient-details">
                <div>
                  <span class="detail-label">Patient</span>
                  <span class="detail-value">${escapeHtml(patientName)}</span>
                </div>
                <div>
                  <span class="detail-label">Prescribing doctor</span>
                  <span class="detail-value">${escapeHtml(doctor)}</span>
                </div>
                <div>
                  <span class="detail-label">Specialty</span>
                  <span class="detail-value">${escapeHtml(specialty || 'Not provided')}</span>
                </div>
                <div>
                  <span class="detail-label">Consultation date</span>
                  <span class="detail-value">${escapeHtml(formatDateTime(appointmentDate, appointmentTime))}</span>
                </div>
              </div>
            </section>

            <section class="section diagnosis">
              <h2>Diagnosis</h2>
              <p>${escapeHtml(prescription.diagnosis || 'Not provided')}</p>
            </section>

            ${prescription.clinical_notes ? `
              <section class="section">
                <h2>Clinical notes</h2>
                <p>${escapeHtml(prescription.clinical_notes)}</p>
              </section>
            ` : ''}

            <section class="section">
              <h2>Prescribed medicines (${items.length})</h2>
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Medicine</th><th>Dosage</th><th>Route</th>
                    <th>Frequency</th><th>Duration</th><th>Quantity</th>
                  </tr>
                </thead>
                <tbody>${medicineRows}</tbody>
              </table>
            </section>

            ${prescription.instructions ? `
              <section class="section instructions">
                <h2>Instructions for the patient</h2>
                <p>${escapeHtml(prescription.instructions)}</p>
              </section>
            ` : ''}

            <section class="signature">
              <div class="signature-block">
                <div class="signature-line"></div>
                <div class="signature-name">${escapeHtml(doctor)}</div>
                <div class="signature-role">${escapeHtml(specialty || 'Prescribing doctor')}</div>
                <div class="signature-note">Doctor's signature</div>
              </div>
            </section>

            <footer>
              <strong>Nepal Virtual Care</strong>
              This digital prescription was issued through Nepal Virtual Care.
              Please retain this document for your medical records.
              <br />
              This document does not replace any required authenticated medical
              signature or professional registration details.
            </footer>
          </main>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  // =========================================
  // MEDICAL DOCUMENT ACTIONS
  // =========================================

  const handleUpload = async (event) => {
    event.preventDefault();
    setDocumentError('');
    setSuccess('');

    if (!title.trim()) {
      setDocumentError('Please enter a document title.');
      return;
    }

    if (!selectedFile) {
      setDocumentError('Please select a file to upload.');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setDocumentError('File size cannot exceed 5 MB.');
      return;
    }

    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    const extension = selectedFile.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      setDocumentError('Only PDF, JPG, JPEG and PNG files are allowed.');
      return;
    }

    try {
      setUploading(true);

      await uploadMedicalDocument({
        title: title.trim(),
        document_type: documentType,
        file: selectedFile,
      });

      setTitle('');
      setDocumentType('Prescription');
      setSelectedFile(null);

      const fileInput = window.document.getElementById('medical-document-file');
      if (fileInput) fileInput.value = '';

      const data = await getMedicalDocuments();
      setDocuments(Array.isArray(data) ? data : data.results || []);
      setSuccess('Your medical document was uploaded successfully.');
    } catch (err) {
      setDocumentError(err.message || 'Unable to upload your document.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (document) => {
    try {
      setDocumentError('');
      setDownloadingId(document.id);

      const blob = await downloadMedicalDocument(document.id);
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');

      link.href = url;
      link.download = document.file_name || 'medical-document';

      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDocumentError(err.message || 'Unable to download this document.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePreview = async (document) => {
    try {
      setDocumentError('');
      setSuccess('');
      setPreviewLoading(true);

      if (previewUrlRef.current) {
        window.URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = '';
      }

      setPreviewUrl('');
      setPreviewName('');

      const blob = await previewMedicalDocument(document.id);

      if (!blob || blob.size === 0) {
        throw new Error('The downloaded document is empty.');
      }

      if (!blob.type.startsWith('image/')) {
        throw new Error('Preview is currently available for images only.');
      }

      const url = window.URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewName(document.title);
      setPreviewUrl(url);
    } catch (err) {
      setDocumentError(err.message || 'Unable to preview this document.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrlRef.current) {
      window.URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }

    setPreviewUrl('');
    setPreviewName('');
  };

  const handleDelete = async (documentId) => {
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete this medical document?'
    );

    if (!confirmed) return;

    try {
      setDocumentError('');
      setSuccess('');
      setDeletingId(documentId);

      await deleteMedicalDocument(documentId);
      setDocuments((current) => current.filter((item) => item.id !== documentId));
      setSuccess('Medical document deleted successfully.');
    } catch (err) {
      setDocumentError(err.message || 'Unable to delete this document.');
    } finally {
      setDeletingId(null);
    }
  };

  // =========================================
  // DIGITAL PRESCRIPTION CARD
  // =========================================

  const renderPrescription = (prescription) => {
    const items = getPrescriptionItems(prescription);
    const appointmentDate = getPrescriptionAppointmentDate(prescription);
    const appointmentTime = getPrescriptionAppointmentTime(prescription);
    const doctor = getPrescriptionDoctor(prescription);

    return (
      <article className="record-panel digital-prescription-card" key={prescription.id}>
        <div className="records-prescription-top">
          <div className="records-prescription-title">
            <span className="records-icon-box">
              <FileText size={19} />
            </span>
            <div>
              <h3>Prescription #{prescription.id}</h3>
              <small>Issued {formatDate(prescription.issued_at)}</small>
            </div>
          </div>

          {prescription.replaces_id && (
            <span className="status-pill status-confirmed">
              Corrected prescription
            </span>
          )}
        </div>

        <div className="digital-prescription-doctor">
          <span className="service-icon mint"><Stethoscope /></span>
          <div>
            <b>{doctor}</b>
            <small>
              {prescription.specialty || prescription.provider_name || 'Healthcare provider'}
            </small>
            <small>
              Consultation: {formatDateTime(appointmentDate, appointmentTime)}
            </small>
          </div>
        </div>

        <div className="digital-prescription-diagnosis">
          <h4>Diagnosis</h4>
          <p>{prescription.diagnosis || 'No diagnosis provided.'}</p>
        </div>

        {prescription.clinical_notes && (
          <div className="digital-prescription-notes">
            <h4>Clinical notes</h4>
            <p>{prescription.clinical_notes}</p>
          </div>
        )}

        <div className="digital-prescription-medicines">
          <h4><Pill size={17} /> Prescribed medicines ({items.length})</h4>

          {items.length ? (
            <div className="digital-prescription-medicine-list">
              {items.map((item, index) => (
                <div
                  className="digital-prescription-medicine"
                  key={item.id || `${prescription.id}-${index}`}
                >
                  <div className="digital-prescription-medicine-heading">
                    <b>{index + 1}. {item.medicine_name}</b>
                    {item.strength && <span>{item.strength}</span>}
                  </div>

                  <div className="digital-prescription-medicine-details">
                    <div><small>Dosage</small><b>{item.dosage || '—'}</b></div>
                    <div><small>Route</small><b>{item.route || '—'}</b></div>
                    <div><small>Frequency</small><b>{item.frequency || '—'}</b></div>
                    <div><small>Duration</small><b>{item.duration || '—'}</b></div>
                    {item.quantity && <div><small>Quantity</small><b>{item.quantity}</b></div>}
                  </div>

                  {item.instructions && (
                    <p className="digital-prescription-medicine-instructions">
                      <strong>Instructions:</strong> {item.instructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No medicine details are available.</p>
          )}
        </div>

        {prescription.instructions && (
          <div className="digital-prescription-notes">
            <h4>Instructions from your doctor</h4>
            <p>{prescription.instructions}</p>
          </div>
        )}

        <div className="digital-prescription-footer">
          <span><ShieldCheck size={16} /> Issued by your healthcare provider</span>
          <button
            type="button"
            onClick={() => printPrescription(prescription)}
            className="digital-prescription-print-button"
          >
            <Printer size={16} />
            Print / Save PDF
          </button>
        </div>
      </article>
    );
  };

  return (
    <section className="records-page">
      <header className="records-page-header">
        <div className="records-header-brand">
          <span className="records-header-logo">
            <HeartHandshake size={25} />
          </span>
          <span>MY HEALTH SPACE</span>
        </div>

        <div className="records-header-copy">
          <span className="eyebrow">YOUR HEALTH, ORGANIZED</span>
          <h1>My Health <em>Records.</em></h1>
          <p>
            Your health history, consultations, prescriptions and medical
            documents, together in one secure place.
          </p>
        </div>

        <div className="records-header-note">
          <ShieldCheck size={18} />
          <span>Your personal health information</span>
        </div>
      </header>

      <div className="records-main">
        <div className="records-welcome">
          <div className="records-welcome-icon">
            <HeartHandshake size={25} />
          </div>
          <div>
            <h2>Your care records</h2>
            <p>Keep track of your healthcare journey in one place.</p>
          </div>
          <button
            type="button"
            className="records-refresh-button"
            onClick={refreshRecords}
            disabled={
              loading ||
              documentsLoading ||
              prescriptionsLoading ||
              healthHistoryLoading ||
              reviewsLoading
            }
          >
            <RefreshCw size={16} />
            Refresh records
          </button>
        </div>

        <nav className="records-tabs" aria-label="Health record sections">
          {tabs.map(({ name, icon: Icon }) => (
            <button
              type="button"
              key={name}
              className={tab === name ? 'active' : ''}
              onClick={() => {
                setTab(name);
                setDocumentError('');
                setPrescriptionError('');
                setHealthHistoryError('');
                setHealthHistorySuccess('');
                setReviewError('');
                setReviewSuccess('');
                setSuccess('');
              }}
            >
              <Icon size={17} />
              <span>{name}</span>
            </button>
          ))}
        </nav>

        {error && (
          <div className="records-alert records-alert-error">
            <p>{error}</p>
            <button type="button" onClick={refreshRecords}>Try again</button>
          </div>
        )}

        {/* OVERVIEW */}

        {tab === 'Overview' && (
          <>
            <div className="records-section-heading">
              <div>
                <span className="records-section-kicker">AT A GLANCE</span>
                <h2>Your health overview</h2>
                <p>A quick look at your records and recent activity.</p>
              </div>
            </div>

            <div className="records-stats-grid">
              <button type="button" className="records-stat-card" onClick={() => setTab('Health History')}>
                <span className="records-stat-icon records-stat-green"><HeartPulse /></span>
                <span className="records-stat-label">Health history</span>
                <strong>{healthHistoryLoading ? '...' : healthHistoryLoaded ? 'Available' : '—'}</strong>
                <span className="records-stat-link">View history <ArrowRight size={14} /></span>
              </button>

              <button type="button" className="records-stat-card" onClick={() => setTab('Consultations')}>
                <span className="records-stat-icon records-stat-blue"><CalendarDays /></span>
                <span className="records-stat-label">Consultations</span>
                <strong>{loading ? '...' : appointments.length}</strong>
                <span className="records-stat-link">View history <ArrowRight size={14} /></span>
              </button>

              <button type="button" className="records-stat-card" onClick={() => setTab('Digital Prescriptions')}>
                <span className="records-stat-icon records-stat-purple"><ClipboardList /></span>
                <span className="records-stat-label">Digital prescriptions</span>
                <strong>{prescriptionsLoading ? '...' : prescriptions.length}</strong>
                <span className="records-stat-link">View prescriptions <ArrowRight size={14} /></span>
              </button>
            </div>

            <div className="records-overview-grid">
              <section className="record-panel records-overview-panel">
                <div className="records-panel-heading">
                  <div>
                    <span className="records-section-kicker">YOUR ACTIVITY</span>
                    <h3>Recent consultations</h3>
                  </div>
                  <button type="button" onClick={() => setTab('Consultations')}>
                    View all <ArrowRight size={15} />
                  </button>
                </div>

                {loading ? (
                  <div className="records-loading"><RefreshCw size={17} /> Loading consultations...</div>
                ) : appointments.length ? (
                  <div className="records-appointment-list">
                    {appointments.slice(0, 3).map((appointment) => appointmentRow(appointment))}
                  </div>
                ) : (
                  <div className="records-empty">
                    <CalendarDays size={25} />
                    <b>No consultations yet</b>
                    <p>Your appointment history will appear here.</p>
                    <Link to="/virtual-care">Find a healthcare provider <ArrowRight size={15} /></Link>
                  </div>
                )}
              </section>

              <section className="record-panel records-overview-panel">
                <div className="records-panel-heading">
                  <div>
                    <span className="records-section-kicker">YOUR FILES</span>
                    <h3>Health documents</h3>
                  </div>
                  <span className="records-panel-icon"><FolderOpen size={19} /></span>
                </div>

                <p className="records-panel-description">
                  Your uploaded reports, prescriptions and other medical files.
                </p>

                <div className="records-overview-link">
                  <span className="records-overview-link-icon"><FileText size={18} /></span>
                  <div>
                    <b>Medical documents</b>
                    <small>{documentsLoading ? 'Loading...' : `${documents.length} document(s) stored`}</small>
                  </div>
                  <button type="button" onClick={() => setTab('Documents')} aria-label="View documents">
                    <ArrowRight size={18} />
                  </button>
                </div>

                <div className="records-overview-link">
                  <span className="records-overview-link-icon"><ClipboardList size={18} /></span>
                  <div>
                    <b>Digital prescriptions</b>
                    <small>{prescriptionsLoading ? 'Loading...' : `${prescriptions.length} prescription(s) issued`}</small>
                  </div>
                  <button type="button" onClick={() => setTab('Digital Prescriptions')} aria-label="View prescriptions">
                    <ArrowRight size={18} />
                  </button>
                </div>
              </section>
            </div>
          </>
        )}

        {/* HEALTH HISTORY */}

        {tab === 'Health History' && (
          <section className="record-panel tab-panel records-tab-content">
            <div className="records-panel-heading">
              <div>
                <span className="records-section-kicker">YOUR PERSONAL HEALTH INFORMATION</span>
                <h2>Health history</h2>
                <p>
                  Keep important medical information up to date so your
                  authorized healthcare providers can understand your history.
                </p>
              </div>
              <span className="records-panel-icon"><HeartPulse size={21} /></span>
            </div>

            <div className="records-health-history-notice">
              <ShieldCheck size={19} />
              <p>
                This information belongs to you. You can update it whenever
                something changes. Authorized doctors can view it when they
                are treating you.
              </p>
            </div>

            {healthHistoryError && (
              <div className="records-alert records-alert-error">
                <AlertCircle size={17} />
                <p>{healthHistoryError}</p>
                <button
                  type="button"
                  onClick={() => setHealthHistoryError('')}
                >
                  Dismiss
                </button>
              </div>
            )}

            {healthHistorySuccess && (
              <div className="records-alert records-alert-success">
                <CheckCircle2 size={17} />
                <p>{healthHistorySuccess}</p>
                <button
                  type="button"
                  onClick={() => setHealthHistorySuccess('')}
                >
                  Dismiss
                </button>
              </div>
            )}

            {healthHistoryLoading ? (
              <div className="records-empty">
                <RefreshCw size={24} />
                <p>Loading your health history...</p>
              </div>
            ) : (
              <form
                className="records-health-history-form"
                onSubmit={handleHealthHistorySave}
              >
                <div className="records-health-history-grid">
                  <div className="records-health-field">
                    <label htmlFor="health-medical-conditions">
                      <Activity size={17} />
                      Medical conditions
                    </label>
                    <p>Conditions you currently have or have been diagnosed with.</p>
                    <textarea
                      id="health-medical-conditions"
                      value={healthHistory.medical_conditions}
                      onChange={(event) => handleHealthHistoryChange('medical_conditions', event.target.value)}
                      placeholder="For example: asthma, diabetes, high blood pressure..."
                      rows={4}
                      maxLength={5000}
                    />
                  </div>

                  <div className="records-health-field">
                    <label htmlFor="health-allergies">
                      <AlertCircle size={17} />
                      Allergies
                    </label>
                    <p>Medicine, food or other allergies and known reactions.</p>
                    <textarea
                      id="health-allergies"
                      value={healthHistory.allergies}
                      onChange={(event) => handleHealthHistoryChange('allergies', event.target.value)}
                      placeholder="List known allergies and reactions. Write 'None known' if applicable."
                      rows={4}
                      maxLength={5000}
                    />
                  </div>

                  <div className="records-health-field">
                    <label htmlFor="health-current-medications">
                      <Pill size={17} />
                      Current medications
                    </label>
                    <p>Medicines you currently take, including dosage if known.</p>
                    <textarea
                      id="health-current-medications"
                      value={healthHistory.current_medications}
                      onChange={(event) => handleHealthHistoryChange('current_medications', event.target.value)}
                      placeholder="List your current medicines and dosages..."
                      rows={4}
                      maxLength={5000}
                    />
                  </div>

                  <div className="records-health-field">
                    <label htmlFor="health-past-surgeries">
                      <Stethoscope size={17} />
                      Past surgeries and procedures
                    </label>
                    <p>Previous operations, procedures and approximate dates.</p>
                    <textarea
                      id="health-past-surgeries"
                      value={healthHistory.past_surgeries}
                      onChange={(event) => handleHealthHistoryChange('past_surgeries', event.target.value)}
                      placeholder="Describe any previous surgeries or medical procedures..."
                      rows={4}
                      maxLength={5000}
                    />
                  </div>

                  <div className="records-health-field">
                    <label htmlFor="health-family-history">
                      <UserRound size={17} />
                      Family medical history
                    </label>
                    <p>Relevant health conditions among close family members.</p>
                    <textarea
                      id="health-family-history"
                      value={healthHistory.family_medical_history}
                      onChange={(event) => handleHealthHistoryChange('family_medical_history', event.target.value)}
                      placeholder="For example: family history of heart disease..."
                      rows={4}
                      maxLength={5000}
                    />
                  </div>

                  <div className="records-health-field">
                    <label htmlFor="health-additional-notes">
                      <FileText size={17} />
                      Additional notes
                    </label>
                    <p>Other health information you would like your doctor to know.</p>
                    <textarea
                      id="health-additional-notes"
                      value={healthHistory.additional_notes}
                      onChange={(event) => handleHealthHistoryChange('additional_notes', event.target.value)}
                      placeholder="Add any other relevant health information..."
                      rows={4}
                      maxLength={5000}
                    />
                  </div>
                </div>

                <div className="records-health-history-footer">
                  <span>
                    <ShieldCheck size={16} />
                    Your information is saved to your patient account.
                  </span>
                  <button
                    type="submit"
                    className="records-health-save-button"
                    disabled={healthHistorySaving || !healthHistoryLoaded}
                  >
                    {healthHistorySaving ? (
                      <>
                        <RefreshCw size={16} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save health history
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {/* DIGITAL PRESCRIPTIONS */}

        {tab === 'Digital Prescriptions' && (
          <section className="record-panel tab-panel records-tab-content">
            <div className="records-panel-heading">
              <div>
                <span className="records-section-kicker">PRESCRIPTION HISTORY</span>
                <h2>My digital prescriptions</h2>
                <p>Prescriptions issued to you by your healthcare providers.</p>
              </div>
              <button
                type="button"
                className="records-secondary-button"
                onClick={refreshRecords}
                disabled={prescriptionsLoading}
              >
                <RefreshCw size={16} /> Refresh
              </button>
            </div>

            {prescriptionError && (
              <div className="records-alert records-alert-error">
                <p>{prescriptionError}</p>
                <button type="button" onClick={refreshRecords}>Try again</button>
              </div>
            )}

            {prescriptionsLoading ? (
              <div className="records-empty"><RefreshCw /><p>Loading your digital prescriptions...</p></div>
            ) : prescriptions.length ? (
              <div className="digital-prescription-list">
                {prescriptions.map(renderPrescription)}
              </div>
            ) : (
              <div className="records-empty">
                <FileText size={28} />
                <b>No digital prescriptions yet</b>
                <p>Prescriptions issued by your doctor will appear here.</p>
              </div>
            )}
          </section>
        )}

        {/* DOCUMENTS */}

        {tab === 'Documents' && (
          <section className="record-panel tab-panel records-tab-content">
            <div className="records-panel-heading">
              <div>
                <span className="records-section-kicker">DOCUMENT LIBRARY</span>
                <h2>Medical documents</h2>
                <p>Upload and manage your personal medical documents.</p>
              </div>
              <span className="records-panel-icon"><FolderOpen size={20} /></span>
            </div>

            {documentError && (
              <div className="records-alert records-alert-error">
                <p>{documentError}</p>
                <button type="button" onClick={() => setDocumentError('')}>Dismiss</button>
              </div>
            )}

            {success && (
              <div className="records-alert records-alert-success">
                <p>{success}</p>
                <button type="button" onClick={() => setSuccess('')}>Dismiss</button>
              </div>
            )}

            {previewUrl && (
              <div ref={previewContainerRef} className="medical-preview records-preview">
                <div className="records-panel-heading">
                  <div>
                    <span className="records-section-kicker">DOCUMENT PREVIEW</span>
                    <h3>{previewName}</h3>
                  </div>
                  <button type="button" className="records-secondary-button" onClick={closePreview}>
                    Close preview
                  </button>
                </div>
                <img
                  key={previewUrl}
                  src={previewUrl}
                  alt={previewName}
                  onError={() => setDocumentError('The image could not be displayed.')}
                />
              </div>
            )}

            <div className="records-upload-layout">
              <div className="records-upload-intro">
                <span className="records-upload-icon"><Upload size={22} /></span>
                <h3>Add a medical document</h3>
                <p>
                  Keep your important health documents together.
                  You can upload PDF, JPG, JPEG or PNG files up to 5 MB.
                </p>
              </div>

              <form onSubmit={handleUpload} className="medical-upload-form records-upload-form">
                <div className="form-group">
                  <label htmlFor="medical-document-title">Document title</label>
                  <input
                    id="medical-document-title"
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Blood Test Report"
                    maxLength={160}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="medical-document-type">Document type</label>
                  <select
                    id="medical-document-type"
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value)}
                  >
                    <option value="Prescription">Prescription</option>
                    <option value="Lab Report">Lab Report</option>
                    <option value="Medical Certificate">Medical Certificate</option>
                    <option value="Imaging Report">Imaging Report</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group records-file-field">
                  <label htmlFor="medical-document-file">Choose a file</label>
                  <input
                    id="medical-document-file"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                    required
                  />
                  {selectedFile && <small>Selected: {selectedFile.name}</small>}
                </div>

                <button type="submit" disabled={uploading} className="records-upload-button">
                  {uploading ? <><RefreshCw size={16} /> Uploading...</> : <><Upload size={16} /> Upload document</>}
                </button>
              </form>
            </div>

            <div className="records-document-library">
              <div className="records-panel-heading">
                <div>
                  <span className="records-section-kicker">SAVED FILES</span>
                  <h3>Your uploaded documents</h3>
                </div>
                <span className="records-count">
                  {documentsLoading ? '...' : documents.length}
                </span>
              </div>

              {documentsLoading ? (
                <div className="records-loading"><RefreshCw size={17} /> Loading your documents...</div>
              ) : documents.length === 0 ? (
                <div className="records-empty">
                  <FolderOpen size={27} />
                  <b>Your document library is empty</b>
                  <p>Uploaded reports and documents will appear here.</p>
                </div>
              ) : (
                <div className="records-document-list">
                  {documents.map((document) => (
                    <article className="records-document-item" key={document.id}>
                      <span className="records-document-icon"><File size={21} /></span>

                      <div className="records-document-info">
                        <b>{document.title}</b>
                        <span>{document.document_type}</span>
                        <small>{document.file_name || 'Medical document'} · Uploaded {formatDate(document.uploaded_at)}</small>
                      </div>

                      <div className="medical-document-actions records-document-actions">
                        <button
                          type="button"
                          onClick={() => handlePreview(document)}
                          disabled={previewLoading}
                        >
                          <FileText size={16} />
                          {previewLoading ? 'Loading...' : 'View'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(document)}
                          disabled={downloadingId === document.id}
                        >
                          <Download size={16} />
                          {downloadingId === document.id ? 'Downloading...' : 'Download'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(document.id)}
                          disabled={deletingId === document.id}
                        >
                          <Trash2 size={16} />
                          {deletingId === document.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* CONSULTATIONS */}

        {tab === 'Consultations' && (
          <section className="record-panel tab-panel records-tab-content">
            <div className="records-panel-heading">
              <div>
                <span className="records-section-kicker">APPOINTMENT HISTORY</span>
                <h2>Consultation history</h2>
                <p>Your previous and upcoming consultation requests.</p>
              </div>
              <span className="records-panel-icon"><CalendarDays size={20} /></span>
            </div>

            {reviewError && (
              <div className="records-alert records-alert-error">
                <AlertCircle size={17} />
                <p>{reviewError}</p>
                <button type="button" onClick={() => setReviewError('')}>Dismiss</button>
              </div>
            )}

            {reviewSuccess && (
              <div className="records-alert records-alert-success">
                <CheckCircle2 size={17} />
                <p>{reviewSuccess}</p>
                <button type="button" onClick={() => setReviewSuccess('')}>Dismiss</button>
              </div>
            )}

            {reviewsLoading && (
              <div className="records-loading">
                <RefreshCw size={16} />
                Loading your review history...
              </div>
            )}

            {!reviewsLoading && reviewError && (
              <p className="records-review-help">
                Your consultation history is still available. Review information could not be loaded.
              </p>
            )}

            {loading ? (
              <div className="records-loading"><RefreshCw size={17} /> Loading your consultations...</div>
            ) : appointments.length ? (
              <div className="records-appointment-list">
                {appointments.map((appointment) => appointmentRow(appointment, true))}
              </div>
            ) : (
              <div className="records-empty">
                <Clock3 size={27} />
                <b>No consultation history yet</b>
                <p>Your consultation requests will appear here.</p>
                <Link to="/virtual-care">Browse healthcare providers <ArrowRight size={15} /></Link>
              </div>
            )}

            <div className="records-review-privacy-note">
              <ShieldCheck size={17} />
              <p>
                Reviews are checked before publication. Your name and appointment
                details are not displayed with public reviews. Please avoid
                including private medical information in your comment.
              </p>
            </div>
          </section>
        )}

        {/* CONSENT */}

        {tab === 'Consent' && (
          <section className="record-panel tab-panel records-tab-content">
            <div className="records-panel-heading">
              <div>
                <span className="records-section-kicker">PRIVACY & CONTROL</span>
                <h2>Privacy and consent</h2>
                <p>Understand where your consent preferences are managed.</p>
              </div>
              <span className="records-panel-icon"><ShieldCheck size={20} /></span>
            </div>

            <div className="records-consent-information">
              <span className="records-consent-icon"><ShieldCheck size={23} /></span>
              <div>
                <b>Consent preferences</b>
                <p>
                  Your actual consent preferences are managed separately.
                  This page does not assume that you have granted consent
                  or change any of your privacy settings.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
