const cloudinary = require('cloudinary').v2;

const getOptimizedUrl = (url, options = {}) => {
  if (!url || !url.includes('cloudinary')) return url;
  
  const transformations = [];
  
  if (options.width) transformations.push(`w_${options.width}`);
  if (options.height) transformations.push(`h_${options.height}`);
  if (options.quality) transformations.push(`q_${options.quality}`);
  if (options.format) transformations.push(`f_${options.format}`);
  
  if (transformations.length === 0) return url;
  
  const parts = url.split('/upload/');
  return `${parts[0]}/upload/${transformations.join(',')}/${parts[1]}`;
};

module.exports = { getOptimizedUrl };