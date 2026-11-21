
import { useEffect, useState } from 'react';

import {
  BookOpen,
  Heart,
  Activity,
  Brain,
  Apple,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { getHealthResources } from '../api';

const iconByTag = {
  'MENTAL WELLBEING': Brain,
  'FAMILY HEALTH': Heart,
  'PREVENTIVE CARE': Activity,
  NUTRITION: Apple,
  'GENERAL HEALTH': Heart,
  'GENERAL WELLNESS': Heart,
  'MENTAL HEALTH': Brain,
  'PHYSICAL ACTIVITY': Activity,
};

export default function HealthInformation() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadResources = async () => {
      try {
        setLoading(true);
        setError('');

        const data = await getHealthResources();

        if (active) {
          setResources(
            Array.isArray(data) ? data : data.results || []
          );
        }
      } catch (err) {
        if (active) {
          setError(
            err.message || 'Unable to load health resources.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadResources();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">HEALTH INFORMATION</span>

        <h1>
          Knowledge for a <em>healthier you.</em>
        </h1>

        <p>
          Explore general educational resources to support
          informed conversations about health and wellbeing.
        </p>
      </section>

      <section className="section">
        <div className="section-heading">
          <span className="eyebrow">EXPLORE TOPICS</span>

          <h2>
            Information to help you <em>stay informed.</em>
          </h2>

          <p>
            Explore health topics and learn more about supporting
            your overall wellbeing.
          </p>
        </div>

        {loading && (
          <div className="empty-state" role="status">
            <RefreshCw size={25} />
            <p>Loading health resources...</p>
          </div>
        )}

        {!loading && error && (
          <div className="empty-state" role="alert">
            <BookOpen size={30} />

            <h3>Unable to load resources</h3>

            <p>{error}</p>

            <button
              type="button"
              className="btn-primary"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </div>
        )}

        {!loading && !error && resources.length === 0 && (
          <div className="empty-state">
            <BookOpen size={30} />

            <h3>No resources available yet</h3>

            <p>
              Health information will appear here when new
              educational resources are added.
            </p>
          </div>
        )}

        {!loading && !error && resources.length > 0 && (
          <div className="resource-grid">
            {resources.map((resource) => {
              const normalizedTag = resource.tag?.toUpperCase() || '';
              const Icon = iconByTag[normalizedTag] || BookOpen;

              return (
                <article
                  className="resource-card"
                  key={resource.id}
                >
                  <span className="service-icon mint">
                    <Icon />
                  </span>

                  <small>
                    {resource.tag || 'GENERAL HEALTH'}
                  </small>

                  <h3>{resource.title}</h3>

                  <p>{resource.description}</p>

                  <span className="card-link">
                    <BookOpen size={16} />
                    Educational resource
                  </span>
                </article>
              );
            })}
          </div>
        )}

        <div className="notice">
          <ShieldCheck />

          <p>
            <b>Important health notice</b>
            <br />
            These resources are for general educational purposes
            only. They do not provide a diagnosis or replace
            professional medical advice. If you experience urgent
            or severe symptoms, seek appropriate local emergency
            medical help.
          </p>
        </div>
      </section>
    </>
  );
}
