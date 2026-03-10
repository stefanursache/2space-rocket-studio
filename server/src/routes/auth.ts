import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { username, email, password } = req.body;

        const byUsername = await User.findOne({ username });
        if (byUsername) {
            res.json({ success: false, error: 'Username already taken' });
            return;
        }

        const byEmail = await User.findOne({ email });
        if (byEmail) {
            res.json({ success: false, error: 'Email already registered' });
            return;
        }

        const hash = await bcrypt.hash(password, 12);

        await User.create({
            username,
            email,
            passwordHash: hash,
            role: 'user',
            disabled: false,
            simulationCount: 0,
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server error' });
    }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.json({ success: false, error: 'Username and password are required' });
            return;
        }

        const user = await User.findOne({ username });
        if (!user) {
            res.json({ success: false, error: 'Invalid username or password' });
            return;
        }
        if (user.disabled) {
            res.json({ success: false, error: 'Account is disabled. Contact administrator.' });
            return;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            res.json({ success: false, error: 'Invalid username or password' });
            return;
        }

        // Create session
        const now = new Date();
        const token = crypto.randomBytes(32).toString('hex');
        const session = await Session.create({
            token,
            userId: user._id.toString(),
            username: user.username,
            role: user.role,
            createdAt: now,
            expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
        });

        // Update last login
        user.lastLogin = now;
        await user.save();

        res.json({ success: true, session: session.toJSON() });
    } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message || 'Server error' });
    }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
    try {
        await Session.deleteOne({ token: req.auth!.token });
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/auth/session — get current session (if valid)
router.get('/session', async (req: Request, res: Response) => {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Bearer ')) {
            res.json(null);
            return;
        }

        const token = header.slice(7);
        const session = await Session.findOne({ token });
        if (!session) {
            res.json(null);
            return;
        }

        if (new Date(session.expiresAt) < new Date()) {
            await Session.deleteOne({ _id: session._id });
            res.json(null);
            return;
        }

        res.json(session.toJSON());
    } catch (error) {
        console.error('Session check error:', error);
        res.json(null);
    }
});

// POST /api/auth/init — ensure default admin exists
router.post('/init', async (_req: Request, res: Response) => {
    try {
        const existing = await User.findOne({ username: 'admin' });
        if (!existing) {
            const hash = await bcrypt.hash('Admin123!', 12);
            await User.create({
                username: 'admin',
                email: 'admin@2space.local',
                passwordHash: hash,
                role: 'admin',
                disabled: false,
                simulationCount: 0,
            });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Init error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

export default router;
