import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
    username: string;
    email: string;
    passwordHash: string;
    role: 'user' | 'admin';
    createdAt: Date;
    lastLogin: Date | null;
    disabled: boolean;
    simulationCount: number;
}

const userSchema = new Schema<IUser>({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: null },
    disabled: { type: Boolean, default: false },
    simulationCount: { type: Number, default: 0 },
});

// JSON transform: map _id → id, strip sensitive fields, format dates as ISO
userSchema.set('toJSON', {
    virtuals: true,
    transform: (_doc: any, ret: Record<string, any>) => {
        ret.id = ret._id.toString();
        ret.createdAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
        ret.lastLogin = ret.lastLogin instanceof Date ? ret.lastLogin.toISOString() : ret.lastLogin;
        ret.salt = '';           // compat with frontend StoredUser type
        ret.passwordHash = '';   // never expose
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});

export const User = model<IUser>('User', userSchema);
