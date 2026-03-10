import { Router, Request, Response } from 'express';
import { Rocket } from '../models/Rocket.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/rockets/all — all rockets (admin, list view without data)
router.get('/all', requireAdmin, async (_req: Request, res: Response) => {
    try {
        const rockets = await Rocket.find()
            .select('-data -thumbnail')
            .sort({ updatedAt: -1 });
        res.json(rockets.map(r => r.toJSON()));
    } catch (error) {
        console.error('Get all rockets error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/rockets — current user's rockets (list view, excludes bulky data field)
router.get('/', async (req: Request, res: Response) => {
    try {
        const rockets = await Rocket.find({ userId: req.auth!.userId })
            .select('-data -thumbnail')
            .sort({ updatedAt: -1 });
        res.json(rockets.map(r => r.toJSON()));
    } catch (error) {
        console.error('Get rockets error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Storage constants
const MAX_ROCKET_DATA_BYTES = 1_048_576; // 1 MB per rocket data field
const MAX_ROCKETS_PER_USER = 25;

// GET /api/rockets/:id — get a single rocket with full data (owner only)
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const rocket = await Rocket.findById(req.params.id);
        if (!rocket) {
            res.status(404).json({ error: 'Rocket not found' });
            return;
        }
        if (rocket.userId !== req.auth!.userId && req.auth!.role !== 'admin') {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        res.json(rocket.toJSON());
    } catch (error) {
        console.error('Get rocket error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
// POST /api/rockets — save a new rocket
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, description, data } = req.body;

        // ── Storage guards ──────────────────────────────────
        if (data && typeof data === 'string' && data.length > MAX_ROCKET_DATA_BYTES) {
            res.status(413).json({ error: `Rocket data too large (max 1 MB). Simplify the design or remove unused components.` });
            return;
        }

        const count = await Rocket.countDocuments({ userId: req.auth!.userId });
        if (count >= MAX_ROCKETS_PER_USER) {
            res.status(409).json({ error: `You can save up to ${MAX_ROCKETS_PER_USER} rockets. Delete an old one to save a new design.` });
            return;
        }
        // ────────────────────────────────────────────────────

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

        // Storage guard: 1 MB max
        if (data && typeof data === 'string' && data.length > MAX_ROCKET_DATA_BYTES) {
            res.status(413).json({ success: false, error: 'Rocket data too large (max 1 MB). Simplify the design or remove unused components.' });
            return;
        }

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
