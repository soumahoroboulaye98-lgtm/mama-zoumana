const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ==============================================
// ⚙️ CONFIGURATION MULTER — SÉCURISÉE
// ==============================================

// 📁 Dossier de stockage
const dossierUpload = path.join(__dirname, '../public/uploads/');
if (!fs.existsSync(dossierUpload)) {
  fs.mkdirSync(dossierUpload, { recursive: true, mode: 0o755 });
}

// ✅ TOUS les types de photos et documents autorisés
const TYPES_AUTORISES = {
  // 📸 Photos / Images
  'image/jpeg':   '.jpg',
  'image/jpg':    '.jpg',
  'image/png':    '.png',
  'image/gif':    '.gif',
  'image/webp':   '.webp',
  'image/bmp':    '.bmp',
  'image/tiff':   '.tiff',
  'image/svg+xml': '.svg',
  // 📄 Documents
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar'
};

const EXTENSIONS_AUTORISEES = Object.values(TYPES_AUTORISES);

// 📂 Configuration stockage
const stockage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, dossierUpload);
  },
  filename: (req, file, cb) => {
    const uid = Date.now() + '-' + Math.round(Math.random() * 1000000000);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uid}${ext}`);
  }
});

// 🛡️ Filtrage et validation
const filtreFichier = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const autorise = TYPES_AUTORISES[file.mimetype] && EXTENSIONS_AUTORISEES.includes(ext);
  
  if (autorise) {
    cb(null, true);
  } else {
    cb(new Error(`❌ Format refusé : ${file.originalname}. Formats acceptés : JPG, PNG, GIF, WEBP, PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, ZIP...`), false);
  }
};

// 🚀 Export final
const upload = multer({
  storage: stockage,
  fileFilter: filtreFichier,
  limits: {
    fileSize: 20 * 1024 * 1024,  // ✅ 20 Mo max par fichier
    files: 10                      // ✅ Jusqu'à 10 fichiers à la fois
  }
});

module.exports = upload;