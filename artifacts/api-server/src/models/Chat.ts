import mongoose, { Document, Schema } from "mongoose";

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  chatId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content: string;
  read: boolean;
  createdAt: Date;
}

export interface IChat extends Document {
  _id: mongoose.Types.ObjectId;
  type: "direct" | "group";
  name?: string;
  avatar?: string;
  participants: mongoose.Types.ObjectId[];
  createdBy?: mongoose.Types.ObjectId;
  lastMessage?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    chatId: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const chatSchema = new Schema<IChat>(
  {
    type: { type: String, enum: ["direct", "group"], required: true },
    name: { type: String },
    avatar: { type: String },
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    lastMessage: { type: Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true }
);

export const Message = mongoose.model<IMessage>("Message", messageSchema);
export const Chat = mongoose.model<IChat>("Chat", chatSchema);
