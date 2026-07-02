
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const morgan = require('morgan');
const winston = require('winston');
require('winston-daily-rotate-file');


const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200', // Render वरील फ्रंटएंड किंवा लोकलहोस्ट
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// 🚫 ब्राउझर कॅशिंग पूर्णपणे बंद करण्यासाठी मिडलवेअर (server.js मध्ये जोडा)
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // HTTP 1.1
    res.setHeader('Pragma', 'no-cache'); // HTTP 1.0
    res.setHeader('Expires', '0'); // Proxies साठी
    next();
});
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
app.use(bodyParser.json());

// 💡 हार्डकोडेड व्हॅल्यूज ऐवजी .env मधून डेटा घेणे
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const logDirectory = path.join(__dirname, 'logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }), // Error Stack Trace सेव्ह करण्यासाठी
        winston.format.json() // प्रॉडक्शमध्ये JSON फॉरमॅट सर्वोत्तम असतो
    ),
    transports: [
        // १. रोज नवीन एरर लॉग फाईल बनवणे
        new winston.transports.DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '30d' // ३० दिवसांनंतर जुने लॉग्स आपोआप डिलीट होतील
        }),
        // २. सर्व प्रकारचे लॉग्स (Info + Combined) ठेवण्यासाठी
        new winston.transports.DailyRotateFile({
            filename: 'logs/combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '14d'
        })
    ]
});

// जर डेव्हलपमेंट मोड असेल तर कन्सोलवरही लॉग्स दिसतील
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// 🌐 Morgan HTTP Request Logger (सर्व येणाऱ्या API Requests ट्रॅक करण्यासाठी)
// हे लॉग्स सुद्धा winston च्या combined फाईलमध्ये सेव्ह होतील
app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
}));

// ✅ नवीन सुरक्षित कोड (Auto-Reconnect Pool)
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// कनेक्शन तपासण्यासाठी छोटा टेस्ट
db.getConnection((err, connection) => {
    if (err) {
        console.error('Database Connection Pool Failed: ' + err.stack);
        return;
    }
    console.log('Connected to SQL Database via Pool.');
    connection.release(); // कनेक्शन मोकळे करा
});

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// --- PUBLIC ROUTES ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' });
        return res.json({ token });
    }
    res.status(401).json({ message: 'Invalid Credentials' });
});

app.get('/api/contacts', (req, res) => {
    db.query('SELECT * FROM contacts ORDER BY name ASC', (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

app.get('/api/departments', (req, res) => {
    db.query('SELECT * FROM departments ORDER BY name ASC', (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});
// विभाग (Department) डिलीट करण्याचा सुरक्षित API (With Constraint)
app.delete('/api/departments/:id', (req, res) => {
  const departmentId = req.params.id;

  // १. आधी या डिपार्टमेंटचे नाव काय आहे ते शोधू आणि त्यात काही कॉन्टॅक्ट्स आहेत का ते तपासू
  const checkQuery = `
    SELECT COUNT(*) AS contactCount 
    FROM contacts 
    WHERE department_name = (SELECT name FROM departments WHERE id = ?)
  `;

  db.query(checkQuery, [departmentId], (err, results) => {
    if (err) {
      console.error("डेटाबेस तपासताना एरर आला:", err);
      return res.status(500).json({ error: 'डेटाबेस सर्व्हरमध्ये काहीतरी त्रुटी आली आहे.' });
    }

    // जर निकालामध्ये काउंट ० पेक्षा जास्त असेल, तर डिलीट करू नका
    const contactCount = results[0]?.contactCount || 0;
    
    if (contactCount > 0) {
      return res.status(400).json({ 
        error: `या विभागामध्ये ${contactCount} संपर्क (Contacts) उपलब्ध आहेत! आधी ते डिलीट करा किंवा दुसऱ्या विभागात हलवा.` 
      });
    }

    // २. जर एकही कॉन्टॅक्ट नसेल, तरच डिपार्टमेंट सुरक्षितपणे डिलीट करा
    const deleteQuery = 'DELETE FROM departments WHERE id = ?';
    db.query(deleteQuery, [departmentId], (err, result) => {
      if (err) {
        console.error("विभाग डिलीट करताना एरर आला:", err);
        return res.status(500).json({ error: 'विभाग डिलीट करता आला नाही.' });
      }
      
      res.json({ message: 'विभाग यशस्वीरित्या डिलीट करण्यात आला आहे!' });
    });
  });
});


// --- ADMIN PROTECTED ROUTES ---

app.post('/api/departments', authenticateJWT, (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') {
        return res.status(400).json({ message: 'Department name cannot be empty' });
    }
    const query = 'INSERT INTO departments (name) VALUES (?)';
    db.query(query, [name.trim()], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ message: 'Department already exists.' });
            }
            return res.status(500).json(err);
        }
        res.json({ message: 'Department added successfully', id: result.insertId });
    });
});

