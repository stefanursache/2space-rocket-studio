import { Schema, model, Document } from 'mongoose';

export interface IPreferences extends Document {
    userId: string;
    loginButtonColor: string;
    accentColor: string;
    theme: 'dark' | 'light';
}

const preferencesSchema = new Schema<IPreferences>({
    userId: { type: String, required: true, unique: true },
    loginButtonColor: { type: String, default: '#3b8eed' },
    accentColor: { type: String, default: '#3b8eed' },
    theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
});

preferencesSchema.set('toJSON', {
    transform: (_doc: any, ret: Record<string, any>) => {
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});

export const Preferences = model<IPreferences>('Preferences', preferencesSchema);
