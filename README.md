# SBA Prolife Scorecard Backend

This is the backend API for the SBA Prolife Scorecard project. It is built with Node.js, Express, and MongoDB (Mongoose), and provides secure endpoints for managing senators, representatives, terms, votes, activities, and user authentication.

The backend powers both the admin dashboard and the public scorecard frontend UI.

## Features

- **Senator & Representative Management**: CRUD operations for senators, representatives, and related data.
- **Scorecard Data**: Manage and retrieve voting and activity scores for senators and representatives.
- **Vote & Activity Management**: Create, update, and manage votes and activities with robust support for tracking legislative actions and participation.
- **User Authentication**: Secure endpoints with authentication middleware.
- **File Uploads**: Upload and manage documents and photos.
- **Bulk Operations**: Helpers for efficient bulk updates and data management.
- **Unified Platform**: Powers both the SBA Prolife Scorecard admin dashboard and the public scorecard frontend UI. All APIs are available to enable full control over both the dashboard and the frontend UI.

## User Roles & Permissions

The backend supports two main user roles: **Admin** and **Editor**.

- **Editor**:

  - Can view and save changes to senator, representative, vote, and activity data.
  - Cannot publish changes directly.
  - Cannot delete or fetch data from the Quorum system.
  - All changes made by editors require admin review before being published.

- **Admin**:
  - Has all editor permissions.
  - Can review and approve/reject changes made by editors.
  - Can publish changes, making them live for all users.
  - Can delete records and fetch data directly from the Quorum system.
  - Has full control over data management and publication workflow.

**Workflow:**

1. Editors make and save changes (drafts).
2. Admins review all pending changes.
3. Admins can approve and publish, or reject, any editor changes.
4. Only admins can perform destructive actions (delete, fetch from Quorum, publish to production).

## Project Structure

```
backend/
├── config/           # Configuration files (env, cache, email)
├── constants/        # Constant values and projections
├── controllers/      # Express route controllers for all entities
├── db/               # Database connection setup
├── helper/           # Helper utilities for bulk and support operations
├── middlewares/      # Express middlewares (auth, file upload, etc.)
├── models/           # Mongoose schemas and models
├── routes/           # Express route definitions
├── uploads/          # Uploaded files and documents
├── validate/         # Validation logic
├── cleanupActivities.js
├── cleanupVotes.js
├── package.json
├── server.js         # Main entry point
└── ...
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher recommended)
- MongoDB instance (local or remote)

### Installation

1. Clone the repository:
   ```sh
   git clone <repo-url>
   cd SBA-Prolife-Scorecard-Backend/backend
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Configure environment variables:
   Create a .env file (or configure config/env.js) with the following:

   ```
   # Server
   BASE_URL=http://localhost:3000
   PORT=3000

   # Database
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/sbaProlife

   # Auth
   JWT_SECRET=<your-strong-secret-key>
   PROTECTED_KEY=<internal-api-key>

   # Quorum API
   QUORUM_API_KEY=<your-quorum-api-key>
   QUORUM_USERNAME=<your-username>
   QUORUM_BASE_URL=https://www.quorum.us

   # API Endpoints (built from QUORUM_BASE_URL in code)
   # QUORUM_SENATOR_API = ${QUORUM_BASE_URL}/api/newperson/
   # QUORUM_REP_API = ${QUORUM_BASE_URL}/api/newperson/
   # BILL_API_URL = ${QUORUM_BASE_URL}/api/newbill/
   # VOTE_API_URL = ${QUORUM_BASE_URL}/api/vote/
   # SPONSOR_API_URL = ${QUORUM_BASE_URL}/api/newsponsor/

   # Email (SMTP)
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USERNAME=<your-email>
   EMAIL_PASSWORD=<your-email-app-password>
   EMAIL_FROM="SBA Pro-Life <sba@pro.org>"
   EMAIL_FROM_NAME="SBA-Scorecard-Admin"
   ```

4. Start the server:
   ```sh
   npm start
   ```
   The server will run on the port specified in your environment variables (default: 3000).

## API Endpoints

- All main API endpoints are defined in the `routes/` directory and handled by controllers in `controllers/`.
- Example endpoints:
  - `POST /api/senators` — Create a new senator
  - `GET /api/senators/:id` — Get senator details
  - `GET /api/senator-data/:id` — Get all data for a senator
  - `POST /api/votes` — Add a new vote
  - `POST /api/activities` — Add a new activity
  - `POST /api/auth/login` — User login

## Scripts

- `npm start` — Start the server
- `npm run cleanup:votes` — Run vote cleanup script
- `npm run cleanup:activities` — Run activity cleanup script

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/YourFeature`)
5. Create a new Pull Request

## Contact

For questions or support, please contact the SBA Prolife Scorecard Backend team.
