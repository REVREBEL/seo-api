module.exports = {
  apps: [
    {
      name: 'seo-api',
      script: 'src/index.js',
      cwd: '/home/seo-api',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
