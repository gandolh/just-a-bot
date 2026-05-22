import { fill, memeTextSquare } from './_styles.ts';

const BG_COLORS: Record<string, string> = {
  classic: '#000000',
  bonk: '#b5651d',
  'disaster-girl': '#8b0000',
};

export function memeSquareTemplate(props: { top: string; bottom: string; template: string }): Record<string, unknown> {
  const bg = BG_COLORS[props.template] ?? BG_COLORS.classic;
  return {
    type: 'div',
    props: {
      style: { ...fill, position: 'relative', background: bg },
      children: [
        {
          type: 'div',
          props: {
            style: { ...fill, alignItems: 'center', justifyContent: 'center' },
            children: {
              type: 'span',
              props: {
                style: { fontFamily: 'Anton', fontSize: 144, color: '#333', opacity: 0.15, textTransform: 'uppercase' },
                children: props.template,
              },
            },
          },
        },
        {
          type: 'div',
          props: { style: memeTextSquare('flex-start'), children: props.top },
        },
        {
          type: 'div',
          props: { style: memeTextSquare('flex-end'), children: props.bottom },
        },
      ],
    },
  };
}
