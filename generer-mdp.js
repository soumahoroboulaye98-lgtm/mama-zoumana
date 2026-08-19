const bcrypt = require('bcrypt');
bcrypt.hash('Admin2026!', 10, (err, hash) => {
  if (err) throw err;
  console.log('$2b$10$AqK86sRCKox8MD60u8GHHOJ0SMZxpTKMmajQlSh..bYPUw3qNqATy
');
  console.log(hash);
});   


