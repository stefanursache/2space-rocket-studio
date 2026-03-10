import { Router, Request, Response } from 'express';
import { Simulation } from '../models/Simulation.js';
import { User } from '../models/User.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/simulations/all — all simulations (admin) — must be before /:id
router.get('/all', requireAdmin, async (_req: Request, res: Response) => {
    try {
        const sims = await Simulation.find().sort({ createdAt: -1 });
        res.json(sims.map(s => s.toJSON()));
    } catch (error) {
        console.error('Get all simulations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/simulations — current user's simulations
router.get('/', async (req: Request, res: Response) => {
    try {
        const sims = await Simulation.find({ userId: req.auth!.userId }).sort({ createdAt: -1 });
        res.json(sims.map(s => s.toJSON()));
    } catch (error) {
        console.error('Get simulations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/simulations — save a simulation
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, rocketName, data } = req.body;
        const sim = await Simulation.create({
            userId: req.auth!.userId,
            name,
            rocketName: rocketName || '',
            data: data || '',
        });

        // Increment user's simulation count
        await User.findByIdAndUpdate(req.auth!.userId, { $inc: { simulationCount: 1 } });

        res.json(sim.toJSON());
    } catch (error) {
        console.error('Save simulation error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/simulations/:id — delete a simulation (owner or admin)
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const sim = await Simulation.findById(req.params.id);
        if (sim) {
            // Authorization: only owner or admin can delete
            if (sim.userId !== req.auth!.userId && req.auth!.role !== 'admin') {
                res.status(403).json({ success: false, error: 'Access denied' });
                return;
            }
            await Simulation.deleteOne({ _id: req.params.id });
            await User.findByIdAndUpdate(sim.userId, { $inc: { simulationCount: -1 } });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Delete simulation error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
