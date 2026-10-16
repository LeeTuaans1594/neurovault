import config from '../config/env.js';
import User from '../models/User.model.js';

/**
 * DEV AUTH MIDDLEWARE
 * Tự động tạo/tìm dev user khi nhận header "X-Dev-Bypass: true"
 * CHỈ hoạt động trong development environment.
 * 
 * Đặt TRƯỚC auth middleware trong route chain.
 * Nếu header dev bypass có mặt → inject req.user, skip auth.
 * Nếu không → pass through cho auth middleware xử lý bình thường.
 */
const DEV_USER_EMAIL = 'dev@neurovault.ai';
const DEV_USER_NAME = 'NeuroVault Dev';

const devAuth = async (req, res, next) => {
  // Chỉ cho phép trong development
  if (!config.isDev) return next();

  // Kiểm tra header dev bypass
  const devBypass = req.headers['x-dev-bypass'];
  if (devBypass !== 'true') return next();

  try {
    // Tìm hoặc tạo dev user trong MongoDB
    let user = await User.findOne({ email: DEV_USER_EMAIL });

    if (!user) {
      user = await User.create({
        email: DEV_USER_EMAIL,
        name: DEV_USER_NAME,
        password_hash: 'dev-bypass-no-password-needed',
        role: 'admin',
        auth_provider: 'local',
        neural_profile: {
          learning_velocity: 1.25,
          total_concepts_mastered: 42,
          total_study_time_minutes: 1260,
        },
      });
      console.log('[DevAuth] ✅ Created dev user:', DEV_USER_EMAIL);
    }

    // Inject user vào request (giống auth middleware)
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('[DevAuth] ❌ Error:', error.message);
    // Fallback: tạo mock user object (khi MongoDB chưa kết nối)
    req.user = {
      _id: 'dev-user-fallback',
      name: DEV_USER_NAME,
      email: DEV_USER_EMAIL,
      role: 'admin',
      neural_profile: {
        learning_velocity: 1.25,
        total_concepts_mastered: 42,
        total_study_time_minutes: 1260,
      },
    };
    req.userId = 'dev-user-fallback';
    next();
  }
};

export default devAuth;
