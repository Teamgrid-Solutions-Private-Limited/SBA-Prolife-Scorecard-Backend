const axios = require('axios');
const fs = require('fs');
const path = require('path');
 
class ImageDownloader {
  constructor() {
    this.basePath = path.join(__dirname, '../uploads');
   
  }
 
  async downloadImage(imageUrl, type, fileName) {
    try {
      const typeFolder = type === 'senator' ? 'senator' : 'house';
      const fullPath = path.join(this.basePath, 'photos', typeFolder);
      const filePath = path.join(fullPath, fileName);
     
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
 
      if (fs.existsSync(filePath)) {
        return `${fileName}`;

      }
     
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'stream',
        timeout: 30000,
      });
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
 
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          resolve(`${fileName}`);
        });
        writer.on('error', (error) => {
          console.error(`Error writing file ${filePath}:`, error);
          reject(error);
        });
      });
    } catch (error) {
      console.error(`Error downloading image from ${imageUrl}:`, error.message);
      return null;
    }
  }
 
  generateFileName(type, id, originalUrl) {
    try {
      const urlObj = new URL(originalUrl);
      const pathname = urlObj.pathname;
      const extension = path.extname(pathname) || '.jpg';
     
      const prefix = type === 'senator' ? 'senator' : 'rep';
      return `${prefix}-${id}${extension}`;
    } catch (error) {
      const extension = '.jpg';
      const prefix = type === 'senator' ? 'senator' : 'rep';
      return `${prefix}-${id}${extension}`;
    }
  }
}
 
module.exports = new ImageDownloader();
 