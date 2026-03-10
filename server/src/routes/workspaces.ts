import { Router, Request, Response } from 'express';
import { Workspace } from '../models/Workspace.js';
import { Rocket } from '../models/Rocket.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ─── GET /api/workspaces ─── list workspaces where user is owner OR member
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = req.auth!.userId;
        const workspaces = await Workspace.find({
            $or: [
                { ownerId: userId },
                { 'members.userId': userId },
            ],
        }).sort({ updatedAt: -1 });
        res.json(workspaces.map(w => w.toJSON()));
    } catch (error) {
        console.error('Get workspaces error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

const MAX_WORKSPACES_PER_USER = 10;

// ─── POST /api/workspaces ─── create a workspace (optionally link to an existing rocket)
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, description, rocketId } = req.body;
        const userId = req.auth!.userId;

        if (!name || typeof name !== 'string' || name.trim().length < 1) {
            res.json({ success: false, error: 'Workspace name is required' });
            return;
        }

        // Cap workspaces per user
        const ownedCount = await Workspace.countDocuments({ ownerId: userId });
        if (ownedCount >= MAX_WORKSPACES_PER_USER) {
            res.json({ success: false, error: `You can own up to ${MAX_WORKSPACES_PER_USER} workspaces. Delete an old one first.` });
            return;
        }

        let linkedRocketId = '';
        let linkedRocketName = '';

        // If a rocket is provided, verify it exists and belongs to the user
        if (rocketId) {
            const rocket = await Rocket.findById(rocketId);
            if (!rocket) {
                res.json({ success: false, error: 'Rocket not found' });
                return;
            }
            if (rocket.userId !== userId) {
                res.status(403).json({ success: false, error: 'You can only create workspaces for your own rockets' });
                return;
            }
            linkedRocketId = rocketId;
            linkedRocketName = rocket.name;
        }

        const workspace = await Workspace.create({
            name: name.trim(),
            description: (description || '').trim(),
            ownerId: userId,
            ownerUsername: req.auth!.username,
            rocketId: linkedRocketId,
            rocketName: linkedRocketName,
            members: [],
        });

        res.json({ success: true, workspace: workspace.toJSON() });
    } catch (error) {
        console.error('Create workspace error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ─── GET /api/workspaces/:id ─── get single workspace (owner or member)
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            res.status(404).json({ error: 'Workspace not found' });
            return;
        }

        const userId = req.auth!.userId;
        const isMember = workspace.ownerId === userId ||
            workspace.members.some(m => m.userId === userId);

        if (!isMember) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        res.json(workspace.toJSON());
    } catch (error) {
        console.error('Get workspace error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── PUT /api/workspaces/:id ─── update workspace name/description (owner only)
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            res.json({ success: false, error: 'Workspace not found' });
            return;
        }
        if (workspace.ownerId !== req.auth!.userId) {
            res.status(403).json({ success: false, error: 'Only the workspace owner can edit it' });
            return;
        }

        const { name, description } = req.body;
        if (name !== undefined) workspace.name = name.trim();
        if (description !== undefined) workspace.description = description.trim();
        workspace.updatedAt = new Date();
        await workspace.save();

        res.json({ success: true, workspace: workspace.toJSON() });
    } catch (error) {
        console.error('Update workspace error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ─── DELETE /api/workspaces/:id ─── delete workspace (owner only)
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            res.json({ success: true });
            return;
        }
        if (workspace.ownerId !== req.auth!.userId) {
            res.status(403).json({ success: false, error: 'Only the workspace owner can delete it' });
            return;
        }

        await Workspace.deleteOne({ _id: workspace._id });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete workspace error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ─── POST /api/workspaces/:id/members ─── invite a member by email (owner only)
router.post('/:id/members', async (req: Request, res: Response) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            res.json({ success: false, error: 'Workspace not found' });
            return;
        }
        if (workspace.ownerId !== req.auth!.userId) {
            res.status(403).json({ success: false, error: 'Only the workspace owner can add members' });
            return;
        }

        const { email, permission } = req.body;
        if (!email || typeof email !== 'string') {
            res.json({ success: false, error: 'Email is required' });
            return;
        }

        // Find user by email
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) {
            res.json({ success: false, error: 'No user found with that email address' });
            return;
        }

        if (user._id.toString() === workspace.ownerId) {
            res.json({ success: false, error: 'You cannot add yourself as a member' });
            return;
        }

        // Check if already a member
        if (workspace.members.some(m => m.userId === user._id.toString())) {
            res.json({ success: false, error: 'This user is already a member' });
            return;
        }

        const validPerms = ['readonly', 'read-write', 'download'];
        const perm = validPerms.includes(permission) ? permission : 'readonly';

        workspace.members.push({
            userId: user._id.toString(),
            email: user.email,
            username: user.username,
            permission: perm,
            joinedAt: new Date(),
        });
        workspace.updatedAt = new Date();
        await workspace.save();

        res.json({ success: true, workspace: workspace.toJSON() });
    } catch (error) {
        console.error('Add member error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ─── PUT /api/workspaces/:id/members/:userId ─── update member permission (owner only)
router.put('/:id/members/:userId', async (req: Request, res: Response) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            res.json({ success: false, error: 'Workspace not found' });
            return;
        }
        if (workspace.ownerId !== req.auth!.userId) {
            res.status(403).json({ success: false, error: 'Only the workspace owner can change permissions' });
            return;
        }

        const member = workspace.members.find(m => m.userId === req.params.userId);
        if (!member) {
            res.json({ success: false, error: 'Member not found' });
            return;
        }

        const { permission } = req.body;
        const validPerms = ['readonly', 'read-write', 'download'];
        if (!validPerms.includes(permission)) {
            res.json({ success: false, error: 'Invalid permission. Must be: readonly, read-write, or download' });
            return;
        }

        member.permission = permission;
        workspace.updatedAt = new Date();
        await workspace.save();

        res.json({ success: true, workspace: workspace.toJSON() });
    } catch (error) {
        console.error('Update member error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ─── DELETE /api/workspaces/:id/members/:userId ─── remove a member (owner only, or self-leave)
router.delete('/:id/members/:userId', async (req: Request, res: Response) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            res.json({ success: true });
            return;
        }

        const requesterId = req.auth!.userId;
        const targetUserId = req.params.userId;

        // Allow: owner removes anyone, OR a member removes themselves (leave)
        if (workspace.ownerId !== requesterId && requesterId !== targetUserId) {
            res.status(403).json({ success: false, error: 'Access denied' });
            return;
        }

        workspace.members = workspace.members.filter(m => m.userId !== targetUserId);
        workspace.updatedAt = new Date();
        await workspace.save();

        res.json({ success: true, workspace: workspace.toJSON() });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ─── GET /api/workspaces/:id/rocket ─── get the shared rocket data (member or owner)
router.get('/:id/rocket', async (req: Request, res: Response) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            res.status(404).json({ error: 'Workspace not found' });
            return;
        }

        const userId = req.auth!.userId;
        const isOwner = workspace.ownerId === userId;
        const member = workspace.members.find(m => m.userId === userId);

        if (!isOwner && !member) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        if (!workspace.rocketId) {
            res.status(404).json({ error: 'No rocket linked to this workspace yet' });
            return;
        }

        const rocket = await Rocket.findById(workspace.rocketId);
        if (!rocket) {
            res.status(404).json({ error: 'Rocket not found — it may have been deleted' });
            return;
        }

        const permission = isOwner ? 'read-write' : member!.permission;
        res.json({ rocket: rocket.toJSON(), permission });
    } catch (error) {
        console.error('Get workspace rocket error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── PUT /api/workspaces/:id/rocket ─── update the shared rocket (owner or read-write members)
router.put('/:id/rocket', async (req: Request, res: Response) => {
    try {
        const workspace = await Workspace.findById(req.params.id);
        if (!workspace) {
            res.status(404).json({ success: false, error: 'Workspace not found' });
            return;
        }

        const userId = req.auth!.userId;
        const isOwner = workspace.ownerId === userId;
        const member = workspace.members.find(m => m.userId === userId);

        if (!isOwner && !member) {
            res.status(403).json({ success: false, error: 'Access denied' });
            return;
        }

        if (!isOwner && member!.permission !== 'read-write') {
            res.status(403).json({ success: false, error: 'You only have read-only access to this rocket' });
            return;
        }

        const { name, description, data } = req.body;

        // Storage guard: 1 MB max per rocket data
        if (data && typeof data === 'string' && data.length > 1_048_576) {
            res.json({ success: false, error: 'Rocket data too large (max 1 MB). Simplify the design or remove unused components.' });
            return;
        }

        // If workspace has no rocket linked yet, create one
        if (!workspace.rocketId) {
            const newRocket = await Rocket.create({
                userId: workspace.ownerId,
                name: name || 'Workspace Rocket',
                description: description || '',
                data: data || '',
                thumbnail: '',
            });
            workspace.rocketId = newRocket._id.toString();
            workspace.rocketName = newRocket.name;
            workspace.updatedAt = new Date();
            await workspace.save();
            res.json({ success: true });
            return;
        }

        const rocket = await Rocket.findById(workspace.rocketId);
        if (!rocket) {
            res.status(404).json({ success: false, error: 'Rocket not found' });
            return;
        }

        if (name !== undefined) rocket.name = name;
        if (description !== undefined) rocket.description = description;
        if (data !== undefined) rocket.data = data;
        rocket.updatedAt = new Date();
        await rocket.save();

        // Keep workspace rocketName in sync
        if (name !== undefined) {
            workspace.rocketName = name;
            workspace.updatedAt = new Date();
            await workspace.save();
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update workspace rocket error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

export default router;
