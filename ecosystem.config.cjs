const path = require("path");

module.exports = {
  apps: [
    {
      name: 'seo-api',  
      script: path.join(__dirname, 'src/index.js'),  
      cwd: __dirname,
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


