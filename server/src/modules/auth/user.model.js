import mongoose from 'mongoose';
import { USER_ROLES, AUTH_CONFIG, EMAIL_REGEX, AUTH_MESSAGES } from './auth.constants.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, AUTH_MESSAGES.NAME_REQUIRED],
      trim: true,
      minlength: [AUTH_CONFIG.NAME_MIN_LENGTH, `Name must be at least ${AUTH_CONFIG.NAME_MIN_LENGTH} characters long`],
      maxlength: [AUTH_CONFIG.NAME_MAX_LENGTH, `Name cannot exceed ${AUTH_CONFIG.NAME_MAX_LENGTH} characters`],
    },
    email: {
      type: String,
      required: [true, AUTH_MESSAGES.EMAIL_REQUIRED],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, AUTH_MESSAGES.INVALID_EMAIL],
    },
    passwordHash: {
      type: String,
      required: [true, AUTH_MESSAGES.PASSWORD_REQUIRED],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.USER,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.password;
        return ret;
      },
    },
  }
);

userSchema.index({ name: 1 });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
