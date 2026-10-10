import mongoose from 'mongoose';

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { dbName: 'cadin360_visitor_journey', serverSelectionTimeoutMS: 5000 });
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
