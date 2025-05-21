import mongoose, { Schema, Document } from 'mongoose';

export interface IChatMessage extends Document {
  userId: Schema.Types.ObjectId;
  content: string;
  isUserMessage: boolean;
  timestamp: Date;
}

const ChatMessageSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  isUserMessage: { type: Boolean, required: true },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);