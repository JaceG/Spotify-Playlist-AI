import mongoose, { Schema, Document } from 'mongoose';

export interface ITrack extends Document {
  title: string;
  artist: string;
  albumArt: string;
  spotifyId: string;
  duration: number;
  playlistId: Schema.Types.ObjectId;
}

const TrackSchema: Schema = new Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  albumArt: { type: String },
  spotifyId: { type: String, required: true },
  duration: { type: Number, required: true }, // Duration in seconds
  playlistId: { type: Schema.Types.ObjectId, ref: 'Playlist', required: true }
});

export default mongoose.model<ITrack>('Track', TrackSchema);