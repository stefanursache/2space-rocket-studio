import './types.js';
import express from 'express';
import cors from 'cors';
import { connectDB, isConnected } from './db.js';
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

// Ensure DB is connected on EVERY request (critical for serverless)
// Connections can drop between warm invocations — always verify
let seeded = false;
app.use(async (_req, res, next) => {
    try {
        // Always check real connection state, not just a flag
        if (!isConnected()) {
            await connectDB();
        }
        if (!seeded) {
            await seedDefaultAdmin();
            seeded = true;
        }
    } catch (err: any) {
        console.error('DB init error:', err);
        res.status(503).json({
            success: false,
            error: 'Database connection failed. Check MONGODB_URI.',
            details: err.message,
        });
        return;
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

// Health check with diagnostics
import mongoose from 'mongoose';
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        db: {
            state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
            readyState: mongoose.connection.readyState,
            hasUri: !!process.env.MONGODB_URI,
        },
    });
});

export default app;
