import { User } from '../src/models/index.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

(async () => {
  try {
    const password = 'admin123'; // default password, change as needed
    const hashed = await bcrypt.hash(password, 10);
    // Upsert user with ID 5
    const [user, created] = await User.findOrCreate({
      where: { id: 5 },
      defaults: {
        id: 5,
        name: 'Gaurav Sharma',
        email: 'gparas287@gmail.com',
        password: hashed,
        role: 'Admin',
        department: 'Management',
        status: 'Active',
        avatar: 'GS',
        lastLogin: new Date().toISOString(),
        isVerified: true,
      },
    });
    if (created) {
      console.log('Admin user created successfully.');
    } else {
      console.log('Admin user already exists.');
    }
    process.exit(0);
  } catch (err) {
    console.error('Error adding admin user:', err);
    process.exit(1);
  }
})();
