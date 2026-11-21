
import { useEffect, useState } from 'react';
import {
  MapPin,
  Star,
  CalendarDays,
  ArrowUpRight,
  Stethoscope,
  MessageSquareText,
  Flag,
  X,
} from 'lucide-react';

import {
  getDoctorReviews,
  reportDoctorReview,
} from '../api';

const REVIEWS_PER_PAGE = 5;

export default function ProviderCard({
  provider,
  onBook,
  showReviewControls = true,
}) {
  const [showReviews, setShowReviews] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [visibleReviewsCount, setVisibleReviewsCount] = useState(REVIEWS_PER_PAGE);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [reportingReviewId, setReportingReviewId] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

  const averageRating = provider.average_rating;
  const reviewCount = Number(provider.review_count || 0);
  const hasReviews = reviewCount > 0 && averageRating != null;

  const handleBooking = () => {
    if (typeof onBook === 'function') {
      onBook(provider);
    }
  };

  useEffect(() => {
    if (!showReviews || !provider.id) {
      return undefined;
    }

    let active = true;

    const loadReviews = async () => {
      setReviewsLoading(true);
      setReviewsError('');

      try {
        const data = await getDoctorReviews(provider.id);

        if (active) {
          const reviewList = Array.isArray(data)
            ? data
            : data.results || data.reviews || [];

          setReviews(reviewList);
          setVisibleReviewsCount(REVIEWS_PER_PAGE);
        }
      } catch (error) {
        if (active) {
          setReviewsError(error.message || 'Unable to load reviews.');
        }
      } finally {
        if (active) {
          setReviewsLoading(false);
        }
      }
    };

    loadReviews();

    return () => {
      active = false;
    };
  }, [showReviews, provider.id]);

  const handleReport = async (reviewId) => {
    if (!reportReason.trim()) {
      setReportError('Please explain why you are reporting this review.');
      return;
    }

    try {
      setReportError('');
      await reportDoctorReview(reviewId, reportReason);

      setReportingReviewId(null);
      setReportReason('');
      setReportSuccess('Your report has been submitted for review.');
    } catch (error) {
      setReportError(error.message || 'Unable to submit your report.');
    }
  };

  const visibleReviews = reviews.slice(0, visibleReviewsCount);
  const hasMoreReviews = visibleReviewsCount < reviews.length;

  return (
    <article className="provider-card">
      <div className="provider-top">
        <div className={`avatar ${provider.color || ''}`} aria-hidden="true">
          {provider.initials || <Stethoscope size={25} />}
        </div>

        <span className="availability">
          <i aria-hidden="true" />
          {provider.availability || 'Availability not specified'}
        </span>
      </div>

      <h3>{provider.name}</h3>

      <p className="specialty">{provider.specialty}</p>

      <div className="provider-meta">
        <span>
          <MapPin size={15} aria-hidden="true" />
          {provider.city || 'Location not specified'}
        </span>

        {hasReviews ? (
          <span
            aria-label={`Rating: ${Number(averageRating).toFixed(1)} out of 5, based on ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`}
          >
            <Star size={15} fill="currentColor" aria-hidden="true" />
            {Number(averageRating).toFixed(1)}
            {' '}({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
          </span>
        ) : (
          <span>No reviews yet</span>
        )}
      </div>

      {showReviewControls && reviewCount > 0 && (
        <button
          type="button"
          className="provider-reviews-toggle"
          onClick={() => {
            setShowReviews((previous) => !previous);
            setReportSuccess('');
            setReportingReviewId(null);
            setReportReason('');
            setReportError('');
          }}
          aria-expanded={showReviews}
        >
          <MessageSquareText size={15} aria-hidden="true" />
          {showReviews ? 'Hide reviews' : 'View reviews'}
        </button>
      )}

      {showReviewControls && showReviews && (
        <div className="provider-reviews-panel">
          <div className="provider-reviews-heading">
            <strong>Patient reviews</strong>

            <button
              type="button"
              onClick={() => setShowReviews(false)}
              aria-label="Close reviews"
            >
              <X size={17} />
            </button>
          </div>

          {reviewsLoading && <p>Loading reviews...</p>}

          {reviewsError && <p role="alert">{reviewsError}</p>}

          {!reviewsLoading && !reviewsError && reviews.length === 0 && (
            <p>No published reviews yet.</p>
          )}

          {reportSuccess && <p role="status">{reportSuccess}</p>}

          {!reviewsLoading && !reviewsError && visibleReviews.map((review) => (
            <div className="provider-review" key={review.id}>
              <div className="provider-review-rating">
                <Star size={15} fill="currentColor" aria-hidden="true" />
                <strong>{review.rating}/5</strong>
                <span>
                  {review.created_at
                    ? new Date(review.created_at).toLocaleDateString()
                    : ''}
                </span>
              </div>

              {review.comment && <p>{review.comment}</p>}

              {reportingReviewId === review.id ? (
                <div className="provider-review-report-form">
                  <label htmlFor={`report-reason-${review.id}`}>
                    Why are you reporting this review?
                  </label>

                  <textarea
                    id={`report-reason-${review.id}`}
                    value={reportReason}
                    onChange={(event) => {
                      setReportReason(event.target.value);
                      setReportError('');
                    }}
                    maxLength={1000}
                    rows={3}
                    placeholder="Explain the issue..."
                  />

                  {reportError && <p role="alert">{reportError}</p>}

                  <div>
                    <button type="button" onClick={() => handleReport(review.id)}>
                      Submit report
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReportingReviewId(null);
                        setReportReason('');
                        setReportError('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="provider-review-report-button"
                  onClick={() => {
                    setReportingReviewId(review.id);
                    setReportReason('');
                    setReportError('');
                  }}
                >
                  <Flag size={13} aria-hidden="true" />
                  Report review
                </button>
              )}
            </div>
          ))}

          {!reviewsLoading && !reviewsError && hasMoreReviews && (
            <div className="provider-reviews-pagination">
              <p>
                Showing {visibleReviews.length} of {reviews.length} reviews
              </p>

              <button
                type="button"
                onClick={() => {
                  setVisibleReviewsCount((previous) =>
                    previous + REVIEWS_PER_PAGE
                  );
                }}
              >
                Load more reviews
              </button>
            </div>
          )}
        </div>
      )}

      <div className="provider-bottom">
        <span>
          <CalendarDays size={15} aria-hidden="true" />
          {provider.experience || 'Experience not specified'}
          {provider.experience ? ' experience' : ''}
        </span>

        <button
          type="button"
          className="text-button"
          onClick={handleBooking}
          disabled={!provider.id || typeof onBook !== 'function'}
          aria-label={`Request an appointment with ${provider.name}`}
        >
          Request visit
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
