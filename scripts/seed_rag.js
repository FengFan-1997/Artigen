const fs = require('fs');
const path = require('path');
const http = require('http');

const FILES_TO_EMBED = [
  path.join(__dirname, '../doc/read/agent.md'),
  path.join(__dirname, '../doc/read/docs/module3_intelligence_rag.md')
];

const API_URL = 'http://localhost:8080/api/embed';

const postData = (data) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/api/embed',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Status: ${res.statusCode}, Body: ${body}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(JSON.stringify(data));
    req.end();
  });
};

const chunkText = (text, maxLength = 1000) => {
  // Simple chunking by paragraphs or headers
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length > maxLength) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
    currentChunk += line + '\n';
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
};

const main = async () => {
  const documents = [];
  
  for (const file of FILES_TO_EMBED) {
    if (fs.existsSync(file)) {
      console.log(`Processing ${file}...`);
      const content = fs.readFileSync(file, 'utf-8');
      const chunks = chunkText(content);
      
      chunks.forEach((chunk, index) => {
        documents.push({
          id: `${path.basename(file)}-${index}`,
          text: chunk,
          metadata: { source: path.basename(file) }
        });
      });
    } else {
      console.warn(`File not found: ${file}`);
    }
  }

  if (documents.length > 0) {
    console.log(`Sending ${documents.length} documents to embed...`);
    try {
      const result = await postData({ documents });
      console.log('Success:', result);
    } catch (error) {
      console.error('Error embedding documents:', error.message);
    }
  } else {
    console.log('No documents to embed.');
  }
};

main();
