import axios, { AxiosError, type AxiosAdapter } from 'axios';
import { getResponse } from 'msw/utils/get-response';
import type { RequestHandler } from 'msw';

// Resolve the same demo handlers in-process. Unhandled requests fail locally and never reach a saved Pod address.
export function createDemoAdapter(handlers: RequestHandler[], origin: string): AxiosAdapter {
  return async config => {
    const requested = new URL(axios.getUri(config), origin);
    const url = new URL(`${requested.pathname}${requested.search}`, origin);
    const method = (config.method || 'GET').toUpperCase();
    const request = new Request(url, { method, headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'HEAD' ? undefined : config.data });
    const mocked = await getResponse(handlers, request, { baseUrl: origin });
    const response = { data: mocked ? await mocked.text() : JSON.stringify({ error: { message: 'This action is unavailable in the demo.' } }),
      status: mocked?.status ?? 404, statusText: mocked?.statusText ?? 'Not found', config,
      headers: { 'content-type': mocked?.headers.get('content-type') ?? 'application/json' } };
    if (response.status >= 400) throw new AxiosError('Demo request failed', AxiosError.ERR_BAD_REQUEST, config, undefined, response);
    return response;
  };
}
