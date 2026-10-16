import { create } from 'zustand';
import { authAPI, setTokens, clearTokens, getAccessToken } from '../services/api';

const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: !!getAccessToken(),
  isLoading: false,
  error: null,

  // ──── Khởi tạo: kiểm tra token hiện có ────
  initialize: async () => {
    const token = getAccessToken();
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }

    try {
      set({ isLoading: true });
      const data = await authAPI.getMe();
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  // ──── Đăng ký ────
  register: async (name, email, password) => {
    try {
      set({ isLoading: true, error: null });
      const data = await authAPI.register(name, email, password);
      setTokens(data.accessToken, data.refreshToken);
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      });
      return { success: true };
    } catch (err) {
      set({ isLoading: false, error: err.message });
      return { success: false, error: err.message };
    }
  },

  // ──── Đăng nhập ────
  login: async (email, password) => {
    try {
      set({ isLoading: true, error: null });
      const data = await authAPI.login(email, password);
      setTokens(data.accessToken, data.refreshToken);
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      });
      return { success: true };
    } catch (err) {
      set({ isLoading: false, error: err.message });
      return { success: false, error: err.message };
    }
  },

  // ──── Đăng xuất ────
  logout: async () => {
    try {
      await authAPI.logout();
    } catch {
      // Ignore errors on logout
    }
    clearTokens();
    set({ user: null, isAuthenticated: false, error: null });
  },

  // ──── Update Profile ────
  updateProfile: async (updates) => {
    try {
      set({ isLoading: true, error: null });
      const data = await authAPI.updateProfile(updates);
      set({ user: data.user, isLoading: false });
      return { success: true };
    } catch (err) {
      set({ isLoading: false, error: err.message });
      return { success: false, error: err.message };
    }
  },

  // ──── Change Password ────
  changePassword: async (currentPassword, newPassword) => {
    try {
      set({ isLoading: true, error: null });
      await authAPI.changePassword(currentPassword, newPassword);
      set({ isLoading: false });
      return { success: true };
    } catch (err) {
      set({ isLoading: false, error: err.message });
      return { success: false, error: err.message };
    }
  },

  // ──── Clear error ────
  clearError: () => set({ error: null }),

  // ──── Google OAuth: set tokens from callback URL ────
  setTokensFromGoogle: async (accessToken, refreshToken) => {
    try {
      set({ isLoading: true, error: null });
      setTokens(accessToken, refreshToken);
      const data = await authAPI.getMe();
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false, error: 'Google sign-in failed' });
    }
  },
}));

export default useAuthStore;