// 💡 ५ नवीन फील्ड्ससाठी SQL INSERT रिप्लेसमेंट
app.post('/api/contacts', authenticateJWT, (req, res) => {
    const { department_name, designation, address, name, mobile_number, telephone_number, other_contact_1, other_contact_2, other_contact_3, other_contact_4, email } = req.body;
    const query = 'INSERT INTO contacts (department_name, designation, address, name, mobile_number, telephone_number,  email, other_contact_1, other_contact_2, other_contact_3, other_contact_4) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db.query(query, [department_name, designation, address, name, mobile_number, telephone_number, email, other_contact_1, other_contact_2, other_contact_3, other_contact_4], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Contact added successfully', id: result.insertId });
    });
});

// 💡 ५ नवीन फील्ड्ससाठी SQL UPDATE रिप्लेसमेंट
app.put('/api/contacts/:id', authenticateJWT, (req, res) => {
    const { id } = req.params;
    const {department_name, designation, address, name, mobile_number, telephone_number, email, other_contact_1, other_contact_2, other_contact_3, other_contact_4 } = req.body;
    const query = 'UPDATE contacts SET department_name=?, designation=?, address=?, name=?, mobile_number=?, telephone_number=?, email=?, other_contact_1=?, other_contact_2=?, other_contact_3=?, other_contact_4=? WHERE id=?';
    db.query(query, [department_name, designation, address, name, mobile_number, telephone_number, email, other_contact_1, other_contact_2, other_contact_3, other_contact_4, id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Contact updated successfully' });
    });
});

app.delete('/api/contacts/:id', authenticateJWT, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM contacts WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Contact deleted successfully' });
    });
});

// 💡 एकत्रित डेटा इम्पोर्ट (Bulk Insert) नवीन क्रमानुसार अपडेट
app.post('/api/bulk-import', authenticateJWT, (req, res) => {
    const { contacts } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ message: 'No contact data provided / डेटा उपलब्ध नाही.' });
    }

    db.query('SELECT name FROM departments', (deptErr, deptRows) => {
        if (deptErr) return res.status(500).json(deptErr);

        const validDepartments = new Set(deptRows.map(row => row.name.trim().toLowerCase()));
        const finalValues = [];
        let invalidDeptOccurred = false;
        let faultyDeptName = '';

        for (let i = 0; i < contacts.length; i++) {
            const c = contacts[i];
            const incomingDept = (c.department_name || '').trim().toLowerCase();

            if (incomingDept && !validDepartments.has(incomingDept)) {
                invalidDeptOccurred = true;
                faultyDeptName = c.department_name;
                break;
            }

            finalValues.push([
                c.department_name,
                c.designation || '-',
                c.address || '-',
                c.name,
                c.mobile_number || '-',
                c.telephone_number || '-',
                c.email || '-',
                c.other_contact_1 || '-',
                c.other_contact_2 || '-',
                c.other_contact_3 || '-',
                c.other_contact_4 || '-',
            ]);
        }

        if (invalidDeptOccurred) {
            return res.status(400).json({ 
                message: `Import rejected! The department "${faultyDeptName}" does not exist in the database.` 
            });
        }

        const query = 'INSERT INTO contacts (department_name, designation, address, name, mobile_number, telephone_number, email, other_contact_1, other_contact_2, other_contact_3, other_contact_4) VALUES ?';
        db.query(query, [finalValues], (insertErr, result) => {
            if (insertErr) return res.status(500).json(insertErr);
            res.json({ message: `${result.affectedRows} contacts successfully imported!` });
        });
    });
});

// फ्रंटएंड कडून येणारे एरर्स लॉग फाईलमध्ये सेव्ह करण्यासाठी API
app.post('/api/logs/frontend-error', (req, res) => {
    const { message, stack, url } = req.body;
    
    logger.error({
        source: 'FRONTEND_ANGULAR_APP',
        message: message,
        stack: stack,
        clientUrl: url,
        ip: req.ip
    });
    
    res.status(200).json({ status: 'Logged successfully' });
});


// 🚨 Global Error Handling Middleware (हा कोड server.js मध्ये सर्वात शेवटी app.listen च्या वर असावा)
app.use((err, req, res, next) => {
    // बॅकएंडमध्ये कुठेही एरर आल्यास तो 'logs/error-DATE.log' फाईलमध्ये अचूक वेळेसह आणि लाईन नंबरसह (Stack Trace) सेव्ह होईल
    logger.error({
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    });

    res.status(500).json({ 
        message: 'Something went wrong on the server! / सर्व्हरमध्ये त्रुटी आढळली आहे.' 
    });
});


const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));