import mongoose, { Schema, Document } from 'mongoose';

export interface ICompany extends Document {
  name: string;
  slug: string;
  logo?: string;
  contact?: any;
  address?: any;
  status: 'active' | 'inactive';
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    logo: String,
    contact: Schema.Types.Mixed,
    address: Schema.Types.Mixed,
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

export const Company = mongoose.models.Company || mongoose.model<ICompany>('Company', CompanySchema);
