const bcrypt = require('bcryptjs');
const hash = '$2b$10$r94bHQtLRMMfqsYcMGLkvOLT46D8KDE22VwkdHNraoQ3OP2.1b0NS';
bcrypt.compare('password123', hash).then(res => console.log('Match:', res));
