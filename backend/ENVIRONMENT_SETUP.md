# Environment Configuration

This project uses separate environment files for development and production.

## Environment Files

- **`.env`** - Production environment (used when `NODE_ENV=production`)
- **`.env.development`** - Development environment (used when `NODE_ENV=development`)

## Running the Server

### Production Mode (uses `.env`)
```bash
# npm start always runs in production mode
npm start
```

### Development Mode (uses `.env.development`)
```bash
# npm dev runs in development mode with auto-reload
npm run dev
```

## Setup

1. Create `.env` file with your production credentials:
```env
NODE_ENV=production
PORT=4000
MONGODB_URI=your-production-mongodb-uri
JWT_SECRET=your-production-jwt-secret
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USERNAME=your-production-email
EMAIL_PASSWORD=your-production-password
EMAIL_FROM=SBA Pro-Life
PROTECTED_KEY=your-production-protected-key
```

2. Create `.env.development` file with your development credentials:
```env
NODE_ENV=development
PORT=4000
MONGODB_URI=your-development-mongodb-uri
JWT_SECRET=your-development-jwt-secret
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USERNAME=your-development-email
EMAIL_PASSWORD=your-development-password
EMAIL_FROM=SBA Admin (Dev)
PROTECTED_KEY=your-development-protected-key
```

## Important Notes

- **`npm start`** always runs in **production mode** and uses `.env`
- **`npm run dev`** runs in **development mode** and uses `.env.development`
- Never commit `.env` or `.env.development` files to git (they're in `.gitignore`)
- The server automatically loads the correct environment file based on `NODE_ENV`

