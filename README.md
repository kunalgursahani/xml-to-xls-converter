# XML to XLS Converter

A web application that converts XML files to Excel (XLS) format. Built with Node.js, Express, and React.

## Features

- Upload XML files
- Convert XML to Excel format
- Download converted files
- Progress tracking during conversion
- Support for large files (up to 100MB)
- Modern and responsive UI

## Prerequisites

- Node.js (v18.0.0 or higher)
- npm (v6.0.0 or higher)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/xml-to-xls-converter.git
cd xml-to-xls-converter
```

2. Install dependencies:
```bash
# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

## Running the Application

1. Start the backend server:
```bash
npm run dev
```

2. In a new terminal, start the frontend:
```bash
cd client
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## Usage

1. Open your browser and navigate to http://localhost:3000
2. Click the upload area or drag and drop an XML file
3. Wait for the conversion to complete
4. The converted Excel file will be automatically downloaded

## Technologies Used

- Backend:
  - Node.js
  - Express
  - xml2js
  - xlsx
  - multer

- Frontend:
  - React
  - Material-UI
  - Axios

## License

MIT 