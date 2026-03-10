import { Schema, model, Document } from 'mongoose';

export type MemberPermission = 'readonly' | 'read-write' | 'download';

export interface IWorkspaceMember {
    userId: string;
    email: string;
    username: string;
    permission: MemberPermission;
    joinedAt: Date;
}

export interface IWorkspace extends Document {
    name: string;
    description: string;
    ownerId: string;         // userId of the creator
    ownerUsername: string;
    rocketId: string;        // the rocket being collaborated on
    rocketName: string;
    members: IWorkspaceMember[];
    createdAt: Date;
    updatedAt: Date;
}

const workspaceMemberSchema = new Schema<IWorkspaceMember>({
    userId: { type: String, required: true },
    email: { type: String, required: true },
    username: { type: String, required: true },
    permission: { type: String, enum: ['readonly', 'read-write', 'download'], default: 'readonly' },
    joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const workspaceSchema = new Schema<IWorkspace>({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    ownerId: { type: String, required: true, index: true },
    ownerUsername: { type: String, required: true },
    rocketId: { type: String, required: true },
    rocketName: { type: String, default: '' },
    members: { type: [workspaceMemberSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Index for finding workspaces where user is a member
workspaceSchema.index({ 'members.userId': 1 });

workspaceSchema.set('toJSON', {
    virtuals: true,
    transform: (_doc: any, ret: Record<string, any>) => {
        ret.id = ret._id.toString();
        ret.createdAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
        ret.updatedAt = ret.updatedAt instanceof Date ? ret.updatedAt.toISOString() : ret.updatedAt;
        if (Array.isArray(ret.members)) {
            ret.members = ret.members.map((m: any) => ({
                ...m,
                joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : m.joinedAt,
            }));
        }
        delete ret._id;
        delete ret.__v;
        return ret;
    },
});

export const Workspace = model<IWorkspace>('Workspace', workspaceSchema);
