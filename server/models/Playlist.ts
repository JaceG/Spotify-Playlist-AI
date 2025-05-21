import mongoose, { Schema, Document } from 'mongoose';

export interface IPlaylist extends Document {
  name: string;
  userId: Schema.Types.ObjectId;
  spotifyId: string;
  coverImage: string;
  description: string;
  isAIGenerated: boolean;
  tracksCount: number;
  duration: number;
  createdAt: Date;
}

const PlaylistSchema: Schema = new Schema({
  name: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  spotifyId: { type: String, required: true },
  coverImage: { type: String },
  description: { type: String, default: '' },
  isAIGenerated: { type: Boolean, default: false },
  tracksCount: { type: Number, default: 0 },
  duration: { type: Number, default: 0 }, // Duration in seconds
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IPlaylist>('Playlist', PlaylistSchema);