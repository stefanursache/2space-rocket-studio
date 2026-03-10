import { Schema, model, Document } from 'mongoose';

export interface IConfig extends Document {
    key: string;
    value: string;
    authorizedAt: Date | null;
}

const configSchema = new Schema<IConfig>({
    key: { type: String, required: true, unique: true },
    value: { type: String, default: '' },
    authorizedAt: { type: Date, default: null },
});

configSchema.set('toJSON', {
    transform: (_doc: any, ret: Record<string, any>) => {
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});

export const Config = model<IConfig>('Config', configSchema);
