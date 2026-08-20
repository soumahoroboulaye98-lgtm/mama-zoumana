const multer = require('multer');
const path = require('path');

// ✅ Configuration du stockage
const stockage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/documents/'));
  },
  filename: (req, file, cb) => {
    // ✅ Nom unique : horodatage + nombre aléatoire + extension d'origine
    const nomUnique = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, nomUnique);
  }
});

// ✅ Filtre des types de fichiers autorisés
const filtreTypes = (req, file, cb) => {
  const autorises = /jpg|jpeg|png|pdf/;
  const extOk = autorises.test(path.extname(file.originalname).toLowerCase());
  
  if (extOk) {
    cb(null, true);
  } else {
    cb(new Error('⛔ Seuls les fichiers JPG, PNG et PDF sont autorisés'));
  }
};

// ✅ Configuration finale
const upload = multer({
  storage: stockage,
  fileFilter: filtreTypes,
  limits: {
    fileSize: 10 * 1024 * 1024 // 📦 Limite : 10 Mo par fichier
  }
});

module.exports = upload;