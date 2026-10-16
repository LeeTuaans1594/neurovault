import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
  },
  password_hash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: 2,
    maxlength: 100,
  },
  avatar: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['user', 'instructor', 'admin'],
    default: 'user',
  },
  google_id: {
    type: String,
    default: null,
    sparse: true,
  },
  auth_provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local',
  },
  refresh_token: {
    type: String,
    default: null,
  },
  neural_profile: {
    learning_velocity: { type: Number, default: 1.0 },
    forgetting_params: {
      decay_rate: { type: Number, default: 0.3 },
      stability_factor: { type: Number, default: 1.0 },
    },
    total_concepts_mastered: { type: Number, default: 0 },
    total_study_time_minutes: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret.password_hash;
      delete ret.refresh_token;
      delete ret.__v;
      return ret;
    },
  },
});

// Hash password trước khi save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password_hash')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password_hash = await bcrypt.hash(this.password_hash, salt);
  next();
});

// So sánh password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password_hash) return false;
  return bcrypt.compare(candidatePassword, this.password_hash);
};

const User = mongoose.model('User', userSchema);
export default User;
