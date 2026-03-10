import { Schema, model, Document } from 'mongoose';

export interface ISession extends Document {
    token: string;
    userId: string;
    username: string;
    role: 'user' | 'admin';
    createdAt: Date;
    expiresAt: Date;
}

const sessionSchema = new Schema<ISession>({
    token: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL auto-delete
});

sessionSchema.set('toJSON', {
    transform: (_doc: any, ret: Record<string, any>) => {
        ret.createdAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
        ret.expiresAt = ret.expiresAt instanceof Date ? ret.expiresAt.toISOString() : ret.expiresAt;
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});

export const Session = model<ISession>('Session', sessionSchema);
