
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  RefreshCw,
  Star,
  Stethoscope,
  Users,
  XCircle,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

import { getAdminAnalytics } from '../api';
import './AdminAnalytics.css';

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return getLocalDateString(date);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value) {
  if (!value) return '—';

  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function escapeCSV(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCSV(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCSV).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function StatCard({ icon: Icon, label, value, description, className = '' }) {
  return (
    <article className={`analytics-stat-card ${className}`}>
      <div className="analytics-stat-top">
        <span className="analytics-stat-label">{label}</span>
        <span className="analytics-stat-icon">
          <Icon size={20} />
        </span>
      </div>

      <strong className="analytics-stat-value">
        {formatNumber(value)}
      </strong>

      <span className="analytics-stat-description">{description}</span>
    </article>
  );
}

function TrendChart({ title, description, data, icon: Icon }) {
  const chartData = Array.isArray(data) ? data : [];
  const maxValue = Math.max(
    1,
    ...chartData.map((item) => Number(item.count || 0))
  );

  return (
    <section className="analytics-panel">
      <div className="analytics-panel-heading">
        <div className="analytics-panel-title">
          <span className="analytics-panel-icon">
            <Icon size={19} />
          </span>

          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="analytics-empty-chart">
          No activity recorded in this date range.
        </div>
      ) : (
        <div className="analytics-trend-list">
          {chartData.map((item) => {
            const count = Number(item.count || 0);
            const percentage = Math.max(
              count > 0 ? 3 : 0,
              (count / maxValue) * 100
            );

            return (
              <div className="analytics-trend-row" key={item.date}>
                <span className="analytics-trend-date">
                  {formatDate(item.date)}
                </span>

                <div className="analytics-trend-track">
                  <div
                    className="analytics-trend-fill"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <strong className="analytics-trend-count">
                  {formatNumber(count)}
                </strong>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function AdminAnalytics() {
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(() =>
    getLocalDateString(new Date())
  );

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadAnalytics = useCallback(
    async (showRefresh = false) => {
      if (!startDate || !endDate) {
        setError('Please select both a start date and an end date.');
        return;
      }

      if (startDate > endDate) {
        setError('The start date cannot be after the end date.');
        return;
      }

      const difference =
        (new Date(`${endDate}T00:00:00`) -
          new Date(`${startDate}T00:00:00`)) /
        (1000 * 60 * 60 * 24);

      if (difference > 365) {
        setError('Please select a date range of 366 days or less.');
        return;
      }

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      try {
        const response = await getAdminAnalytics(startDate, endDate);
        setAnalytics(response);
      } catch (err) {
        setError(err.message || 'Unable to load analytics.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [startDate, endDate]
  );

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const summary = analytics?.summary || {};

  const appointmentStatuses = useMemo(
    () => [
      {
        label: 'Pending',
        value: summary.pending_appointments || 0,
        className: 'pending',
      },
      {
        label: 'Confirmed',
        value: summary.confirmed_appointments || 0,
        className: 'confirmed',
      },
      {
        label: 'Completed',
        value: summary.completed_appointments || 0,
        className: 'completed',
      },
      {
        label: 'Cancelled',
        value: summary.cancelled_appointments || 0,
        className: 'cancelled',
      },
    ],
    [summary]
  );

  const totalAppointments = Number(summary.total_appointments || 0);

  const exportReport = () => {
    if (!analytics) return;

    const rows = [
      ['Nepal Virtual Care - Admin Analytics Report'],
      ['Start date', analytics.date_range?.start_date || startDate],
      ['End date', analytics.date_range?.end_date || endDate],
      [],
      ['Platform Summary'],
      ['Metric', 'Value'],
      ['Total patients', summary.total_patients || 0],
      ['Active patients', summary.active_patients || 0],
      ['Total doctors', summary.total_doctors || 0],
      ['Active doctors', summary.active_doctors || 0],
      ['Total appointments', summary.total_appointments || 0],
      ['Pending appointments', summary.pending_appointments || 0],
      ['Confirmed appointments', summary.confirmed_appointments || 0],
      ['Completed appointments', summary.completed_appointments || 0],
      ['Cancelled appointments', summary.cancelled_appointments || 0],
      ['Approved reviews', summary.approved_reviews || 0],
      [],
      ['Doctor Performance'],
      [
        'Doctor',
        'Specialty',
        'City',
        'Appointments',
        'Completed appointments',
        'Average rating',
        'Review count',
      ],
      ...(analytics.doctor_performance || []).map((doctor) => [
        doctor.doctor_name,
        doctor.specialty,
        doctor.city,
        doctor.appointments,
        doctor.completed_appointments,
        doctor.average_rating ?? '',
        doctor.review_count,
      ]),
      [],
      ['Patient Registration Trend'],
      ['Date', 'Registrations'],
      ...(analytics.registration_trend || []).map((item) => [
        item.date,
        item.count,
      ]),
      [],
      ['Appointment Trend'],
      ['Date', 'Appointments'],
      ...(analytics.appointment_trend || []).map((item) => [
        item.date,
        item.count,
      ]),
    ];

    downloadCSV(
      `nepal-virtual-care-analytics-${startDate}-to-${endDate}.csv`,
      rows
    );
  };

  const doctorPerformance = analytics?.doctor_performance || [];

  return (
    <main className="admin-analytics-page">
      <div className="admin-analytics-header">
        <div>
          <span className="analytics-eyebrow">ADMINISTRATION</span>
          <h1>Analytics & Reports</h1>
          <p>
            Monitor platform activity, appointments, registrations and doctor
            performance.
          </p>
        </div>

        <div className="analytics-header-actions">
          <button
            type="button"
            className="analytics-secondary-button"
            onClick={() => loadAnalytics(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'analytics-spinning' : ''}
            />
            Refresh
          </button>

          <button
            type="button"
            className="analytics-primary-button"
            onClick={exportReport}
            disabled={!analytics || loading}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <section className="analytics-filter-panel">
        <div className="analytics-filter-heading">
          <CalendarDays size={19} />
          <div>
            <h2>Report date range</h2>
            <p>Select the period you want to analyse.</p>
          </div>
        </div>

        <div className="analytics-filter-fields">
          <label>
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label>
            <span>End date</span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              max={getLocalDateString(new Date())}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="analytics-primary-button analytics-apply-button"
            onClick={() => loadAnalytics()}
            disabled={loading || refreshing}
          >
            Apply filters
          </button>
        </div>
      </section>

      {error && (
        <div className="analytics-error-message" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading && !analytics ? (
        <div className="analytics-loading">
          <RefreshCw size={25} className="analytics-spinning" />
          <span>Loading platform analytics...</span>
        </div>
      ) : analytics ? (
        <>
          <div className="analytics-section-heading">
            <div>
              <h2>Platform overview</h2>
              <p>Current platform totals and activity for the selected period.</p>
            </div>
          </div>

          <section className="analytics-stats-grid">
            <StatCard
              icon={Users}
              label="Total patients"
              value={summary.total_patients}
              description={`${formatNumber(summary.active_patients)} active accounts`}
              className="patients"
            />

            <StatCard
              icon={Stethoscope}
              label="Total doctors"
              value={summary.total_doctors}
              description={`${formatNumber(summary.active_doctors)} active doctors`}
              className="doctors"
            />

            <StatCard
              icon={CalendarDays}
              label="Appointments"
              value={summary.total_appointments}
              description="In selected date range"
              className="appointments"
            />

            <StatCard
              icon={Star}
              label="Approved reviews"
              value={summary.approved_reviews}
              description="Published patient reviews"
              className="reviews"
            />
          </section>

          <div className="analytics-section-heading">
            <div>
              <h2>Appointment overview</h2>
              <p>Appointment status breakdown for the selected period.</p>
            </div>
          </div>

          <section className="analytics-panel analytics-status-panel">
            <div className="analytics-status-summary">
              <div>
                <span>Total appointments</span>
                <strong>{formatNumber(totalAppointments)}</strong>
              </div>

              <span className="analytics-status-caption">
                By appointment status
              </span>
            </div>

            <div className="analytics-status-grid">
              {appointmentStatuses.map((item) => {
                const percentage =
                  totalAppointments > 0
                    ? (Number(item.value) / totalAppointments) * 100
                    : 0;

                return (
                  <div
                    className="analytics-status-item"
                    key={item.label}
                  >
                    <div className="analytics-status-item-heading">
                      <span className={`analytics-status-dot ${item.className}`} />
                      <span>{item.label}</span>
                      <strong>{formatNumber(item.value)}</strong>
                    </div>

                    <div className="analytics-status-track">
                      <div
                        className={`analytics-status-fill ${item.className}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <small>{percentage.toFixed(1)}%</small>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="analytics-section-heading">
            <div>
              <h2>Platform trends</h2>
              <p>Daily registrations and appointments in the selected period.</p>
            </div>
          </div>

          <section className="analytics-trends-grid">
            <TrendChart
              title="Patient registrations"
              description="New patient accounts by date"
              data={analytics.registration_trend}
              icon={TrendingUp}
            />

            <TrendChart
              title="Appointments"
              description="Scheduled appointments by date"
              data={analytics.appointment_trend}
              icon={Activity}
            />
          </section>

          <div className="analytics-section-heading">
            <div>
              <h2>Doctor performance</h2>
              <p>
                Appointment activity and approved review ratings for active
                doctors.
              </p>
            </div>
          </div>

          <section className="analytics-panel analytics-doctors-panel">
            {doctorPerformance.length === 0 ? (
              <div className="analytics-empty-state">
                <Stethoscope size={28} />
                <strong>No doctor activity found</strong>
                <span>
                  No active doctors have matching records in this date range.
                </span>
              </div>
            ) : (
              <div className="analytics-table-wrapper">
                <table className="analytics-doctors-table">
                  <thead>
                    <tr>
                      <th>Doctor</th>
                      <th>Specialty</th>
                      <th>City</th>
                      <th>Appointments</th>
                      <th>Completed</th>
                      <th>Rating</th>
                      <th>Reviews</th>
                    </tr>
                  </thead>

                  <tbody>
                    {doctorPerformance.map((doctor) => (
                      <tr key={doctor.provider_id}>
                        <td className="analytics-doctor-name">
                          {doctor.doctor_name}
                        </td>
                        <td>{doctor.specialty || '—'}</td>
                        <td>{doctor.city || '—'}</td>
                        <td>{formatNumber(doctor.appointments)}</td>
                        <td>{formatNumber(doctor.completed_appointments)}</td>
                        <td>
                          <span className="analytics-rating">
                            <Star size={14} />
                            {doctor.average_rating == null
                              ? '—'
                              : Number(doctor.average_rating).toFixed(1)}
                          </span>
                        </td>
                        <td>{formatNumber(doctor.review_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="analytics-footer-note">
            <Clock3 size={15} />
            <span>
              Report period: {formatDate(analytics.date_range?.start_date)} –{' '}
              {formatDate(analytics.date_range?.end_date)}
            </span>
          </div>
        </>
      ) : (
        <div className="analytics-empty-state">
          <XCircle size={28} />
          <strong>Analytics could not be displayed</strong>
          <span>Refresh the report to try again.</span>
        </div>
      )}
    </main>
  );
}
