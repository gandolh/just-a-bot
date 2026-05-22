import { cardContainer } from './_styles.ts';

export function cardSquareTemplate(props: { title: string; body: string }): Record<string, unknown> {
  return {
    type: 'div',
    props: {
      style: { ...cardContainer, padding: 80 },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'Inter',
              fontWeight: 700,
              fontSize: 88,
              color: '#e2e8f0',
              textAlign: 'center',
              marginBottom: 40,
              lineHeight: 1.2,
            },
            children: props.title,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'Inter',
              fontWeight: 400,
              fontSize: 44,
              color: '#94a3b8',
              textAlign: 'center',
              lineHeight: 1.5,
            },
            children: props.body,
          },
        },
      ],
    },
  };
}
