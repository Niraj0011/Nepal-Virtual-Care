
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  ArrowRight,
  ShieldCheck,
  Video,
  HeartHandshake,
  FileHeart,
  Globe2,
  Clock3,
  Stethoscope,
  BookOpen,
} from 'lucide-react';

import { getProviders } from '../api';
import ProviderCard from '../components/ProviderCard';
import BookingModal from '../components/BookingModal';

export default function Home() {
  const [selected, setSelected] = useState(null);
  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState('');

  useEffect(() => {
    let active = true;

    const loadProviders = async () => {
      try {
        setProvidersLoading(true);
        setProvidersError('');

        const data = await getProviders();

        if (active) {
          const providerList = Array.isArray(data)
            ? data
            : data.results || [];

          setProviders(providerList);
        }
      } catch (error) {
        if (active) {
          setProvidersError(
            error.message || 'Unable to load healthcare professionals.'
          );
        }
      } finally {
        if (active) {
          setProvidersLoading(false);
        }
      }
    };

    loadProviders();

    return () => {
      active = false;
    };
  }, []);

  const services = [
    {
      title: 'Health Information',
      description:
        'Explore accessible health resources, helpful guidance and educational information.',
      icon: BookOpen,
      color: 'mint',
      path: '/health-information',
      action: 'Explore resources',
    },
    {
      title: 'Virtual Care',
      description:
        'Discover healthcare professionals and request consultations remotely.',
      icon: Video,
      color: 'blue',
      path: '/virtual-care',
      action: 'Find a provider',
    },
    {
      title: 'Community',
      description:
        'Discover shared experiences and supportive connections with others.',
      icon: HeartHandshake,
      color: 'peach',
      path: '/community',
      action: 'Explore community',
    },
    {
      title: 'My Health Record',
      description:
        'Keep your personal health documents organised and accessible.',
      icon: FileHeart,
      color: 'lavender',
      path: '/records',
      action: 'View health records',
    },
  ];

  const trustItems = [
    {
      icon: Globe2,
      title: 'Care without borders',
      description: 'Connect from wherever you are',
    },
    {
      icon: Clock3,
      title: 'Flexible access',
      description: 'Explore care at your convenience',
    },
    {
      icon: ShieldCheck,
      title: 'Patient-centred',
      description: 'Your choices matter',
    },
  ];

  return (
    <>
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              CARE THAT CONNECTS US
            </span>

            <h1>
              Healthcare access,
              <br />
              <em>without borders.</em>
            </h1>

            <p>
              Explore health information and virtual care that brings
              people, families and healthcare professionals closer —
              wherever life takes you.
            </p>

            <div className="hero-actions">
              <Link to="/virtual-care" className="btn-primary">
                Explore virtual care
                <ArrowRight size={18} />
              </Link>

              <Link to="/register" className="btn-secondary">
                Create an account
              </Link>
            </div>

            <div className="hero-trust">
              <ShieldCheck size={17} />
              Designed around privacy, access and patient choice
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />

            <div className="hero-illustration">
              <div className="ill-cross">+</div>

              <Stethoscope size={104} strokeWidth={1.2} />

              <span>Care, connected.</span>
            </div>

            <div className="float-card float-top">
              <span className="float-icon">
                <Video size={19} />
              </span>

              <div>
                <b>Virtual consultation</b>
                <small>Care from wherever you are</small>
              </div>
            </div>

            <div className="float-card float-bottom">
              <span className="online-dot" />

              <div>
                <b>Healthcare professionals</b>
                <small>Find support that fits you</small>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-wave" />
      </section>

      {/* Trust and Platform Highlights */}
      <section className="trust-strip" aria-label="Platform highlights">
        {trustItems.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.title}>
              <Icon />

              <span>
                <b>{item.title}</b>
                <small>{item.description}</small>
              </span>
            </div>
          );
        })}
      </section>

      {/* Services Section */}
      <section className="section section-soft">
        <div className="section-heading">
          <span className="eyebrow">WHAT WE OFFER</span>

          <h2>
            Care that meets you <em>where you are.</em>
          </h2>

          <p>
            Explore connected services designed to make health
            information and support easier to find and use.
          </p>
        </div>

        <div className="service-grid">
          {services.map((service) => {
            const Icon = service.icon;

            return (
              <Link
                to={service.path}
                className="service-card"
                key={service.title}
              >
                <span className={`service-icon ${service.color}`}>
                  <Icon />
                </span>

                <h3>{service.title}</h3>

                <p>{service.description}</p>

                <span className="card-link">
                  {service.action}
                  <ArrowRight size={16} />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Healthcare Providers */}
      <section className="section">
        <div className="section-heading row-heading">
          <div>
            <span className="eyebrow">MEET YOUR CARE TEAM</span>

            <h2>
              Find the right <em>support.</em>
            </h2>

            <p>
              Explore healthcare professionals available through our
              provider directory.
            </p>
          </div>

          <Link className="view-all" to="/virtual-care">
            View all providers
            <ArrowRight size={17} />
          </Link>
        </div>

        {providersLoading && (
          <p>Loading healthcare professionals...</p>
        )}

        {providersError && (
          <p role="alert">{providersError}</p>
        )}

        {!providersLoading && !providersError && providers.length === 0 && (
          <p>No healthcare professionals are currently available.</p>
        )}

        {!providersLoading && !providersError && providers.length > 0 && (
          <div className="provider-grid">
            {providers.slice(0, 3).map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onBook={setSelected}
                showReviewControls={false}
              />
            ))}
          </div>
        )}
      </section>

      {/* Call To Action */}
      <section className="cta-section">
        <div>
          <span className="eyebrow">
            YOUR HEALTH JOURNEY STARTS HERE
          </span>

          <h2>
            Care is closer than
            <br />
            you think.
          </h2>

          <p>
            Create an account to access your personal dashboard,
            manage health records and explore patient-centred services.
          </p>

          <Link to="/register" className="btn-light">
            Get started
            <ArrowRight size={17} />
          </Link>
        </div>

        <div className="cta-symbol" aria-hidden="true">
          <HeartHandshake size={110} strokeWidth={1} />
        </div>
      </section>

      {/* Booking Modal */}
      <BookingModal
        provider={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
