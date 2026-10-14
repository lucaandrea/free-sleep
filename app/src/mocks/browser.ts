import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { platformHandlers } from './platformHandlers';

export const worker = setupWorker(...platformHandlers, ...handlers);

