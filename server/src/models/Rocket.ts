import { Schema, model, Document } from 'mongoose';

export interface IRocket extends Document {
    userId: string;
    name: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
    data: string;
    thumbnail: string;
}

const rocketSchema = new Schema<IRocket>({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    data: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
});

rocketSchema.set('toJSON', {
    virtuals: true,
    transform: (_doc: any, ret: Record<string, any>) => {
        ret.id = ret._id.toString();
        ret.createdAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
        ret.updatedAt = ret.updatedAt instanceof Date ? ret.updatedAt.toISOString() : ret.updatedAt;
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});

export const Rocket = model<IRocket>('Rocket', rocketSchema);
