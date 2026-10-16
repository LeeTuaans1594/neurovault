import { create } from 'zustand';
import { gamificationAPI } from '../services/api';

/**
 * NEUROVAULT — Gamification Store (Zustand)
 * Quản lý state cho XP, level, badges, daily challenges, XP toast queue.
 */

const useGamificationStore = create((set, get) => ({
  // ── Profile data ──
  profile: null,
  badges: [],
  leaderboard: [],
  isLoading: false,

  // ── XP Toast Queue (popup animations) ──
  xpToasts: [],

  // ── Load gamification profile ──
  loadProfile: async () => {
    try {
      set({ isLoading: true });
      const data = await gamificationAPI.getProfile();
      set({ profile: data, isLoading: false });
      return data;
    } catch {
      set({ isLoading: false });
      return null;
    }
  },

  // ── Load all badges ──
  loadBadges: async () => {
    const data = await gamificationAPI.getBadges();
    set({ badges: data?.badges || [] });
    return data;
  },

  // ── Load leaderboard ──
  loadLeaderboard: async () => {
    const data = await gamificationAPI.getLeaderboard();
    set({ leaderboard: data?.leaderboard || [] });
    return data;
  },

  // ── Show XP toast (animated popup) ──
  showXPToast: (amount, action, leveledUp = false, newBadges = []) => {
    const id = Date.now() + Math.random();
    const toast = { id, amount, action, leveledUp, newBadges };

    set(state => ({
      xpToasts: [...state.xpToasts, toast],
    }));

    // Auto-dismiss after 3.5 seconds
    setTimeout(() => {
      set(state => ({
        xpToasts: state.xpToasts.filter(t => t.id !== id),
      }));
    }, 3500);
  },

  // ── Dismiss XP toast ──
  dismissXPToast: (id) => {
    set(state => ({
      xpToasts: state.xpToasts.filter(t => t.id !== id),
    }));
  },

  // ── Award XP and show toast ──
  awardXP: async (action, metadata = {}) => {
    try {
      const result = await gamificationAPI.awardXP(action, metadata);
      if (result?.xpGained > 0) {
        // Show toast
        get().showXPToast(
          result.xpGained,
          action,
          result.leveledUp,
          result.newBadges || [],
        );

        // Update profile in store
        set(state => {
          if (!state.profile) return {};
          return {
            profile: {
              ...state.profile,
              xp: result.totalXP || state.profile.xp + result.xpGained,
              level: result.newLevel ?? state.profile.level,
              tier: result.newTier ?? state.profile.tier,
            },
          };
        });
      }
      return result;
    } catch {
      return null;
    }
  },
}));

export default useGamificationStore;
