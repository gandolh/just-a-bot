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
      time: true, // prefix logs with timestamps
    },
    // --- dice-activity disabled for now ---
    // {
    //   name: "dice-activity",
    //   cwd: __dirname,
    //   script: "npm",
    //   args: "run dice-activity:start",
    //   autorestart: true,
    //   max_restarts: 10,
    //   restart_delay: 5000,
    //   time: true,
    // },
  ],
};
