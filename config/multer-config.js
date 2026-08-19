const multer = require('multer');
const path = require('path');

const stockage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/documents/'));
  },
  filename: (req, file, cb) => {
    const nom = Date.now() + '-' + Math.round(Math.random()*1E9) + path.extname(file.originalname);
    cb(null, nom);
  }
});

const afichier = (req, file, cb) => {
  const autorises = /jpg|jpeg|png|pdf/;
  const extOk = autorises.test(path.extname(file.originalname).toLowerCase());
  if (extOk) cb(null, true);
  else cb(new Error('Seulement images JPG/PNG et PDF autorisés'));
};

const upload = multer({storage: stockage, fileFilter: aFichier});
module.exports = upload;