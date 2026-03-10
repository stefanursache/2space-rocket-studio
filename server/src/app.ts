import './types.js';
import express from 'express';
import cors from 'cors';
import { connectDB } from './db.js';
import { seedDefaultAdmin } from './seed.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import rocketRoutes from './routes/rockets.js';
import simulationRoutes from './routes/simulations.js';
import preferencesRoutes from './routes/preferences.js';
import configRoutes from './routes/config.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Lazy-init DB on first request (critical for serverless cold starts)
let dbReady = false;
app.use(async (_req, _res, next) => {
    if (!dbReady) {
        try {
            await connectDB();
            await seedDefaultAdmin();
            dbReady = true;
        } catch (err) {
            console.error('DB init error:', err);
        }
    }
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rockets', rocketRoutes);
app.use('/api/simulations', simulationRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/config', configRoutes);

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
