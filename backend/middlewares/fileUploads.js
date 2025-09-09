 


// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');

// // Set up storage
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     let uploadPath = './uploads/'; // Default upload directory

//     // Check if the file is an image or document, and set the appropriate upload path
//     if (file.mimetype.startsWith('image/')) {
//       uploadPath = './uploads/photos/'; // Store images in the "photos/" folder
//     } else if (
//       file.mimetype === 'application/pdf' || 
//       file.mimetype === 'application/msword' || 
//       file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
//     ) {
//       uploadPath = './uploads/documents/'; // Store documents in the "documents/" folder
//     }

//     // Check if the directory exists, if not, create it
//     if (!fs.existsSync(uploadPath)) {
//       fs.mkdirSync(uploadPath, { recursive: true }); // Create the directory if it doesn't exist
//     }

//     cb(null, uploadPath); // Set the destination folder dynamically based on file type
//   },
//   filename: (req, file, cb) => {
//     cb(null,file.originalname); // Add timestamp to the filename to avoid conflicts
//   }
// });

// // Filter to allow only images or documents
// const fileFilter = (req, file, cb) => {
//   console.log('File Mimetype:', file.mimetype); // Log the file mimetype for debugging

//   const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg']; // Allowed image file types
//   const allowedDocumentTypes = [
//     'application/pdf', 
//     'application/msword', 
//     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
//   ]; // Allowed document file types

//   // Check if file is an image or document
//   if (
//     allowedImageTypes.includes(file.mimetype) || 
//     allowedDocumentTypes.includes(file.mimetype)
//   ) {
//     cb(null, true); // Allow the file to be uploaded
//   } else {
//     cb(new Error('Only .jpg, .jpeg, .png, .pdf, .doc, and .docx files are allowed'), false); // Reject unsupported files
//   }
// };

// // Initialize multer with storage and file filter
// const upload = multer({ storage, fileFilter });

// module.exports = upload;



const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Set up storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = './uploads/'; // Default upload directory

    if (file.mimetype.startsWith('image/')) {
      uploadPath = './uploads/photos/'; // Default image folder

      // Determine subdirectory based on query parameter
      const subdirectory = req.query.type === 'house' ? 'house' : 'senator';
      uploadPath = path.join(uploadPath, subdirectory);

    } else if (
      file.mimetype === 'application/pdf' || 
      file.mimetype === 'text/html' ||
      file.mimetype === 'application/msword' || 
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      uploadPath = './uploads/documents/'; // Store documents in "documents/"
    }

    // Ensure the directory exists
    fs.mkdirSync(uploadPath, { recursive: true }); // Creates directory if it doesn’t exist

    cb(null, uploadPath); // Set the destination folder dynamically
  },
  filename: (req, file, cb) => {
    // Generate unique filename to avoid overwriting
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`); // Example: 1708234567890-12345678.png
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  console.log('Uploading File Type:', file.mimetype); // Debugging

  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg' ];
  const allowedDocumentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/html",
  ];

  // Allow images and documents only
  if (allowedImageTypes.includes(file.mimetype) || allowedDocumentTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only .jpg, .jpeg, .png, .pdf, .doc, and .docx files are allowed'), false);
  }
};

// Initialize multer with storage and file filter
 
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});


module.exports = upload;

