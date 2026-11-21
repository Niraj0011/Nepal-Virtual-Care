
import { useEffect, useRef, useState } from 'react';
import {
  UserRound,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  ShieldCheck,
  Save,
  Pencil,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Camera,
  X,
} from 'lucide-react';

import { useApp } from '../context/AppContext';

import {
  getCurrentUser,
  updateCurrentUser,
  uploadProfilePhoto,
  getDoctorProfilePhoto,
  uploadDoctorProfilePhoto,
  removeDoctorProfilePhoto,
} from '../api';

const EMPTY_PROFILE = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  city: '',
  date_of_birth: '',
  profile_photo: null,
};

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

const PATIENT_PHOTO_TYPES = ['image/jpeg', 'image/png'];
const DOCTOR_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function Profile() {
  const { user } = useApp();

  const isDoctor = user?.role === 'doctor';

  const [profile, setProfile] = useState(EMPTY_PROFILE);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);

  const photoInputRef = useRef(null);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError('');

      const data = await getCurrentUser();

      let photoUrl = data.profile_photo || null;

      if (isDoctor) {
        const doctorPhotoData = await getDoctorProfilePhoto();
        photoUrl = doctorPhotoData.profile_photo || null;
      }

      setProfile({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        phone: data.phone || '',
        city: data.city || '',
        date_of_birth: data.date_of_birth || '',
        profile_photo: photoUrl,
      });

      setSelectedPhoto(null);
      setPhotoPreview('');
    } catch (err) {
      setError(err.message || 'Unable to load your profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [isDoctor]);

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setProfile((previous) => ({
      ...previous,
      [name]: value,
    }));

    setSuccess('');
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setError('');
    setSuccess('');

    const allowedTypes = isDoctor
      ? DOCTOR_PHOTO_TYPES
      : PATIENT_PHOTO_TYPES;

    if (!allowedTypes.includes(file.type)) {
      setError(
        isDoctor
          ? 'Please select a JPG, PNG, or WEBP image.'
          : 'Please select a JPG or PNG image.'
      );

      e.target.value = '';
      return;
    }

    if (file.size > MAX_PHOTO_SIZE) {
      setError('The profile photo must be 5 MB or smaller.');
      e.target.value = '';
      return;
    }

    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    setSelectedPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handlePhotoUpload = async () => {
    if (!selectedPhoto) return;

    try {
      setPhotoSaving(true);
      setError('');
      setSuccess('');

      const data = isDoctor
        ? await uploadDoctorProfilePhoto(selectedPhoto)
        : await uploadProfilePhoto(selectedPhoto);

      setProfile((previous) => ({
        ...previous,
        profile_photo: data.profile_photo || null,
      }));

      setSelectedPhoto(null);
      setPhotoPreview('');

      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }

      setSuccess('Your profile photo has been updated successfully.');
    } catch (err) {
      setError(err.message || 'Unable to upload your profile photo.');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleCancelPhoto = () => {
    setSelectedPhoto(null);
    setPhotoPreview('');

    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }

    setError('');
    setSuccess('');
  };

  const handleRemovePhoto = async () => {
    if (!profile.profile_photo) return;

    const confirmed = window.confirm(
      'Are you sure you want to remove your profile photo?'
    );

    if (!confirmed) return;

    try {
      setPhotoSaving(true);
      setError('');
      setSuccess('');

      const data = isDoctor
        ? await removeDoctorProfilePhoto()
        : await updateCurrentUser({
            profile_photo: null,
          });

      setProfile((previous) => ({
        ...previous,
        profile_photo: data.profile_photo || null,
      }));

      setSelectedPhoto(null);
      setPhotoPreview('');

      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }

      setSuccess('Your profile photo has been removed.');
    } catch (err) {
      setError(err.message || 'Unable to remove your profile photo.');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (isDoctor) return;

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const data = await updateCurrentUser({
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
        phone: profile.phone.trim(),
        city: profile.city.trim(),
        date_of_birth: profile.date_of_birth || null,
      });

      setProfile((previous) => ({
        ...previous,
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        phone: data.phone || '',
        city: data.city || '',
        date_of_birth: data.date_of_birth || '',
      }));

      setEditing(false);
      setSuccess('Your profile has been updated successfully.');
    } catch (err) {
      setError(err.message || 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setSuccess('');
    setError('');
    loadProfile();
  };

  const fullName =
    `${profile.first_name} ${profile.last_name}`.trim() ||
    (isDoctor ? 'Doctor Profile' : 'Your Profile');

  const displayedPhoto = photoPreview || profile.profile_photo;

  if (loading) {
    return (
      <section className="profile-page">
        <div className="profile-loading">
          <RefreshCw size={30} className="profile-loading-icon" />
          <p>Loading your profile...</p>
        </div>
      </section>
    );
  }

  if (error && !profile.email) {
    return (
      <section className="profile-page">
        <div className="profile-error-screen">
          <AlertCircle size={35} />
          <h2>Unable to load your profile</h2>
          <p>{error}</p>

          <button
            type="button"
            className="profile-primary-button"
            onClick={loadProfile}
          >
            <RefreshCw size={16} />
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">MY ACCOUNT</span>

        <h1>
          Your personal <em>profile.</em>
        </h1>

        <p>
          {isDoctor
            ? 'Manage your doctor profile photo and account details.'
            : 'Manage your personal information and keep your contact details up to date.'}
        </p>
      </section>

      <section className="section profile-page">
        <div className="profile-card">
          <div className="profile-card-header">
            <div className="profile-avatar">
              {displayedPhoto ? (
                <img
                  src={displayedPhoto}
                  alt="Your profile"
                  className="profile-avatar-image"
                />
              ) : (
                <UserRound size={31} />
              )}
            </div>

            <div className="profile-heading">
              <span className="eyebrow">
                {isDoctor ? 'DOCTOR PROFILE' : 'PATIENT PROFILE'}
              </span>

              <h2>{fullName}</h2>
              <p>{profile.email}</p>
            </div>

            {!isDoctor && !editing && (
              <button
                type="button"
                className="profile-edit-button"
                onClick={() => {
                  setEditing(true);
                  setError('');
                  setSuccess('');
                }}
              >
                <Pencil size={16} />
                Edit profile
              </button>
            )}
          </div>

          <div className="profile-photo-controls">
            <div className="profile-photo-description">
              <strong>Profile photo</strong>

              <p>
                Add a photo to personalize your account.
                {isDoctor
                  ? ' JPG, PNG, or WEBP, maximum 5 MB.'
                  : ' JPG or PNG, maximum 5 MB.'}
              </p>
            </div>

            <div className="profile-photo-actions">
              <input
                ref={photoInputRef}
                type="file"
                accept={
                  isDoctor
                    ? 'image/jpeg,image/png,image/webp'
                    : 'image/jpeg,image/png'
                }
                onChange={handlePhotoSelect}
                disabled={photoSaving}
                hidden
              />

              <button
                type="button"
                className="profile-edit-button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoSaving}
              >
                <Camera size={16} />
                {profile.profile_photo ? 'Change photo' : 'Upload photo'}
              </button>

              {selectedPhoto && (
                <>
                  <button
                    type="button"
                    className="profile-primary-button"
                    onClick={handlePhotoUpload}
                    disabled={photoSaving}
                  >
                    {photoSaving ? (
                      <>
                        <RefreshCw
                          size={16}
                          className="profile-loading-icon"
                        />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save photo
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="profile-cancel-button"
                    onClick={handleCancelPhoto}
                    disabled={photoSaving}
                  >
                    <X size={16} />
                    Cancel
                  </button>
                </>
              )}

              {!selectedPhoto && profile.profile_photo && (
                <button
                  type="button"
                  className="profile-cancel-button"
                  onClick={handleRemovePhoto}
                  disabled={photoSaving}
                >
                  <X size={16} />
                  Remove photo
                </button>
              )}
            </div>
          </div>

          {success && (
            <div className="profile-success" role="status">
              <CheckCircle2 size={18} />
              {success}
            </div>
          )}

          {error && (
            <div className="profile-error" role="alert">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {!isDoctor && (
            <form onSubmit={handleSave}>
              <div className="profile-section-heading">
                <h3>Personal information</h3>
                <p>Your basic account details.</p>
              </div>

              <div className="profile-form-grid">
                <div className="profile-field">
                  <label htmlFor="first_name">First name</label>

                  <div className="profile-input-wrap">
                    <UserRound size={17} />

                    <input
                      id="first_name"
                      name="first_name"
                      type="text"
                      value={profile.first_name}
                      onChange={handleChange}
                      placeholder="Enter your first name"
                      disabled={!editing || saving}
                      required
                      maxLength={150}
                    />
                  </div>
                </div>

                <div className="profile-field">
                  <label htmlFor="last_name">Last name</label>

                  <div className="profile-input-wrap">
                    <UserRound size={17} />

                    <input
                      id="last_name"
                      name="last_name"
                      type="text"
                      value={profile.last_name}
                      onChange={handleChange}
                      placeholder="Enter your last name"
                      disabled={!editing || saving}
                      maxLength={150}
                    />
                  </div>
                </div>

                <div className="profile-field">
                  <label htmlFor="email">Email address</label>

                  <div className="profile-input-wrap">
                    <Mail size={17} />

                    <input
                      id="email"
                      type="email"
                      value={profile.email}
                      disabled
                      readOnly
                    />
                  </div>

                  <small>
                    Your registered email cannot be changed here.
                  </small>
                </div>

                <div className="profile-field">
                  <label htmlFor="phone">Phone number</label>

                  <div className="profile-input-wrap">
                    <Phone size={17} />

                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={profile.phone}
                      onChange={handleChange}
                      placeholder="Enter your phone number"
                      disabled={!editing || saving}
                      maxLength={30}
                    />
                  </div>
                </div>

                <div className="profile-field">
                  <label htmlFor="city">City</label>

                  <div className="profile-input-wrap">
                    <MapPin size={17} />

                    <input
                      id="city"
                      name="city"
                      type="text"
                      value={profile.city}
                      onChange={handleChange}
                      placeholder="Enter your city"
                      disabled={!editing || saving}
                      maxLength={100}
                    />
                  </div>
                </div>

                <div className="profile-field">
                  <label htmlFor="date_of_birth">Date of birth</label>

                  <div className="profile-input-wrap">
                    <CalendarDays size={17} />

                    <input
                      id="date_of_birth"
                      name="date_of_birth"
                      type="date"
                      value={profile.date_of_birth}
                      onChange={handleChange}
                      disabled={!editing || saving}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
              </div>

              {editing && (
                <div className="profile-form-actions">
                  <button
                    type="button"
                    className="profile-cancel-button"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="profile-primary-button"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <RefreshCw
                          size={16}
                          className="profile-loading-icon"
                        />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={17} />
                        Save changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>
          )}

          {isDoctor && (
            <div className="profile-security-note">
              <ShieldCheck size={21} />

              <div>
                <strong>Your doctor account</strong>

                <p>
                  Your profile photo is connected to your doctor account.
                  It can be changed or removed whenever needed.
                </p>
              </div>
            </div>
          )}

          {!isDoctor && (
            <div className="profile-security-note">
              <ShieldCheck size={21} />

              <div>
                <strong>Your information matters</strong>

                <p>
                  Your profile is linked to your authenticated account.
                  Keep your contact details accurate so your healthcare
                  information stays up to date.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
