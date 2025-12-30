import axios from 'axios';
import { config } from '../config';

const client = axios.create({
    baseURL: config.walletUrl,
    headers: {
        'X-Wallet-Id': config.walletId,
        'Content-Type': 'application/json',
    },
});

export const walletService = {
    /**
     * Get a new address from the wallet.
     * @returns The address string.
     */
    async getAddress(markAsUsed = true): Promise<string> {
        const response = await client.get('/wallet/address', {
            params: { mark_as_used: markAsUsed },
        });
        if (!response.data.address) {
            console.error('Wallet response:', response.data);
            throw new Error('Wallet did not return an address.');
        }
        return response.data.address;
    },

    /**
     * Send a transaction.
     * @param toAddress The destination address.
     * @param value The amount to send (integer, check decimals). User said "value * 100".
     * @param fromAddress The address to filter inputs.
     */
    async sendTransaction(toAddress: string, value: number, fromAddress: string) {
        const payload = {
            outputs: [
                {
                    address: toAddress,
                    value: Math.floor(value * 100), // Assuming 2 decimals as per request
                    token: '00', // HTR
                },
            ],
            inputs: [
                {
                    type: 'query',
                    filter_address: fromAddress,
                },
            ],
        };

        try {
            const response = await client.post('/wallet/send-tx', payload);
            return response.data;
        } catch (error: any) {
            if (error.response && error.response.data) {
                return error.response.data;
            }
            throw error;
        }
    },
};
