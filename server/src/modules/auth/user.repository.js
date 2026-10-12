import mongoose from 'mongoose';
import { User } from './user.model.js';

export const userRepository = {
  async create(userData) {
    const data = { ...userData };
    if (data.password && !data.passwordHash) {
      data.passwordHash = data.password;
      delete data.password;
    }
    return await User.create(data);
  },

  async findByEmail(email, { includePassword = false } = {}) {
    if (!email) return null;
    const query = User.findOne({ email: email.toLowerCase().trim() });
    if (includePassword) {
      query.select('+passwordHash');
    }
    return await query.exec();
  },

  async findById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return await User.findById(id).select('-passwordHash').exec();
  },

  async deleteById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return await User.findByIdAndDelete(id).exec();
  },
};

