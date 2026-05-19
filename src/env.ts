import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  CLIENT_ID: required('CLIENT_ID'),
  GUILD_ID: required('GUILD_ID'),
};
