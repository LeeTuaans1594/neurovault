import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.model.js';
import config from './env.js';

/**
 * Google OAuth 2.0 Strategy
 * Handles user creation/login via Google.
 */
const setupGoogleAuth = () => {
  if (!config.google.clientId || !config.google.clientSecret) {
    console.log('[Auth] Google OAuth not configured — skipping. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email found in Google profile'), null);
          }

          // Check if user exists with this email
          let user = await User.findOne({ email: email.toLowerCase() });

          if (user) {
            // Existing user — update Google ID if not set
            if (!user.google_id) {
              user.google_id = profile.id;
              user.avatar = profile.photos?.[0]?.value || user.avatar;
              await user.save();
            }
          } else {
            // Create new user from Google profile
            user = new User({
              email: email.toLowerCase(),
              name: profile.displayName || email.split('@')[0],
              password_hash: `google_oauth_${profile.id}_${Date.now()}`,
              avatar: profile.photos?.[0]?.value || profile.displayName?.charAt(0)?.toUpperCase() || 'G',
              google_id: profile.id,
              auth_provider: 'google',
            });
            await user.save();
          }

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user._id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  console.log('[Auth] Google OAuth configured successfully');
};

export default setupGoogleAuth;
