module.exports = {
  apps: [
    {
      name: "discord",
      cwd: __dirname,
      script: "npm",
      args: "run discord:start",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // pm2 SIGKILLs 1.6 s after SIGINT by default, which cut the shutdown's
      // state flush off (bounded at 3 s in bots/discord/src/index.ts).
      kill_timeout: 5000,
      time: true, // prefix logs with timestamps
    },
  ],
};
