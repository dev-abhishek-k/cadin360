import mongoose from 'mongoose';

export function getHealth() { return mongoose.connection.readyState === 1 ? 'connected' : 'unavailable'; }
