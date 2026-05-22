import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { fonts } from './fonts.ts';

export async function renderToPng(
  node: Record<string, unknown>,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const svg = await satori(node as Parameters<typeof satori>[0], {
    width: opts.width,
    height: opts.height,
    fonts,
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: opts.width } });
  return resvg.render().asPng();
}
