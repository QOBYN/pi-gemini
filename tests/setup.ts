import { setupServer } from 'msw/node';
import { defaultHandlers } from './helpers/msw-handlers.js';

export const mswServer = setupServer(...defaultHandlers);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
