import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  spotifyId: string;
  username: string;
  displayName: string;
  email: string;
  profileImage: string;
  isPremium: boolean;
  accessToken: string;
  refreshToken: string;
  tokenExpiration: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  spotifyId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  displayName: { type: String, required: true },
  email: { type: String, required: true },
  profileImage: { type: String },
  isPremium: { type: Boolean, default: false },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  tokenExpiration: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model<IUser>('User', UserSchema);