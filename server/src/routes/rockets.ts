import { Router, Request, Response } from 'express';
import { Rocket } from '../models/Rocket.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/rockets/all — all rockets (admin) — must be before /:id
router.get('/all', requireAdmin, async (_req: Request, res: Response) => {
    try {
        const rockets = await Rocket.find().sort({ updatedAt: -1 });
        res.json(rockets.map(r => r.toJSON()));
    } catch (error) {
        console.error('Get all rockets error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/rockets — current user's rockets
router.get('/', async (req: Request, res: Response) => {
    try {
        const rockets = await Rocket.find({ userId: req.auth!.userId }).sort({ updatedAt: -1 });
        res.json(rockets.map(r => r.toJSON()));
    } catch (error) {
        console.error('Get rockets error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/rockets — save a new rocket
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, description, data } = req.body;
        const rocket = await Rocket.create({
            userId: req.auth!.userId,
            name,
            description: description || '',
            data: data || '',
            thumbnail: '',
        });
        res.json(rocket.toJSON());
    } catch (error) {
        console.error('Save rocket error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/rockets/:id — update a rocket (owner only)
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const rocket = await Rocket.findById(req.params.id);
        if (!rocket) {
            res.json({ success: false, error: 'Rocket not found' });
            return;
        }

        // Authorization: only the owner can edit their rocket
        if (rocket.userId !== req.auth!.userId && req.auth!.role !== 'admin') {
            res.status(403).json({ success: false, error: 'Access denied' });
            return;
        }

        const { name, description, data } = req.body;
        if (name !== undefined) rocket.name = name;
        if (description !== undefined) rocket.description = description;
        if (data !== undefined) rocket.data = data;
        rocket.updatedAt = new Date();
        await rocket.save();

        res.json({ success: true });
    } catch (error) {
        console.error('Update rocket error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// DELETE /api/rockets/:id — delete a rocket (owner or admin)
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const rocket = await Rocket.findById(req.params.id);
        if (!rocket) {
            res.json({ success: true }); // idempotent
            return;
        }
        if (rocket.userId !== req.auth!.userId && req.auth!.role !== 'admin') {
            res.status(403).json({ success: false, error: 'Access denied' });
            return;
        }
        await Rocket.deleteOne({ _id: req.params.id });
        res.json({ success: true });
    } catch (error) {
        console.error('Delete rocket error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
