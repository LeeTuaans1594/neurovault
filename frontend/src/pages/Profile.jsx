/**
 * Profile v2 — Trang hồ sơ người dùng premium
 * Layout: ProfileHeader → Stats Grid → 2-column (Mastery+Activity | Preferences+Account+Export)
 * Data: Fetch từ /api/learning/profile-stats, user từ Zustand store
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { learningAPI } from '../services/api';
import { LogOut } from 'lucide-react';

import ProfileHeader from '../components/profile/ProfileHeader';
import LearningStatsGrid from '../components/profile/LearningStatsGrid';
import MasteryOverviewCard from '../components/profile/MasteryOverviewCard';
import ActivityBreakdownCard from '../components/profile/ActivityBreakdownCard';
import MilestonesCard from '../components/profile/MilestonesCard';
import PreferencesCard from '../components/profile/PreferencesCard';
import AccountSettingsCard from '../components/profile/AccountSettingsCard';
import DataExportCard from '../components/profile/DataExportCard';

export default function Profile() {
  const { user, logout, updateProfile, changePassword, isLoading } = useAuthStore();
  const navigate = useNavigate();

  // Profile stats from backend
  const [profileStats, setProfileStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const data = await learningAPI.getProfileStats();
        setProfileStats(data);
      } catch {
        // Graceful fallback — page vẫn hiển thị user info từ store
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="animate-fade-in-up" style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Page title */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{
          fontSize: '1.5rem', fontWeight: 700,
          color: 'var(--c-text-primary)',
          letterSpacing: '-0.02em',
        }}>
          Profile
        </h1>
        <p style={{
          fontSize: '0.9375rem',
          color: 'var(--c-text-secondary)',
          marginTop: 4,
        }}>
          Manage your account, track your learning progress, and customize preferences.
        </p>
      </div>

      {/* ── Profile Header ── */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <ProfileHeader
          user={user}
          joinDate={profileStats?.joinDate}
          neuralProfile={profileStats?.neuralProfile || user?.neural_profile}
        />
      </div>

      {/* ── Learning Stats Grid ── */}
      {statsLoading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-md)',
          marginBottom: 'var(--space-lg)',
        }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 110, borderRadius: 'var(--radius-xl)' }} />
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <LearningStatsGrid overview={profileStats?.overview} />
        </div>
      )}

      {/* ── 2-Column Layout: Left (Mastery + Activity + Milestones) | Right (Preferences + Account + Export) ── */}
      <div className="profile-two-col" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-lg)',
        alignItems: 'start',
      }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {statsLoading ? (
            <>
              <div className="skeleton" style={{ height: 260, borderRadius: 'var(--radius-xl)' }} />
              <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-xl)' }} />
            </>
          ) : profileStats ? (
            <>
              <MasteryOverviewCard masteryBreakdown={profileStats?.masteryBreakdown} />
              <ActivityBreakdownCard activityByType={profileStats?.activityByType} />
              <MilestonesCard milestones={profileStats?.milestones} />
            </>
          ) : (
            <div className="bento-card" style={{
              padding: 'var(--space-2xl)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-md)',
            }}>
              <div style={{
                width: 56, height: 56,
                borderRadius: 'var(--radius-xl)',
                background: 'var(--c-accent-glow)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
              }}>
                📊
              </div>
              <div style={{
                fontSize: '1rem', fontWeight: 600,
                color: 'var(--c-text-primary)',
              }}>
                Learning Stats
              </div>
              <div style={{
                fontSize: '0.875rem',
                color: 'var(--c-text-tertiary)',
                lineHeight: 1.5,
                maxWidth: 280,
              }}>
                Upload documents and start studying to see your mastery progress, activity breakdown, and milestones here.
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <PreferencesCard />
          <AccountSettingsCard
            user={user}
            updateProfile={updateProfile}
            changePassword={changePassword}
            isLoading={isLoading}
          />
          <DataExportCard />

          {/* Logout */}
          <button
            id="btn-logout"
            onClick={handleLogout}
            className="btn btn-danger"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
