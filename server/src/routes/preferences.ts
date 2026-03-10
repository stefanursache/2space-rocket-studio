import { Router, Request, Response } from 'express';
import { Preferences } from '../models/Preferences.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const DEFAULTS = {
    loginButtonColor: '#3b8eed',
    accentColor: '#3b8eed',
    theme: 'dark' as const,
};

// GET /api/preferences — current user's preferences
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = req.auth!.userId;
        const prefs = await Preferences.findOne({ userId });
        if (prefs) {
            const json = prefs.toJSON();
            res.json({ ...json, userId });
        } else {
            res.json({ userId, ...DEFAULTS });
        }
    } catch (error) {
        console.error('Get preferences error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/preferences — update user preferences
router.put('/', async (req: Request, res: Response) => {
    try {
        const userId = req.auth!.userId;
        const { loginButtonColor, accentColor, theme } = req.body;

        let prefs = await Preferences.findOne({ userId });
        if (prefs) {
            if (loginButtonColor !== undefined) prefs.loginButtonColor = loginButtonColor;
            if (accentColor !== undefined) prefs.accentColor = accentColor;
            if (theme !== undefined) prefs.theme = theme;
            await prefs.save();
        } else {
            prefs = await Preferences.create({
                userId,
                loginButtonColor: loginButtonColor || DEFAULTS.loginButtonColor,
                accentColor: accentColor || DEFAULTS.accentColor,
                theme: theme || DEFAULTS.theme,
            });
        }

        res.json({ ...prefs.toJSON(), userId });
    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
