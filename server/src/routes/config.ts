import { Router, Request, Response } from 'express';
import { Config } from '../models/Config.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// POST /api/config/authorize-device — store authorized device fingerprint
router.post('/authorize-device', requireAdmin, async (req: Request, res: Response) => {
    try {
        const { fingerprint } = req.body;
        await Config.findOneAndUpdate(
            { key: 'authorized_admin_device' },
            { key: 'authorized_admin_device', value: fingerprint, authorizedAt: new Date() },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Authorize device error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/config/authorized-device — check which device is authorized
router.get('/authorized-device', async (_req: Request, res: Response) => {
    try {
        const config = await Config.findOne({ key: 'authorized_admin_device' });
        res.json({ value: config?.value || null });
    } catch (error) {
        console.error('Get authorized device error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/config/authorized-device — revoke device authorization
router.delete('/authorized-device', requireAdmin, async (_req: Request, res: Response) => {
    try {
        await Config.deleteOne({ key: 'authorized_admin_device' });
        res.json({ success: true });
    } catch (error) {
        console.error('Revoke device error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
