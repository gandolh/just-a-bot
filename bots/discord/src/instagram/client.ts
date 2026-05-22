import { logger } from '@bots/shared';

const log = logger.scoped('instagram');

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface IgConfig {
  userId: string;
  accessToken: string;
}

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

async function graphFetch<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json()) as T & GraphError;
  if (!res.ok || body.error) {
    const msg = body.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Instagram Graph API: ${msg}`);
  }
  return body;
}

export async function createMediaContainer(
  cfg: IgConfig,
  params: { imageUrl: string; caption?: string },
): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/${cfg.userId}/media`);
  url.searchParams.set('image_url', params.imageUrl);
  if (params.caption) url.searchParams.set('caption', params.caption);
  url.searchParams.set('access_token', cfg.accessToken);

  const body = await graphFetch<{ id: string }>(url.toString(), { method: 'POST' });
  log.debug('Created media container', body.id);
  return body.id;
}

export async function publishMedia(cfg: IgConfig, containerId: string): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/${cfg.userId}/media_publish`);
  url.searchParams.set('creation_id', containerId);
  url.searchParams.set('access_token', cfg.accessToken);

  const body = await graphFetch<{ id: string }>(url.toString(), { method: 'POST' });
  log.info('Published IG media', body.id);
  return body.id;
}

export async function getPermalink(cfg: IgConfig, mediaId: string): Promise<string | undefined> {
  const url = new URL(`${GRAPH_BASE}/${mediaId}`);
  url.searchParams.set('fields', 'permalink');
  url.searchParams.set('access_token', cfg.accessToken);

  try {
    const body = await graphFetch<{ permalink?: string }>(url.toString(), { method: 'GET' });
    return body.permalink;
  } catch (err) {
    log.warn('Failed to fetch permalink', err);
    return undefined;
  }
}

export async function postImage(
  cfg: IgConfig,
  params: { imageUrl: string; caption?: string },
): Promise<{ mediaId: string; permalink?: string }> {
  const containerId = await createMediaContainer(cfg, params);
  const mediaId = await publishMedia(cfg, containerId);
  const permalink = await getPermalink(cfg, mediaId);
  return { mediaId, permalink };
}
