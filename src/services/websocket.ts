import WebSocket from 'ws';
import { config } from '../config';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { logger } from '../utils/logger';

export class WebSocketService {
    private ws: WebSocket | null = null;
    private reconnectInterval: NodeJS.Timeout | null = null;
    private isConnected = false;

    start() {
        const url = `ws://${config.wsHost}:${config.wsPort}/v1/ws`;
        logger.info(`[WebSocket] Connecting to ${url}...`);

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            logger.info('[WebSocket] Connected');
            this.isConnected = true;
            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;
            }
        });

        this.ws.on('message', async (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString());
                await this.handleMessage(message);
            } catch (err) {
                logger.error(`[WebSocket] Error parsing message: ${err}`);
            }
        });

        this.ws.on('error', (err) => {
            logger.error(`[WebSocket] Connection error: ${err.message}`);
        });

        this.ws.on('close', () => {
            logger.info('[WebSocket] Disconnected. Reconnecting in 5s...');
            this.isConnected = false;
            this.scheduleReconnect();
        });
    }

    private scheduleReconnect() {
        if (!this.reconnectInterval) {
            this.reconnectInterval = setInterval(() => {
                if (!this.isConnected) {
                    this.start();
                }
            }, 5000);
        }
    }

    private async handleMessage(message: any) {
        if (!message || message.type !== 'wallet:new-tx') return;

        logger.info(`[WebSocket] New Transaction detected: ${message.data?.tx_id}`);

        const outputs = message.data?.outputs || [];

        for (const output of outputs) {
            if (output.token === '00' || !output.decoded?.address) continue;

            const address = output.decoded.address;
            const tokenId = output.token;

            try {
                // Find user owning this address
                const user = await prisma.user.findUnique({
                    where: { address: address }
                });

                if (user) {
                    logger.info(`[WebSocket] Found user for address ${address}. Adding token ${tokenId}...`);

                    // Ensure token metadata exists before creating association (FK constraint)
                    await this.ensureTokenMetadata(tokenId);

                    // Add token to UserToken table
                    try {
                        await prisma.userToken.create({
                            data: {
                                userId: user.telegramId,
                                tokenId: tokenId
                            }
                        });
                        logger.info(`[WebSocket] Token ${tokenId} associated with User ${user.telegramId}`);
                    } catch (e: any) {
                        // Check if error is unique constraint violation (P2002)
                        if (e.code === 'P2002') {
                            // Token already exists for this user, ignore
                            logger.info(`[WebSocket] Token ${tokenId} already exists for User ${user.telegramId}`);
                        } else {
                            logger.error(`[WebSocket] Failed to add token ${tokenId}: ${e}`);
                        }
                    }
                }
            } catch (err) {
                logger.error(`[WebSocket] Error processing output: ${err}`);
            }
        }
    }

    private async ensureTokenMetadata(tokenId: string) {
        try {
            // Check if token exists
            const existing = await prisma.token.findUnique({ where: { id: tokenId } });
            if (existing) return;

            logger.info(`[WebSocket] Fetching metadata for new token ${tokenId}...`);
            const url = `${config.fullnodeUrl}/v1a/transaction?id=${tokenId}`;
            const response = await axios.get(url);

            if (response.data && response.data.success && response.data.tx) {
                const tx = response.data.tx;
                const name = tx.token_name || 'Unknown';
                const symbol = (tx.token_symbol || 'UNK');

                await prisma.token.create({
                    data: {
                        id: tokenId,
                        name: name,
                        symbol: symbol
                    }
                });
                logger.info(`[WebSocket] Metadata stored for token ${symbol} (${name})`);
            } else {
                logger.error(`[WebSocket] Failed to fetch metadata for token ${tokenId}`);
            }

        } catch (error) {
            // Ignore duplicate insert errors (race conditions)
            if ((error as any).code !== 'P2002') {
                logger.error(`[WebSocket] Error fetching token metadata: ${error}`);
            }
        }
    }
}

export const websocketService = new WebSocketService();
