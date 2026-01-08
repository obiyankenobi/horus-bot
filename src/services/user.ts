import { prisma } from '../db';
import { walletService } from './wallet';
import axios from 'axios';
import { logger } from '../utils/logger';
import { User } from '@prisma/client';

export const userService = {
    async getOrCreateUser(telegramId: bigint, username?: string | null): Promise<{ user: User, created: boolean }> {
        // Check if user exists
        let user = await prisma.user.findUnique({
            where: { telegramId },
        });

        if (user) {
            // Update username if provided and different
            if (username && user.username !== username) {
                user = await prisma.user.update({
                    where: { telegramId },
                    data: { username }
                });
            }
            return { user, created: false };
        }

        // Assign a new address
        // Loop until we find an address that is not in the DB
        let address: string | null = null;
        let attempts = 0;
        while (!address && attempts < 50) { // Safety break
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
                username
            },
        });

        logger.info(`[User Service] New user created: ID=${telegramId}, Address=${address}, Username=${username}`);

        return { user, created: true };
    },

    async getUser(telegramId: bigint) {
        return prisma.user.findUnique({
            where: { telegramId },
        });
    },

    async getIdByUsername(username: string): Promise<bigint | null> {
        const user = await prisma.user.findFirst({
            where: { username: username }
        });
        return user ? user.telegramId : null;
    },

    async resolveIdFromApi(username: string): Promise<bigint | null> {
        const url = `https://www.gettg.id/api/search?username=${username}`;

        logger.info(`[User Service] Resolving external username: ${username}`);

        for (let i = 0; i < 5; i++) {
            try {
                const response = await axios.get(url);
                const data = response.data;

                if (data.status === 'success' && data.data) {
                    try {
                        const userData = JSON.parse(data.data);
                        if (userData.id) {
                            return BigInt(userData.id);
                        }
                    } catch (parseError) {
                        logger.error(`[User Service] Failed to parse gettg.id data: ${parseError}`);
                    }
                }

                // If pending or other status, wait and retry
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                logger.error(`[User Service] API Request failed: ${error}`);
                // Continue retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        return null;
    }
};
