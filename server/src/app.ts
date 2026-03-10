import './types.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB, isConnected } from './db.js';
import { seedDefaultAdmin } from './seed.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import rocketRoutes from './routes/rockets.js';
import simulationRoutes from './routes/simulations.js';
import preferencesRoutes from './routes/preferences.js';
import configRoutes from './routes/config.js';
import workspaceRoutes from './routes/workspaces.js';

const app = express();

// ---- Security middleware ----

// Security headers (XSS, clickjacking, MIME sniffing, HSTS, etc.)
app.use(helmet());

// CORS — allow only your frontend origin(s)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (curl, server-to-server, same-origin)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            // Return false instead of throwing — prevents stack trace leak
            callback(null, false);
        }
    },
    credentials: true,
}));

// Rate limiting — auth endpoints get tighter limits
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 30,                    // 30 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later' },
});
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests' },
});
app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

app.use(express.json({ limit: '2mb' }));

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
app.use('/api/workspaces', workspaceRoutes);

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

// Global error handler — prevent stack trace leaks
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

export default app;
