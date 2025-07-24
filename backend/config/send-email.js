const nodemailer = require('nodemailer');
const config = require('../config/env'); // Make sure this loads your .env properly

const createGmailTransport = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.email.username,
      pass: config.email.password // App password, not Gmail login
    }
  });
};

const createCustomTransport = () => {
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465, // true for 465, false for 587
    auth: {
      user: config.email.username,
      pass: config.email.password
    }
  });
};

const sendEmail = async (options) => {
  // Exit early if email config is missing in development
  if (
    config.env === 'development' &&
    (!config.email.username || !config.email.password)
  ) {
    console.log('[DEV MODE] Email config not provided, skipping actual send.');
    return;
  }

  // Choose Gmail vs custom SMTP
  const transporter =
    config.email.host === 'smtp.gmail.com'
      ? createGmailTransport()
      : createCustomTransport();

  const message = {
    from: `"${config.email.from}" <${config.email.username}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.message.replace(/\n/g, '<br>')
  };

  try {
    await transporter.verify();
    const info = await transporter.sendMail(message);
    console.log('✅ Email sent:', info.messageId);
  } catch (error) {
    console.error('❌ Error sending email:', error);

    if (
      config.env === 'development' &&
      (error.code === 'EAUTH' || error.code === 'ESOCKET')
    ) {
      console.warn('[DEV MODE] Ignoring email failure due to config issue.');
      return;
    }

    throw new Error('Email could not be sent');
  }
};

module.exports = sendEmail;
