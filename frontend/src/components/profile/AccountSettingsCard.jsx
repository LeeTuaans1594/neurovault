/**
 * AccountSettingsCard — Edit profile (name/email) + change password
 * Nâng cấp từ form cũ, giữ logic auth store
 */
import { useState } from 'react';
import { User, Mail, Lock, Check, AlertCircle } from 'lucide-react';

export default function AccountSettingsCard({ user, updateProfile, changePassword, isLoading }) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
  });
  const [saveStatus, setSaveStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaveStatus(null);

    // Save profile info
    if (formData.name !== user?.name || formData.email !== user?.email) {
      const result = await updateProfile({
        name: formData.name,
        email: formData.email,
      });
      if (!result.success) {
        setSaveStatus('error');
        setStatusMessage(result.error || 'Failed to update profile');
        return;
      }
    }

    // Change password if provided
    if (formData.currentPassword && formData.newPassword) {
      if (formData.newPassword.length < 6) {
        setSaveStatus('error');
        setStatusMessage('New password must be at least 6 characters');
        return;
      }
      const result = await changePassword(formData.currentPassword, formData.newPassword);
      if (!result.success) {
        setSaveStatus('error');
        setStatusMessage(result.error || 'Failed to change password');
        return;
      }
      setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '' }));
    }

    setSaveStatus('success');
    setStatusMessage('Changes saved successfully');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  return (
    <form className="bento-card" style={{ padding: 'var(--space-xl)' }} onSubmit={handleSaveProfile}>
      <h3 style={{
        fontSize: '1rem', fontWeight: 600,
        color: 'var(--c-text-primary)',
        marginBottom: 'var(--space-lg)',
      }}>
        Account Settings
      </h3>

      {/* Status message */}
      {saveStatus && (
        <div className="animate-fade-in" style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-lg)',
          display: 'flex', alignItems: 'center', gap: 8,
          background: saveStatus === 'success' ? 'var(--c-success-glow)' : 'var(--c-error-glow)',
          color: saveStatus === 'success' ? 'var(--c-success)' : 'var(--c-error)',
          fontSize: '0.8125rem', fontWeight: 500,
        }}>
          {saveStatus === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          {statusMessage}
        </div>
      )}

      {/* Personal Info */}
      <div style={{
        fontSize: '0.8125rem', fontWeight: 600,
        color: 'var(--c-text-secondary)',
        marginBottom: 'var(--space-sm)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Personal Information
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-xl)',
      }}>
        <div>
          <label htmlFor="profile-name" style={{
            fontSize: '0.8125rem', fontWeight: 500,
            color: 'var(--c-text-secondary)',
            marginBottom: 6, display: 'block',
          }}>
            Full Name
          </label>
          <div style={{ position: 'relative' }}>
            <User size={16} style={{
              position: 'absolute', left: 14, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--c-text-tertiary)',
            }} />
            <input
              id="profile-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input"
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
        </div>
        <div>
          <label htmlFor="profile-email" style={{
            fontSize: '0.8125rem', fontWeight: 500,
            color: 'var(--c-text-secondary)',
            marginBottom: 6, display: 'block',
          }}>
            Email
          </label>
          <div style={{ position: 'relative' }}>
            <Mail size={16} style={{
              position: 'absolute', left: 14, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--c-text-tertiary)',
            }} />
            <input
              id="profile-email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              type="email"
              className="input"
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--c-border)', margin: 'var(--space-md) 0 var(--space-lg)' }} />

      {/* Change Password */}
      <div style={{
        fontSize: '0.8125rem', fontWeight: 600,
        color: 'var(--c-text-secondary)',
        marginBottom: 'var(--space-sm)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Change Password
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-lg)',
      }}>
        <div>
          <label htmlFor="profile-current-pw" style={{
            fontSize: '0.8125rem', fontWeight: 500,
            color: 'var(--c-text-secondary)',
            marginBottom: 6, display: 'block',
          }}>
            Current Password
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={16} style={{
              position: 'absolute', left: 14, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--c-text-tertiary)',
            }} />
            <input
              id="profile-current-pw"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              type="password"
              placeholder="••••••••"
              className="input"
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
        </div>
        <div>
          <label htmlFor="profile-new-pw" style={{
            fontSize: '0.8125rem', fontWeight: 500,
            color: 'var(--c-text-secondary)',
            marginBottom: 6, display: 'block',
          }}>
            New Password
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={16} style={{
              position: 'absolute', left: 14, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--c-text-tertiary)',
            }} />
            <input
              id="profile-new-pw"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              type="password"
              placeholder="••••••••"
              className="input"
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          id="btn-save-profile"
          type="submit"
          className="btn btn-primary"
          disabled={isLoading}
          style={{ opacity: isLoading ? 0.6 : 1 }}
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
