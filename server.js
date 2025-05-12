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
const passport = require('passport');
const xsenv = require('@sap/xsenv');
const xssec = require('@sap/xssec');
const cfenv = require('cfenv');

// Initialize express app
const app = express();
const appEnv = cfenv.getAppEnv();

// Middleware
app.use(cors());
app.use(express.json());

// Configure SAP BTP authentication
const services = xsenv.getServices({ xsuaa: { tag: 'xsuaa' } });
passport.use('JWT', new xssec.JWTStrategy(services.xsuaa));
app.use(passport.initialize());
app.use(passport.authenticate('JWT', { session: false }));

// Configure multer for file upload with size limits
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Sanitize filename
        const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, Date.now() + '-' + sanitizedFilename);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
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
            // Fix unescaped ampersands
            .replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;')
            // Fix spaces in closing tags
            .replace(/<\s*\/([^>]+)\s*>/g, '</$1>')
            // Fix spaces in opening tags
            .replace(/<\s*([^>]+)\s*>/g, '<$1>')
            // Remove extra whitespace
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .trim();

        // Ensure XML has a root element
        if (!xmlString.match(/<[^>]+>.*<\/[^>]+>/)) {
            xmlString = `<root>${xmlString}</root>`;
        }

        return xmlString;
    } catch (error) {
        console.error('Error cleaning XML:', error);
        throw new Error(`Error cleaning XML: ${error.message}`);
    }
}

// Function to parse XML with fallback options
async function parseXML(xmlData) {
    const parserOptions = [
        {
            explicitArray: false,
            ignoreAttrs: false,
            mergeAttrs: true,
            explicitChildren: false,
            explicitRoot: true,
            tagNameProcessors: [xml2js.processors.stripPrefix],
            valueProcessors: [xml2js.processors.parseBooleans, xml2js.processors.parseNumbers],
            strict: false,
            trim: true,
            normalize: true,
            normalizeTags: true,
            charkey: 'value'
        },
        {
            explicitArray: false,
            ignoreAttrs: true,
            mergeAttrs: false,
            explicitChildren: false,
            explicitRoot: true,
            strict: false,
            trim: true
        },
        {
            explicitArray: false,
            ignoreAttrs: true,
            mergeAttrs: false,
            explicitChildren: false,
            explicitRoot: false,
            strict: false,
            trim: true
        }
    ];

    let lastError = null;
    for (const options of parserOptions) {
        try {
            const parser = new xml2js.Parser(options);
            const result = await parser.parseStringPromise(xmlData);
            return result;
        } catch (error) {
            lastError = error;
            console.warn(`Parser attempt failed with options:`, options);
            continue;
        }
    }

    throw new Error(`All parser attempts failed. Last error: ${lastError.message}`);
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

// Convert XML to XLS with progress tracking
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
        // Function to process each node and create worksheets
        function processNode(node, parentPath = '') {
            if (typeof node === 'object' && node !== null) {
                Object.entries(node).forEach(([key, value]) => {
                    const currentPath = parentPath ? `${parentPath}_${key}` : key;
                    
                    if (Array.isArray(value)) {
                        // If it's an array, create a worksheet for it
                        const flattenedData = value.map(item => flattenObject(item));
                        const ws = XLSX.utils.json_to_sheet(flattenedData);
                        XLSX.utils.book_append_sheet(workbook, ws, currentPath);
                    } else if (typeof value === 'object') {
                        // Recursively process nested objects
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

// Upload endpoint with progress tracking
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

        // Create a progress tracking function
        const progressCallback = (progress, message) => {
            // In a real application, you might want to use WebSocket or Server-Sent Events
            // to send progress updates to the client
            console.log(`Progress: ${progress}% - ${message}`);
        };

        try {
            xlsFilePath = await convertXmlToXls(xmlFilePath, progressCallback);
        } catch (error) {
            await cleanupFiles([xmlFilePath]);
            throw error;
        }

        // Send the file
        res.download(xlsFilePath, path.basename(xlsFilePath), async (err) => {
            if (err) {
                console.error('Error sending file:', err);
            }
            // Clean up files after sending
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

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
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

// Start server with error handling
const port = process.env.PORT || 5000;
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please try a different port.`);
        process.exit(1);
    } else {
        console.error('Server error:', err);
    }
}); 