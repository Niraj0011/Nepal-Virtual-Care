
import { useEffect, useState } from 'react';

import {
  Search,
  SlidersHorizontal,
  Video,
  ShieldCheck,
  RefreshCw,
  X,
  Stethoscope,
} from 'lucide-react';

import { getProviders } from '../api';
import ProviderCard from '../components/ProviderCard';
import BookingModal from '../components/BookingModal';

export default function VirtualCare() {
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('All specialties');

  const [providers, setProviders] = useState([]);
  const [selected, setSelected] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError('');

        const data = await getProviders(search.trim(), specialty);

        if (!cancelled) {
          const providerList = Array.isArray(data)
            ? data
            : Array.isArray(data?.results)
              ? data.results
              : [];

          setProviders(providerList);
        }
      } catch (err) {
        if (!cancelled) {
          setProviders([]);
          setError(
            err.message ||
            'We could not load healthcare professionals. Please try again.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, specialty, retryKey]);

  const specialties = [
    'All specialties',
    ...new Set(
      providers
        .map((provider) => provider.specialty)
        .filter(Boolean)
    ),
  ];

  const clearFilters = () => {
    setSearch('');
    setSpecialty('All specialties');
  };

  const hasFilters =
    search.trim() !== '' || specialty !== 'All specialties';

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">VIRTUAL CARE</span>

        <h1>
          Healthcare, <em>within reach.</em>
        </h1>

        <p>
          Find a healthcare professional and explore flexible
          ways to access care.
        </p>
      </section>

      <section className="section">
        <div className="directory-top">
          <div>
            <h2>Find a healthcare professional</h2>
            <p className="muted">
              Explore healthcare professionals by name, specialty or location.
            </p>
          </div>

          <span className="result-count" aria-live="polite">
            {loading
              ? 'Searching...'
              : `${providers.length} ${providers.length === 1 ? 'provider' : 'providers'}`}
          </span>
        </div>

        <div className="filter-bar">
          <label className="search-box">
            <Search size={18} aria-hidden="true" />

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, specialty or city..."
              aria-label="Search healthcare professionals"
            />

            {search && (
              <button
                type="button"
                className="filter-clear-button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </label>

          <label className="select-box">
            <SlidersHorizontal size={17} aria-hidden="true" />

            <select
              value={specialty}
              onChange={(event) => setSpecialty(event.target.value)}
              aria-label="Filter by medical specialty"
            >
              {specialties.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          {hasFilters && (
            <button
              type="button"
              className="filter-reset-button"
              onClick={clearFilters}
            >
              <X size={15} />
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="empty-state" role="status">
            <RefreshCw size={28} className="loading-icon" />
            <h3>Finding healthcare professionals</h3>
            <p>Please wait while we load the directory.</p>
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <ShieldCheck size={30} />
            <h3>Unable to load providers</h3>
            <p>{error}</p>

            <button
              type="button"
              className="btn-primary"
              onClick={() => setRetryKey((key) => key + 1)}
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        ) : providers.length > 0 ? (
          <div className="provider-grid" aria-live="polite">
            {providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onBook={setSelected}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={30} />
            <h3>No providers found</h3>
            <p>
              We couldn't find a match. Try another name, city or specialty.
            </p>

            {hasFilters && (
              <button
                type="button"
                className="btn-primary"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        <div className="notice">
          <ShieldCheck />

          <p>
            <b>A note about this demo</b>
            <br />
            Provider profiles are sample listings.
            Verify credentials before using any real clinical service.
          </p>
        </div>
      </section>

      <section className="section section-soft">
        <div className="section-heading">
          <span className="eyebrow">HOW IT WORKS</span>

          <h2>
            Getting care in <em>three steps.</em>
          </h2>
        </div>

        <div className="steps-grid">
          <div>
            <b>01</b>
            <Stethoscope />
            <h3>Explore providers</h3>
            <p>Browse specialties and find a professional.</p>
          </div>

          <div>
            <b>02</b>
            <Search />
            <h3>Request a visit</h3>
            <p>Choose a preferred date and consultation type.</p>
          </div>

          <div>
            <b>03</b>
            <ShieldCheck />
            <h3>Stay connected</h3>
            <p>Keep track of your consultation requests.</p>
          </div>
        </div>
      </section>

      <BookingModal
        provider={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
