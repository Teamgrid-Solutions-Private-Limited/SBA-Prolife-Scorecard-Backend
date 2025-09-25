const nodemailer = require('nodemailer');
const config = require('../config/env'); 

const createGmailTransport = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.email.username,
      pass: config.email.password
    }
  });
};

const createCustomTransport = () => {
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465, 
    auth: {
      user: config.email.username,
      pass: config.email.password
    }
  });
};

const sendEmail = async (options) => {
  if (
    config.env === 'development' &&
    (!config.email.username || !config.email.password)
  ) {
    return;
  }
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
  } catch (error) {
    console.error(' Error sending email:', error);

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
