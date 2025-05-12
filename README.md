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

## Deployment to SAP Business Application Studio (BAS)

1. Open SAP Business Application Studio
2. Create a new Dev Space:
   - Choose "Full Stack Cloud Application" template
   - Select Node.js version 18
   - Click "Create Dev Space"

3. Clone your repository in BAS:
   ```bash
   git clone https://github.com/yourusername/xml-to-xls-converter.git
   cd xml-to-xls-converter
   ```

4. Install dependencies:
   ```bash
   npm install
   cd client
   npm install
   cd ..
   ```

5. Build the application:
   ```bash
   cd client
   npm run build
   cd ..
   ```

6. Deploy using MTA:
   ```bash
   mbt build
   cf deploy mta_archives/xml-to-xls-converter_1.0.0.mtar
   ```

7. After deployment:
   - Go to SAP BTP Cockpit
   - Navigate to your subaccount
   - Go to Security -> XSUAA
   - Find your xsuaa-service
   - Create Role Collection and assign roles:
     - `xml-to-xls-converter!t12345.Converter`
     - `xml-to-xls-converter!t12345.Uploader`
   - Assign the role collection to your user

8. Access your application:
   - The application will be available at the URL provided in the deployment output
   - Log in with your SAP BTP credentials

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