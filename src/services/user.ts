import { prisma } from '../db';
import { walletService } from './wallet';

export const userService = {
    async getOrCreateUser(telegramId: bigint) {
        // Check if user exists
        let user = await prisma.user.findUnique({
            where: { telegramId },
        });

        if (user) {
            return user;
        }

        // Assign a new address
        // Loop until we find an address that is not in the DB
        let address: string | null = null;
        let attempts = 0;
        while (!address && attempts < 10) { // Safety break
            const candidate = await walletService.getAddress(true);
            const exists = await prisma.user.findUnique({
                where: { address: candidate },
            });
            if (!exists) {
                address = candidate;
            }
            attempts++;
        }

        if (!address) {
            throw new Error('Failed to assign a unique address after multiple attempts.');
        }

        // Create user
        user = await prisma.user.create({
            data: {
                telegramId,
                address,
            },
        });

        console.log(`[User Service] New user created: ID=${telegramId}, Address=${address}`);

        return user;
    },

    async getUser(telegramId: bigint) {
        return prisma.user.findUnique({
            where: { telegramId },
        });
    }
};
