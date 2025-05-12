const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xml2js = require('xml2js');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

// Initialize express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, Date.now() + '-' + sanitizedFilename);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/xml' || file.mimetype === 'application/xml') {
            cb(null, true);
        } else {
            cb(new Error('Only XML files are allowed'));
        }
    }
});

// Function to clean and fix XML
async function cleanAndFixXML(xmlString) {
    try {
        // Remove BOM and invalid characters
        xmlString = xmlString.replace(/^\uFEFF/, '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');

        // Fix common XML issues
        xmlString = xmlString
            .replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;')
            .replace(/<\s*\/([^>]+)\s*>/g, '</$1>')
            .replace(/<\s*([^>]+)\s*>/g, '<$1>')
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .trim();

        if (!xmlString.match(/<[^>]+>.*<\/[^>]+>/)) {
            xmlString = `<root>${xmlString}</root>`;
        }

        return xmlString;
    } catch (error) {
        console.error('Error cleaning XML:', error);
        throw new Error(`Error cleaning XML: ${error.message}`);
    }
}

// Function to parse XML
async function parseXML(xmlData) {
    const parser = new xml2js.Parser({
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true,
        explicitChildren: false,
        explicitRoot: true,
        strict: false,
        trim: true
    });

    try {
        return await parser.parseStringPromise(xmlData);
    } catch (error) {
        throw new Error(`Error parsing XML: ${error.message}`);
    }
}

// Function to flatten nested objects
function flattenObject(obj, prefix = '') {
    return Object.keys(obj).reduce((acc, k) => {
        const pre = prefix.length ? prefix + '_' : '';
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
            Object.assign(acc, flattenObject(obj[k], pre + k));
        } else {
            acc[pre + k] = obj[k];
        }
        return acc;
    }, {});
}

// Convert XML to XLS
async function convertXmlToXls(xmlFilePath, progressCallback) {
    try {
        progressCallback(10, 'Reading XML file...');
        let xmlData = await readFileAsync(xmlFilePath, 'utf8');

        progressCallback(20, 'Cleaning XML data...');
        xmlData = await cleanAndFixXML(xmlData);

        progressCallback(30, 'Parsing XML...');
        const result = await parseXML(xmlData);

        progressCallback(50, 'Creating Excel workbook...');
        const workbook = XLSX.utils.book_new();

        progressCallback(60, 'Processing data...');
        function processNode(node, parentPath = '') {
            if (typeof node === 'object' && node !== null) {
                Object.entries(node).forEach(([key, value]) => {
                    const currentPath = parentPath ? `${parentPath}_${key}` : key;
                    
                    if (Array.isArray(value)) {
                        const flattenedData = value.map(item => flattenObject(item));
                        const ws = XLSX.utils.json_to_sheet(flattenedData);
                        XLSX.utils.book_append_sheet(workbook, ws, currentPath);
                    } else if (typeof value === 'object') {
                        processNode(value, currentPath);
                    }
                });
            }
        }

        processNode(result);
        
        progressCallback(80, 'Writing Excel file...');
        const outputPath = xmlFilePath.replace('.xml', '.xlsx');
        XLSX.writeFile(workbook, outputPath);

        progressCallback(100, 'Conversion complete!');
        return outputPath;
    } catch (error) {
        console.error('Error converting XML to XLS:', error);
        throw new Error(`Error processing XML: ${error.message}`);
    }
}

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

// Upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    const cleanupFiles = async (files) => {
        for (const file of files) {
            try {
                await unlinkAsync(file);
            } catch (error) {
                console.error(`Error deleting file ${file}:`, error);
            }
        }
    };

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const xmlFilePath = req.file.path;
        let xlsFilePath = null;

        const progressCallback = (progress, message) => {
            console.log(`Progress: ${progress}% - ${message}`);
        };

        try {
            xlsFilePath = await convertXmlToXls(xmlFilePath, progressCallback);
        } catch (error) {
            await cleanupFiles([xmlFilePath]);
            throw error;
        }

        res.download(xlsFilePath, path.basename(xlsFilePath), async (err) => {
            if (err) {
                console.error('Error sending file:', err);
            }
            await cleanupFiles([xmlFilePath, xlsFilePath]);
        });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ 
            error: error.message || 'Error processing file',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Catch-all handler
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        error: err.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Start server
const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 