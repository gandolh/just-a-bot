export const fill: Record<string, unknown> = {
  width: '100%',
  height: '100%',
  display: 'flex',
};

export const memeText = (align: 'flex-start' | 'flex-end'): Record<string, unknown> => ({
  position: 'absolute',
  left: 0,
  right: 0,
  ...(align === 'flex-start' ? { top: 12 } : { bottom: 12 }),
  display: 'flex',
  justifyContent: 'center',
  padding: '0 16px',
  fontFamily: 'Anton',
  fontSize: 52,
  fontWeight: 400,
  color: 'white',
  textShadow: '3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000',
  textAlign: 'center',
  textTransform: 'uppercase',
  lineHeight: 1.1,
});

export const memeTextSquare = (align: 'flex-start' | 'flex-end'): Record<string, unknown> => ({
  position: 'absolute',
  left: 0,
  right: 0,
  ...(align === 'flex-start' ? { top: 24 } : { bottom: 24 }),
  display: 'flex',
  justifyContent: 'center',
  padding: '0 32px',
  fontFamily: 'Anton',
  fontSize: 96,
  fontWeight: 400,
  color: 'white',
  textShadow: '5px 5px 0 #000, -5px 5px 0 #000, 5px -5px 0 #000, -5px -5px 0 #000',
  textAlign: 'center',
  textTransform: 'uppercase',
  lineHeight: 1.1,
});

export const cardContainer: Record<string, unknown> = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  padding: 40,
};
