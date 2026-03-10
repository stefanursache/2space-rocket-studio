import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Simulation } from '../models/Simulation.js';
import { Rocket } from '../models/Rocket.js';
import { Preferences } from '../models/Preferences.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// All routes require auth
router.use(requireAuth);

// ---- "me" routes (must be defined BEFORE /:id) ----

// POST /api/users/me/change-password
router.post('/me/change-password', async (req: Request, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.auth!.userId);
        if (!user) {
            res.json({ success: false, error: 'User not found' });
            return;
        }

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) {
            res.json({ success: false, error: 'Current password is incorrect' });
            return;
        }

        const hash = await bcrypt.hash(newPassword, 12);
        user.passwordHash = hash;
        await user.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// POST /api/users/me/change-username
router.post('/me/change-username', async (req: Request, res: Response) => {
    try {
        const { newUsername } = req.body;
        const userId = req.auth!.userId;

        const existing = await User.findOne({ username: newUsername });
        if (existing && existing._id.toString() !== userId) {
            res.json({ success: false, error: 'Username already taken' });
            return;
        }

        const user = await User.findById(userId);
        if (!user) {
            res.json({ success: false, error: 'User not found' });
            return;
        }

        user.username = newUsername;
        await user.save();

        // Update active sessions
        await Session.updateMany({ userId }, { username: newUsername });

        res.json({ success: true });
    } catch (error) {
        console.error('Change username error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// POST /api/users/me/change-email
router.post('/me/change-email', async (req: Request, res: Response) => {
    try {
        const { newEmail } = req.body;
        const userId = req.auth!.userId;

        const existing = await User.findOne({ email: newEmail });
        if (existing && existing._id.toString() !== userId) {
            res.json({ success: false, error: 'Email already in use' });
            return;
        }

        const user = await User.findById(userId);
        if (!user) {
            res.json({ success: false, error: 'User not found' });
            return;
        }

        user.email = newEmail;
        await user.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Change email error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ---- Admin / general routes ----

// GET /api/users — all users (admin)
router.get('/', requireAdmin, async (_req: Request, res: Response) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users.map(u => u.toJSON()));
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/users/:id — single user
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(user.toJSON());
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/users/:id — update user (admin)
router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            res.json({ success: false, error: 'User not found' });
            return;
        }

        const { email, role, disabled } = req.body;

        if (email !== undefined) {
            const byEmail = await User.findOne({ email });
            if (byEmail && byEmail._id.toString() !== req.params.id) {
                res.json({ success: false, error: 'Email already in use' });
                return;
            }
            user.email = email;
        }
        if (role !== undefined) user.role = role;
        if (disabled !== undefined) user.disabled = disabled;

        await user.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// POST /api/users/:id/reset-password (admin)
router.post('/:id/reset-password', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { newPassword } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) {
            res.json({ success: false, error: 'User not found' });
            return;
        }

        const hash = await bcrypt.hash(newPassword, 12);
        user.passwordHash = hash;
        await user.save();

        // Invalidate all sessions for this user
        await Session.deleteMany({ userId: req.params.id });

        res.json({ success: true });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// DELETE /api/users/:id (admin)
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            res.json({ success: false, error: 'User not found' });
            return;
        }
        if (user.username === 'admin') {
            res.json({ success: false, error: 'Cannot delete the default admin user' });
            return;
        }

        // Delete all related data
        await Session.deleteMany({ userId: req.params.id });
        await Simulation.deleteMany({ userId: req.params.id });
        await Rocket.deleteMany({ userId: req.params.id });
        await Preferences.deleteOne({ userId: req.params.id });
        await User.deleteOne({ _id: req.params.id });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

export default router;
