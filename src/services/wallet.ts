import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

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
            logger.error(`Wallet response: ${JSON.stringify(response.data)}`);
            throw new Error('Wallet did not return an address.');
        }
        return response.data.address;
    },

    /**
     * Send a transaction.
     * @param toAddress The destination address.
     * @param value The amount to send (integer, check decimals). User said "value * 100".
     * @param fromAddress The address to filter inputs.
     * @param tokenId The token ID to send (default '00' for HTR).
     */
    async sendTransaction(toAddress: string, value: number, fromAddress: string, tokenId: string = '00') {
        const payload = {
            outputs: [
                {
                    address: toAddress,
                    value: Math.floor(value * 100), // Assuming 2 decimals as per request
                    token: tokenId,
                },
            ],
            inputs: [
                {
                    type: 'query',
                    filter_address: fromAddress,
                },
            ],
            change_address: fromAddress,
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

    /**
     * Get address info (balance).
     * @param address The address to check.
     */
    async getAddressInfo(address: string, token: string = '00') {
        try {
            const response = await client.get('/wallet/address-info', {
                params: { address, token },
            });
            return response.data;
        } catch (error: any) {
            logger.error(`Error fetching address info: ${error}`);
            return null;
        }
    },

    /**
     * Execute a Nano Contract method.
     * @param ncId The Nano Contract ID.
     * @param method The method to execute.
     * @param address The caller's address.
     * @param args The arguments for the method.
     * @param actions The actions (deposit/withdrawal) involved.
     */
    async executeNanoContract(ncId: string, method: string, address: string, args: any[], actions: any[]) {
        const payload = {
            nc_id: ncId,
            method,
            address,
            data: {
                actions: actions,
                args: args
            }
        };

        try {
            const response = await client.post('/wallet/nano-contracts/execute', payload);
            return { success: true, ...response.data };
        } catch (error: any) {
            logger.error(`Error executing Nano Contract: ${error.response?.data || error.message}`);
            if (error.response && error.response.data) {
                return { success: false, ...error.response.data };
            }
            return { success: false, error: error.message };
        }
    },
};
