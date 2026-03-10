import mongoose from 'mongoose';

// Serverless-safe cached connection
// Module-level promise prevents duplicate connections during cold start race conditions
let connectionPromise: Promise<void> | null = null;

export function isConnected(): boolean {
    return mongoose.connection.readyState === 1;
}

export async function connectDB(): Promise<void> {
    // Already connected — reuse
    if (mongoose.connection.readyState === 1) return;

    // Connection in progress — wait for it
    if (connectionPromise) {
        await connectionPromise;
        return;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('🔌 Connecting to MongoDB Atlas...');

    connectionPromise = mongoose.connect(uri, {
        bufferCommands: false,      // CRITICAL for serverless: fail fast, don't buffer
        maxPoolSize: 5,             // keep small for serverless
        minPoolSize: 0,             // allow pool to drain on idle
        maxIdleTimeMS: 10000,       // close idle connections after 10s (Atlas kills at 60s)
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 30000,
        connectTimeoutMS: 15000,
    }).then(() => {
        console.log('✅ Connected to MongoDB Atlas (database: rocketstudio)');
    }).catch((err) => {
        console.error('❌ MongoDB connection failed:', err.message);
        connectionPromise = null;   // allow retry on next request
        throw err;
    });

    await connectionPromise;
}
