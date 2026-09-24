// MODEL - File Management (Brandon)
// Files are stored on disk in uploads/pre and uploads/post.
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const TYPES = ["pre", "post"];

// Create the upload folders if they don't exist
TYPES.forEach((type) =>
  fs.mkdirSync(path.join(UPLOAD_DIR, type), { recursive: true }),
);

module.exports = {
  TYPES,
  UPLOAD_DIR,

  // List files in a section, newest first
  getAll(type) {
    const dir = path.join(UPLOAD_DIR, type);
    return fs
      .readdirSync(dir)
      .map((name) => {
        const stats = fs.statSync(path.join(dir, name));
        return { name, size: stats.size, uploadedAt: stats.mtime };
      })
      .sort((a, b) => b.uploadedAt - a.uploadedAt);
  },

  // Full path to one file (basename blocks "../" tricks)
  getPath(type, name) {
    return path.join(UPLOAD_DIR, type, path.basename(name));
  },
};
