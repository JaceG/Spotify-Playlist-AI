import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB Connection String
const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/spotify-playlist-ai';

export const connectToDatabase = async () => {
  try {
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};