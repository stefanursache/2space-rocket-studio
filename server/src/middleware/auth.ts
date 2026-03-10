import '../types.js';
import { Request, Response, NextFunction } from 'express';
import { Session } from '../models/Session.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        const token = header.slice(7);
        const session = await Session.findOne({ token });

        if (!session) {
            res.status(401).json({ error: 'Invalid session' });
            return;
        }

        if (new Date(session.expiresAt) < new Date()) {
            await Session.deleteOne({ _id: session._id });
            res.status(401).json({ error: 'Session expired' });
            return;
        }

        req.auth = {
            token: session.token,
            userId: session.userId,
            username: session.username,
            role: session.role,
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    if (req.auth?.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}
