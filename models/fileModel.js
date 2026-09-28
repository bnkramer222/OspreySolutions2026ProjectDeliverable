// MODEL - File Management (Brandon)
// This is the Model in MVC.
// It is the only part of the app that knows where the files are saved.
// Files are stored on disk in uploads/pre and uploads/post.

const fs = require("fs");
// Loads Node's file tools. Used to make folders and read files.

const path = require("path");
// Loads Node's path tools. Builds file locations that work on any computer.

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
// The main uploads folder, inside the project.

const TYPES = ["pre", "post"];
// The two survey sections. Each one gets its own folder.
// To add a new section later, just add a word here.

// Create the upload folders if they don't exist
TYPES.forEach((type) =>
  fs.mkdirSync(path.join(UPLOAD_DIR, type), { recursive: true }),
);
// Makes uploads/pre and uploads/post when the app starts.
// recursive: true means no error if the folders are already there.

module.exports = {
  TYPES, // shared so other files can check if a type is "pre" or "post"
  UPLOAD_DIR, // shared so the upload route knows where to save files

  // List files in a section, newest first
  getAll(type) {
    const dir = path.join(UPLOAD_DIR, type); // the folder for this section, like uploads/pre
    return fs
      .readdirSync(dir) // gets every file name in the folder
      .map((name) => {
        const stats = fs.statSync(path.join(dir, name)); // gets the file's info
        return { name, size: stats.size, uploadedAt: stats.mtime }; // keeps the name, size and upload time
      })
      .sort((a, b) => b.uploadedAt - a.uploadedAt); // puts the newest file first
  },
  // Returns the list of files in one section.
  // The Controller uses this to show the files on the page.
  // The Reports page also uses this to find the pre and post files.

  // Full path to one file (basename blocks "../" tricks)
  getPath(type, name) {
    return path.join(UPLOAD_DIR, type, path.basename(name)); // builds the file's full location
  },
  // Returns where one file is saved, like uploads/pre/survey.csv.
  // Used when opening a file.
  // path.basename keeps only the file name, so nobody can
  // sneak in "../" to open files outside the uploads folder.
};
