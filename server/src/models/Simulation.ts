import { Schema, model, Document } from 'mongoose';

export interface ISimulation extends Document {
    userId: string;
    name: string;
    rocketName: string;
    createdAt: Date;
    data: string;
}

const simulationSchema = new Schema<ISimulation>({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    rocketName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    data: { type: String, default: '' },
});

simulationSchema.set('toJSON', {
    virtuals: true,
    transform: (_doc: any, ret: Record<string, any>) => {
        ret.id = ret._id.toString();
        ret.createdAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});

export const Simulation = model<ISimulation>('Simulation', simulationSchema);
