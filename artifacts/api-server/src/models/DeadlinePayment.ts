import mongoose, { Document, Schema } from "mongoose";

export type ExtPaymentStatus = "unpaid" | "pending" | "paid" | "failed";

export interface IDeadlinePayment extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  serviceRequest: mongoose.Types.ObjectId;
  serviceName: string;
  purpose: string;
  amount: number;
  currency: string;
  paymentStatus: ExtPaymentStatus;
  pesapalOrderTrackingId?: string;
  adminConfirmed: boolean;
  adminNotes?: string;
  newDeadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const deadlinePaymentSchema = new Schema<IDeadlinePayment>(
  {
    user:           { type: Schema.Types.ObjectId, ref: "User",           required: true },
    serviceRequest: { type: Schema.Types.ObjectId, ref: "ServiceRequest", required: true },
    serviceName:    { type: String, required: true },
    purpose:        { type: String, required: true },
    amount:         { type: Number, required: true },
    currency:       { type: String, default: "KES" },
    paymentStatus:  { type: String, enum: ["unpaid","pending","paid","failed"], default: "unpaid" },
    pesapalOrderTrackingId: { type: String },
    adminConfirmed: { type: Boolean, default: false },
    adminNotes:     { type: String },
    newDeadline:    { type: Date },
  },
  { timestamps: true }
);

export const DeadlinePayment = mongoose.model<IDeadlinePayment>("DeadlinePayment", deadlinePaymentSchema);
