import bcrypt from 'bcryptjs';
import { User } from './models/User.js';

export async function seedDefaultAdmin(): Promise<void> {
    const existing = await User.findOne({ username: 'admin' });
    if (existing) {
        console.log('ℹ️  Default admin already exists');
        return;
    }

    const hash = await bcrypt.hash('Admin123!', 12);
    await User.create({
        username: 'admin',
        email: 'admin@2space.local',
        passwordHash: hash,
        role: 'admin',
        disabled: false,
        simulationCount: 0,
    });
    console.log('✅ Default admin user created (admin / Admin123!)');
}
