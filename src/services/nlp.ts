/// <reference path="../types.d.ts" />
import { NlpManager } from 'node-nlp';
import { Command } from '../features/nlp/types';
import path from 'path';

class NLPService {
    private manager: any;
    private commands: Map<string, Command> = new Map();
    private isTrained: boolean = false;

    constructor() {
        this.manager = new NlpManager({ languages: ['en'], forceNER: true });
        // Register custom entities (e.g., regex for addresses)
        this.setupEntities();
    }

    private setupEntities() {
        // Hathor Address Regex Entity
        // Matches typical Hathor addresses starting with H or h and followed by alphanumeric chars
        // Using a regex like /^[Hh][a-zA-Z0-9]{33}$/ but nlp.js regex entity syntax varies slightly in usage
        // We use 'addRegexEntity'

        // Matches literal "HTR" or "Hathor" as currency
        this.manager.addNamedEntityText('currency', 'HTR', ['en'], ['HTR', 'Hathor']);

        // Regex for Hathor Address (Base58, lengths vary 32-35 chars, starts with W/w)
        this.manager.addRegexEntity('hathor_address', ['en'], /\b[Ww][a-zA-Z0-9]{31,34}\b/);
    }

    registerCommand(command: Command) {
        this.commands.set(command.intent, command);
    }

    async train() {
        if (this.isTrained) return;

        console.log('[NLP] Training model...');

        // Allow each command to register its training data
        for (const command of this.commands.values()) {
            command.train(this.manager);
        }

        // Add built-in generic fallback or "none" interactions if needed
        this.manager.addDocument('en', 'hello', 'greetings.hello');
        this.manager.addDocument('en', 'hi', 'greetings.hello');
        this.manager.addAnswer('en', 'greetings.hello', 'Hello! How can I help you regarding your Hathor wallet?');

        await this.manager.train();
        this.isTrained = true;
        console.log('[NLP] Model trained.');
    }

    async process(text: string) {
        if (!this.isTrained) await this.train();
        return this.manager.process('en', text);
    }

    getCommand(intent: string): Command | undefined {
        return this.commands.get(intent);
    }
}

export const nlpService = new NLPService();
