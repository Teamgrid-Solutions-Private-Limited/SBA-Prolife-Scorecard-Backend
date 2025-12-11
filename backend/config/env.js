const path = require('path');

// environment-specific .env file
// .env = production, .env.development = development
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, '..', envFile) });

const config = {
  development: {
    env: 'development',
    email: {
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT, 10) || 587,
      username: process.env.EMAIL_USERNAME,
      password: process.env.EMAIL_PASSWORD,
      from: process.env.EMAIL_FROM || 'SBA Admin (Dev)'
    }
  },
  production: {
    env: 'production',
    email: {
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT, 10) || 587,
      username: process.env.EMAIL_USERNAME,
      password: process.env.EMAIL_PASSWORD,
      from: process.env.EMAIL_FROM || 'SBA Pro-Life'
    }
  }
};

const environment = process.env.NODE_ENV || 'development';
module.exports = config[environment];
