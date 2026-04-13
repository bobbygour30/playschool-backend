const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Function to upload base64 string to cloudinary
const uploadToCloudinary = async (file, folder) => {
  try {
    if (!file) return null;
    
    // If file is already a URL or empty string
    if (typeof file === 'string' && (file.startsWith('http') || file === '')) {
      return file;
    }
    
    // Upload base64 string directly
    const result = await cloudinary.uploader.upload(file, {
      folder: `playschool/${folder}`,
      resource_type: 'auto',
    });
    
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return null;
  }
};

// Function to delete file from cloudinary
const deleteFromCloudinary = async (url) => {
  try {
    if (!url || !url.includes('cloudinary')) return;
    
    // Extract public ID from URL
    const parts = url.split('/');
    const filename = parts.pop().split('.')[0];
    const folder = parts.slice(-2).join('/');
    const publicId = `${folder}/${filename}`;
    
    await cloudinary.uploader.destroy(publicId);
    console.log(`Deleted from Cloudinary: ${publicId}`);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
  }
};

// Function to upload buffer/file to cloudinary (alternative method)
const uploadBufferToCloudinary = async (buffer, folder, options = {}) => {
  try {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `playschool/${folder}`,
          resource_type: 'auto',
          ...options
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result.secure_url);
        }
      );
      
      // Convert buffer to stream and pipe to cloudinary
      const Readable = require('stream').Readable;
      const readableStream = new Readable();
      readableStream.push(buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  } catch (error) {
    console.error('Cloudinary buffer upload error:', error);
    return null;
  }
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  deleteFromCloudinary,
  uploadBufferToCloudinary,
};