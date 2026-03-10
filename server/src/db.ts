import mongoose from 'mongoose';

// Serverless-safe cached connection
// Module-level variables persist across warm invocations in the same container
export async function connectDB(): Promise<void> {
    // Already connected or connecting
    if (mongoose.connection.readyState === 1) return;
    if (mongoose.connection.readyState === 2) {
        await new Promise<void>((resolve) => {
            mongoose.connection.once('connected', resolve);
        });
        return;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    await mongoose.connect(uri, {
        bufferCommands: true,
        maxPoolSize: 5,           // keep small for serverless
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB Atlas (database: rocketstudio)');
}
